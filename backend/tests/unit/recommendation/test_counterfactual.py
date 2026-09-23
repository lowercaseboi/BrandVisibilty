from __future__ import annotations

import copy

from app.analysis.types import Gap, Observation
from app.recommendation.counterfactual import simulate_closure

SELF_ID = "brand-1"
COMPETITOR_ID = "comp-a"


def _observations(n=10):
    return [
        Observation(observation_id=f"o{i}", query_id=f"q{i}", provider_id="gemini", mentions=(), intent_type="")
        for i in range(n)
    ]


def test_presence_closure_produces_positive_delta():
    observations = _observations(10)
    gap = Gap(
        gap_type="presence",
        evidence_refs=tuple(o.observation_id for o in observations),
        detail={"scope": "overall", "coverage": 0.0},
    )

    result = simulate_closure(gap, observations, SELF_ID, frozenset({COMPETITOR_ID}))

    assert result.delta_composite > 0
    assert result.closure_field == "coverage"


def test_presence_closure_does_not_mutate_input():
    observations = _observations(10)
    snapshot = copy.deepcopy(observations)
    gap = Gap(
        gap_type="presence",
        evidence_refs=tuple(o.observation_id for o in observations),
        detail={"scope": "overall", "coverage": 0.0},
    )

    simulate_closure(gap, observations, SELF_ID, frozenset({COMPETITOR_ID}))

    assert observations == snapshot


def test_representation_gap_has_no_closer_and_zero_delta():
    observations = _observations(5)
    gap = Gap(
        gap_type="representation",
        evidence_refs=tuple(o.observation_id for o in observations),
        detail={"disagreement_rate": 0.6, "disagree_with_each_other": True, "distinct_claim_sets": []},
    )

    result = simulate_closure(gap, observations, SELF_ID, frozenset({COMPETITOR_ID}))

    assert result.delta_composite == 0.0
    assert 0.0 <= result.confidence <= 1.0


def test_source_gap_has_no_closer_and_zero_delta():
    observations = _observations(5)
    gap = Gap(
        gap_type="source",
        evidence_refs=("s1", "s2"),
        detail={"dominant_source_count": 5, "non_mentioning_count": 2},
    )

    result = simulate_closure(gap, observations, SELF_ID, frozenset({COMPETITOR_ID}))

    assert result.delta_composite == 0.0
