"""Recommendations v2: measured opportunity, gap-reality confidence, ranking, prior updates."""

from __future__ import annotations

import pytest

from app.analysis.gap_detector import detect_gaps
from app.analysis.mention_detector import detect_mentions
from app.analysis.types import EntityAlias, Gap, Observation
from app.analysis.visibility import MetricConfig, compute_visibility
from app.recommendation import opportunity as opp
from app.recommendation.engine import recommend_detailed

ALIASES = (
    EntityAlias("self", "self", ("Gajanan Vada Pav",)),
    EntityAlias("ashok", "competitor", ("Ashok Vada Pav",)),
    EntityAlias("goli", "competitor", ("Goli Vada Pav",)),
)
COMPS = frozenset({"ashok", "goli"})
NAMES = {"self": "Gajanan Vada Pav", "ashok": "Ashok Vada Pav", "goli": "Goli Vada Pav"}
CFG = MetricConfig(n_bootstrap=100)

WITHOUT = "1. Ashok Vada Pav\n2. Goli Vada Pav\n"
WITH_LOW = "1. Ashok Vada Pav\n2. Goli Vada Pav\n3. Gajanan Vada Pav\n"


def _answers(texts_by_question: dict[str, list[str]], provider: str = "gemini") -> list[dict]:
    out = []
    for qi, (q, texts) in enumerate(sorted(texts_by_question.items())):
        for si, text in enumerate(texts):
            out.append({
                "observation_id": f"{provider}:q{qi}-s{si}", "query_id": f"q{qi}", "query_text": q,
                "provider_id": provider, "model_version": f"{provider}-1",
                "intent_type": "local_contextual" if qi % 2 else "category_discovery", "response_text": text,
            })
    return out


def _observations(answers: list[dict]) -> list[Observation]:
    return [
        Observation(a["observation_id"], a["query_id"], a["provider_id"],
                    detect_mentions(a["response_text"], ALIASES), a["intent_type"])
        for a in answers
    ]


@pytest.fixture
def absent_brand():
    """Named in 1 of 24 answers, competitors in all of them."""
    texts = {f"question {i}": [WITHOUT] * 3 for i in range(8)}
    texts["question 0"] = [WITH_LOW, WITHOUT, WITHOUT]
    answers = _answers(texts)
    metrics = compute_visibility(answers, ALIASES, "self", COMPS, cfg=CFG, seed_basis="r")
    return answers, metrics, _observations(answers)


def test_presence_opportunity_is_the_gap_to_the_typical_competitor(absent_brand):
    _, metrics, _ = absent_brand
    gap = Gap("presence", ("x",), {"scope": "overall", "coverage": 1 / 24})
    o = opp.opportunity(metrics["cells"], gap, "self", COMPS)
    # Ashok 100 and Goli 63.1 in every answer -> median target 81.5; self ~0.
    assert o["target_vi"] == pytest.approx(81.5465, abs=1e-3)
    assert o["self_vi_scope"] == pytest.approx(100 * 0.5 / 24, abs=1e-4)
    assert 75 < o["opportunity_vi"] < o["target_vi"]
    assert o["scope_share"] == 1.0


def test_competitive_opportunity_targets_that_competitor(absent_brand):
    _, metrics, _ = absent_brand
    gap = Gap("competitive", ("x",), {"competitor_id": "goli", "co_occurrence_rate": 0.1, "beat_rate": 1.0})
    o = opp.opportunity(metrics["cells"], gap, "self", COMPS)
    assert o["target_vi"] == pytest.approx(63.093, abs=1e-3)


def test_scoped_presence_gap_only_counts_its_cells(absent_brand):
    _, metrics, _ = absent_brand
    gap = Gap("presence", ("x",), {"scope": "intent", "intent_type": "local_contextual", "coverage": 0.0})
    o = opp.opportunity(metrics["cells"], gap, "self", COMPS)
    assert o["scope_share"] == 0.5


def test_unscored_gap_types_have_no_opportunity_or_probability(absent_brand):
    _, metrics, _ = absent_brand
    gap = Gap("representation", ("p0",), {"disagreement_rate": 0.6})
    assert opp.opportunity(metrics["cells"], gap, "self", COMPS)["opportunity_vi"] == 0.0
    assert opp.gap_probability(metrics["cells"], gap, "self") is None


