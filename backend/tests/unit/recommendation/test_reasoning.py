"""Translatable reasoning: every template key + params reproduces the engine's English exactly,
the English is unchanged from before keys existed, and REASONING_KEYS.md (what the frontend
translates from) matches the code."""

import json
import re
from pathlib import Path

import pytest

from app.analysis.types import Gap
from app.recommendation import reasoning
from app.recommendation.engine import (
    ACTION_VOCABULARY,
    PRESENCE_CLOSURE_RANK,
    PROMINENCE_CLOSURE_RANK,
    recommend,
)
from app.recommendation.reasoning import INTENT_EXAMPLE, TEMPLATES, placeholders, render, render_reasoning

HERE = Path(__file__).resolve().parent
KEYS_MD = Path(reasoning.__file__).resolve().parent / "REASONING_KEYS.md"
NAMES = {"self": "Gajanan Vada Pav", "comp-a": "Ashok Vada Pav"}
# Captured from the engine *before* the template refactor: one case per template key.
GOLDEN = json.loads((HERE / "reasoning_golden.json").read_text(encoding="utf-8"))


def _build(case):
    gap = Gap(case["gap_type"], tuple(f"o{i}" for i in range(case["evidence_count"])), case["detail"])
    return reasoning.build(
        case["action"], gap, "Gajanan Vada Pav", NAMES, case["evidence_count"], case["changed_count"], case["delta"],
        presence_rank=PRESENCE_CLOSURE_RANK, prominence_rank=PROMINENCE_CLOSURE_RANK,
    )


@pytest.mark.parametrize("case", GOLDEN, ids=lambda c: f"{c['gap_type']}-{c['action']}")
def test_english_is_unchanged_and_renders_from_key_and_params(case):
    text, key, params = _build(case)
    assert text == case["text"]
    assert render_reasoning(key, params) == case["text"]
    # every sentence renders from exactly the params given (nothing hidden in the English)
    for k in (key, params["action_key"], params["assumption_key"]):
        assert placeholders(k) <= set(params)
    assert all(isinstance(v, (str, int, float)) and not isinstance(v, bool) for v in params.values())


def test_golden_cases_cover_every_reachable_key():
    used = set()
    for case in GOLDEN:
        _, key, params = _build(case)
        used |= {key, params["action_key"], params["assumption_key"]}
    assert set(TEMPLATES) - used == {"finding.generic"}


def test_generic_finding_and_intentless_use_case_page():
    key, params = reasoning.finding(Gap("mystery", ("o",), {}), "B", {}, 1)  # type: ignore[arg-type]
    assert key == "finding.generic" and render(key, params) == "A mystery gap was detected for B."
    gap = Gap("presence", ("o",), {"scope": "intent", "intent_type": "", "coverage": 0.0})
    key, params = reasoning.action_sentence("use_case_page", gap, "B", {})
    assert key == "action.use_case_page"


def test_every_vocabulary_action_has_a_sentence():
    gap = Gap("presence", ("o",), {"scope": "overall"})
    for action in ACTION_VOCABULARY:
        key, params = reasoning.action_sentence(action, gap, "B", {})
        assert key in TEMPLATES and params["action"] == action
    with pytest.raises(KeyError):
        reasoning.action_sentence("run_a_tv_ad", gap, "B", {})


def test_render_needs_every_param():
    with pytest.raises(KeyError):
        render("finding.competitive", {"brand": "B"})


def test_percentages_round_like_the_original_format():
    gap = Gap("competitive", ("o",), {"competitor_id": "c", "co_occurrence_rate": 0.305, "beat_rate": 0.125})
    _, params = reasoning.finding(gap, "B", {}, 1)
    assert (params["co_occurrence_pct"], params["beat_pct"]) == (int(f"{0.305 * 100:.0f}"), int(f"{0.125 * 100:.0f}"))


def test_engine_recommendations_round_trip():
    from tests.unit.recommendation.test_engine import COMPS, MATRIX, OBS, SELF
    from tests.unit.recommendation.test_engine import NAMES as ENGINE_NAMES

    recs = recommend([g for _, g, _ in MATRIX], OBS, SELF, COMPS, entity_names=ENGINE_NAMES, max_recommendations=100)
    assert recs
    for rec in recs:
        assert render_reasoning(rec.reasoning_key, rec.reasoning_params) == rec.reasoning
        assert rec.reasoning_key.startswith("finding.")
        assert rec.reasoning_params["action_key"].startswith("action.")
        assert rec.reasoning_params["assumption_key"].startswith("assumption.")


# --------------------------------------------------------------------------- REASONING_KEYS.md

_ROW = re.compile(r"^\| `(?P<key>[a-z_.]+)` \| `(?P<template>[^`]+)` \| (?P<params>[^|]+) \|$")


def _md_rows():
    rows = {}
    for line in KEYS_MD.read_text(encoding="utf-8").splitlines():
        m = _ROW.match(line.strip())
        if m and "." in m["key"]:
            rows[m["key"]] = (m["template"], m["params"].strip())
    return rows


def test_keys_file_matches_the_templates_exactly():
    rows = _md_rows()
    assert {k: t for k, (t, _) in rows.items()} == TEMPLATES


def test_keys_file_lists_the_params_each_template_uses():
    for key, (_, params) in _md_rows().items():
        listed = set() if params == "(none)" else {p.strip() for p in params.split(",")}
        assert listed == placeholders(key), key


def test_keys_file_lists_the_intent_examples():
    text = KEYS_MD.read_text(encoding="utf-8")
    for intent, example in INTENT_EXAMPLE.items():
        assert f"| `{intent}` | `{example}` |" in text
