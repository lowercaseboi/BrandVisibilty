"""Visibility Index (metrics v2)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.analysis.list_parser import Placement
from app.analysis.types import EntityAlias
from app.analysis.visibility import (
    SLOT_WEIGHTS,
    MetricConfig,
    build_cells,
    compute_visibility,
    place_answer,
    question_key,
    visibility_metrics,
    weight,
)

ANSWERS = Path(__file__).resolve().parents[2] / "fixtures" / "answers"
ALIASES = (
    EntityAlias("self", "self", ("Gajanan Vada Pav", "Gajanan")),
    EntityAlias("ashok", "competitor", ("Ashok Vada Pav",)),
    EntityAlias("goli", "competitor", ("Goli Vada Pav",)),
)
COMPETITORS = frozenset({"ashok", "goli"})
CFG = MetricConfig(n_bootstrap=200)


def _answer(oid: str, text: str, *, q: str = "best vada pav", provider: str = "p1", intent: str = "local") -> dict:
    return {
        "observation_id": oid,
        "query_text": q,
        "provider_id": provider,
        "model_version": f"{provider}-m",
        "intent_type": intent,
        "response_text": text,
    }


def _vi(answers: list[dict], eid: str = "self") -> float:
    return compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG)["entities"][eid]["vi"]


LIST_SELF_3 = "1. Ashok Vada Pav\n2. Goli Vada Pav\n3. Gajanan Vada Pav\n"
LIST_SELF_1 = "1. Gajanan Vada Pav\n2. Ashok Vada Pav\n3. Goli Vada Pav\n"
LIST_NO_SELF = "1. Ashok Vada Pav\n2. Goli Vada Pav\n"


def test_slot_weights_are_frozen_dcg():
    assert SLOT_WEIGHTS[0] == 1.0 and SLOT_WEIGHTS[2] == 0.5
    assert list(SLOT_WEIGHTS) == sorted(SLOT_WEIGHTS, reverse=True)


def test_weight_rules():
    assert weight(Placement("listed", 3, False), CFG) == 0.5
    assert weight(Placement("listed", 25, False), CFG) == SLOT_WEIGHTS[-1]  # capped at slot 10
    assert weight(Placement("unlisted", None, False), CFG) == 0.2
    assert weight(Placement("listed", 1, True), CFG) == 0.25
    assert weight(Placement("prose", 2, False), CFG) == SLOT_WEIGHTS[1]


def test_absent_everywhere_scores_zero_with_a_rule_of_three_bound():
    answers = [_answer(f"p1:q{i}-s0", LIST_NO_SELF, q=f"question {i}") for i in range(10)]
    m = compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG)
    assert m["entities"]["self"]["vi"] == 0.0
    assert m["entities"]["self"]["ci"] == [0.0, 30.0]  # 3 / 10 questions
    assert m["low_information"] is True


def test_is_unconditional_a_single_top_mention_stays_small():
    """v1's flaw: one first-place mention in 20 answers made prominence 1.0. VI stays 5."""
    answers = [_answer(f"p1:q{i}-s0", LIST_NO_SELF, q=f"question {i}") for i in range(19)]
    answers.append(_answer("p1:q19-s0", LIST_SELF_1, q="question 19"))
    assert _vi(answers) == pytest.approx(5.0)


def test_monotone_more_mentions_and_higher_slots_never_lower_vi():
    base = [_answer(f"p1:q{i}-s0", LIST_NO_SELF, q=f"question {i}") for i in range(4)]
    added = [*base[:3], _answer("p1:q3-s0", LIST_SELF_3, q="question 3")]
    moved_up = [*base[:3], _answer("p1:q3-s0", LIST_SELF_1, q="question 3")]
    assert _vi(base) < _vi(added) < _vi(moved_up)


def test_decomposition_identity():
    answers = [
        _answer("p1:q0-s0", LIST_SELF_1, q="a"),
        _answer("p1:q1-s0", LIST_SELF_3, q="b"),
        _answer("p1:q2-s0", LIST_NO_SELF, q="c"),
    ]
    e = compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG)["entities"]["self"]
    assert e["vi"] == pytest.approx(100 * e["presence"] * e["mean_weight_named"], abs=1e-4)


def test_entity_named_in_the_question_is_excluded_for_that_question():
    answers = [
        _answer("p1:q0-s0", "1. Ashok Vada Pav\n2. Goli Vada Pav\n", q="alternatives to Ashok Vada Pav"),
        _answer("p1:q1-s0", LIST_NO_SELF, q="best vada pav"),
    ]
    m = compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG)
    excluded_cell = next(c for c in m["cells"] if c["q"] == question_key("alternatives to Ashok Vada Pav"))
    assert excluded_cell["excluded"] == ["ashok"] and "ashok" not in excluded_cell["e"]
    assert m["entities"]["ashok"]["answers"] == 1
    assert m["entities"]["ashok"]["vi"] == 100.0