def test_a_clear_gap_is_almost_certainly_real_and_seeded(absent_brand):
    _, metrics, _ = absent_brand
    gap = Gap("presence", ("x",), {"scope": "overall", "coverage": 1 / 24})
    p = opp.gap_probability(metrics["cells"], gap, "self", n_bootstrap=200)
    assert p >= 0.9  # only resamples that draw question 0 three or more times exceed 10%
    assert p == opp.gap_probability(metrics["cells"], gap, "self", n_bootstrap=200)


def test_a_borderline_gap_is_less_certain():
    texts = {f"question {i}": [WITHOUT, WITHOUT, WITHOUT] for i in range(10)}
    for i in (0, 3):
        texts[f"question {i}"] = [WITH_LOW, WITH_LOW, WITHOUT]  # 4 of 30 named: presence 0.13
    metrics = compute_visibility(_answers(texts), ALIASES, "self", COMPS, cfg=CFG, seed_basis="r")
    gap = Gap("presence", ("x",), {"scope": "overall", "coverage": 0.13})
    assert 0.2 < opp.gap_probability(metrics["cells"], gap, "self", n_bootstrap=300) < 0.8


def test_engine_v2_ranks_by_measured_gain_and_keeps_traceability(absent_brand):
    _, metrics, observations = absent_brand
    gaps = detect_gaps(observations, "self", COMPS)
    result = recommend_detailed(gaps, observations, "self", COMPS, entity_names=NAMES, metrics_v2=metrics, mde=3.0)
    recs = result.passed
    assert recs and all(r.gap_id for r in recs)
    for r in recs:
        if r.expected_gain_vi:
            assert r.expected_gain_vi <= r.opportunity_vi
            assert r.expected_gain_vi == pytest.approx(r.opportunity_vi * r.uptake_prior, abs=0.01)
            assert r.confidence_method == "bootstrap_gap_holds"
            assert r.below_mde == (r.expected_gain_vi < 3.0)
            assert r.reasoning_params["assumption_key"].startswith("assumption.opportunity")
    by_gap: dict[str, list] = {}
    for r in recs:
        by_gap.setdefault(r.gap_id, []).append(r)
    # Two actions on one gap no longer share one gain: the assumed uptake differs.
    assert any(len({r.expected_gain_vi for r in rs}) > 1 for rs in by_gap.values() if len(rs) > 1)
    priorities = [r.priority for r in recs]
    assert priorities == sorted(priorities, reverse=True)


def test_engine_v2_is_independent_of_gap_order(absent_brand):
    _, metrics, observations = absent_brand
    gaps = detect_gaps(observations, "self", COMPS)
    a = recommend_detailed(gaps, observations, "self", COMPS, metrics_v2=metrics).passed
    b = recommend_detailed(list(reversed(gaps)), observations, "self", COMPS, metrics_v2=metrics).passed
    assert a == b


def test_engine_without_metrics_is_unchanged_v1(absent_brand):
    _, _, observations = absent_brand
    gaps = detect_gaps(observations, "self", COMPS)
    recs = recommend_detailed(gaps, observations, "self", COMPS).passed
    assert all(r.expected_gain_vi is None and r.confidence_method == "evidence_count" for r in recs)


def test_calibrated_priors_shrink_towards_measured_uptake():
    outcomes = [
        {"action": "submit_to_directory", "opportunity_vi": 10.0, "measured_delta": 0.0},
        {"action": "submit_to_directory", "opportunity_vi": 10.0, "measured_delta": 1.0},
        {"action": "unknown", "opportunity_vi": 10.0, "measured_delta": 5.0},
        {"action": "faq_page", "opportunity_vi": 0.0, "measured_delta": 5.0},
    ]
    priors = opp.calibrated_priors(outcomes)
    assert priors["submit_to_directory"] == pytest.approx((3 * 0.25 + 0.0 + 0.1) / 5)
    assert priors["faq_page"] == opp.UPTAKE_PRIOR["faq_page"]
    assert opp.calibrated_priors([]) == opp.UPTAKE_PRIOR