def test_share_of_recommendations_and_position():
    answers = [_answer("p1:q0-s0", LIST_SELF_3), _answer("p1:q0-s1", LIST_SELF_3)]
    m = compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG)
    vis = {k: v["vi"] for k, v in m["entities"].items()}
    assert m["share_of_recommendations"]["value"] == pytest.approx(vis["self"] / sum(vis.values()), abs=1e-6)
    assert m["market_position"]["rank"] == 3 and m["market_position"]["of"] == 3


def test_head_to_head_counts_wins_and_losses_per_answer():
    answers = [_answer("p1:q0-s0", LIST_SELF_1), _answer("p1:q0-s1", LIST_SELF_3), _answer("p1:q0-s2", "Nothing.")]
    h2h = compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG)["head_to_head"]["ashok"]
    assert (h2h["wins"], h2h["losses"]) == (1, 1)  # the empty answer is a tie, not counted


def test_clarifying_questions_lower_the_answer_rate():
    answers = [_answer("p1:q0-s0", LIST_NO_SELF), _answer("p1:q0-s1", "Which city are you in?")]
    m = compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG)
    assert m["answer_rate"] == 0.5


def test_question_reach_named_and_reliable():
    answers = [
        _answer("p1:q0-s0", LIST_SELF_1, q="a"), _answer("p1:q0-s1", LIST_SELF_1, q="a"),
        _answer("p1:q1-s0", LIST_SELF_1, q="b"), _answer("p1:q1-s1", LIST_NO_SELF, q="b"),
        _answer("p1:q1-s2", LIST_NO_SELF, q="b"),
        _answer("p1:q2-s0", LIST_NO_SELF, q="c"),
    ]
    reach = compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG)["question_reach"]
    assert reach == {"named": 2, "reliable": 1, "of": 3}


def test_cells_alone_reproduce_the_metrics():
    answers = [
        _answer(f"{p}:q{i}-s{s}", [LIST_SELF_1, LIST_SELF_3, LIST_NO_SELF][(i + s) % 3], q=f"q{i}", provider=p)
        for p in ("p1", "p2") for i in range(5) for s in range(3)
    ]
    full = compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG, seed_basis="run-1")
    questions = {q: {"text": v["text"], "intent": v["intent"]} for q, v in full["per_question"].items()}
    again = visibility_metrics(full["cells"], questions, "self", COMPETITORS, CFG, "run-1")
    for key, value in again.items():
        assert full[key] == value, key


def test_same_inputs_same_numbers():
    answers = [_answer(f"p1:q{i}-s0", LIST_SELF_3 if i % 2 else LIST_NO_SELF, q=f"q{i}") for i in range(8)]
    a = compute_visibility(answers, ALIASES, "self", COMPETITORS, cfg=CFG, seed_basis="r")
    b = compute_visibility(list(reversed(answers)), ALIASES, "self", COMPETITORS, cfg=CFG, seed_basis="r")
    assert a == b


def test_config_hash_tracks_every_knob():
    assert MetricConfig().config_hash() == MetricConfig().config_hash()
    assert MetricConfig().config_hash() != MetricConfig(unlisted_weight=0.1).config_hash()


def test_question_key_ignores_case_whitespace_and_trailing_punctuation():
    assert question_key("Best  vada pav?") == question_key("best vada pav")


def test_real_answer_is_placed():
    text = (ANSWERS / "gemini_category_bullets.md").read_text(encoding="utf-8")
    placed = place_answer(_answer("gemini:q8-s2", text, q="alternatives to Aaram Vada Pav"), ALIASES, CFG)
    assert placed.structured and placed.answered
    assert placed.placements["self"] == Placement("listed", 9, False)
    assert placed.weights["self"] == SLOT_WEIGHTS[8]


def test_build_cells_is_keyed_by_question_provider_and_model():
    placed = [
        place_answer(_answer("p1:q0-s0", LIST_SELF_1), ALIASES, CFG),
        place_answer(_answer("p2:q0-s0", LIST_SELF_1, provider="p2"), ALIASES, CFG),
    ]
    cells = build_cells(placed, "self", COMPETITORS)
    assert [(c["provider"], c["model"]) for c in cells] == [("p1", "p1-m"), ("p2", "p2-m")]
