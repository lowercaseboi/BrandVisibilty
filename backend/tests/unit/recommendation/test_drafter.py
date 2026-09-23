from __future__ import annotations

from app.analysis.types import Gap, Observation
from app.collection.types import CollectionResult, QuotaState, SamplingParams
from app.recommendation.drafter import draft_recommendations
from app.recommendation.identity import gap_id as compute_gap_id
from app.recommendation.types import ObservedOnly, Recommendation

SELF_ID = "brand-1"
COMPETITOR_ID = "comp-a"


class StubLLMProvider:
    """Deterministic stand-in — no network, same pattern as querysets/test_generator.py."""

    def __init__(self):
        self.calls: list[str] = []

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        self.calls.append(prompt)
        return CollectionResult(
            source_id="stub",
            source_kind="llm",
            model_version="stub-1",
            payload="[llm narrated reasoning]",
            latency_ms=1,
        )

    def quota_state(self) -> QuotaState:
        return QuotaState(remaining_today=None, daily_limit=None)


def _observations(n=10):
    return [
        Observation(observation_id=f"o{i}", query_id=f"q{i}", provider_id="gemini", mentions=(), intent_type="")
        for i in range(n)
    ]


def _gaps(observations):
    obs_ids = tuple(o.observation_id for o in observations)
    return [
        Gap(gap_type="presence", evidence_refs=obs_ids, detail={"scope": "overall", "coverage": 0.0}),
        Gap(gap_type="prominence", evidence_refs=obs_ids[:5], detail={"coverage": 0.5, "mean_rank": 4.2}),
        Gap(
            gap_type="competitive",
            evidence_refs=obs_ids[:3],
            detail={"competitor_id": COMPETITOR_ID, "co_occurrence_rate": 0.4, "beat_rate": 0.8},
        ),
        Gap(
            gap_type="representation",
            evidence_refs=obs_ids[:2],
            detail={"disagreement_rate": 0.6, "disagree_with_each_other": True, "distinct_claim_sets": []},
        ),
        # source gaps reference source_ids, never real observation_ids — this gap is
        # expected to fail validation and come back as ObservedOnly.
        Gap(gap_type="source", evidence_refs=("s1", "s2"), detail={"dominant_source_count": 5, "non_mentioning_count": 2}),
    ]


def test_deterministic_path_produces_recommendation_per_resolvable_gap():
    observations = _observations()
    gaps = _gaps(observations)

    results = draft_recommendations(gaps, observations, SELF_ID, frozenset({COMPETITOR_ID}))

    recs = [r for r in results if isinstance(r, Recommendation)]
    observed_only = [r for r in results if isinstance(r, ObservedOnly)]
    assert len(recs) == 4  # presence, prominence, competitive, representation
    assert len(observed_only) == 1  # source — its evidence isn't a real observation_id
    assert all(not r.narrated_by_llm for r in recs)
    for rec, gap in zip(recs, gaps[:4]):
        assert rec.gap_id == compute_gap_id(gap)
        assert rec.gap_id  # non-null (AC-7)


def test_source_gap_becomes_observed_only_with_reason():
    observations = _observations()
    gaps = _gaps(observations)

    results = draft_recommendations(gaps, observations, SELF_ID, frozenset({COMPETITOR_ID}))

    source_result = results[-1]
    assert isinstance(source_result, ObservedOnly)
    assert "not resolvable" in source_result.reason


def test_llm_narration_does_not_change_gap_id_or_evidence_refs():
    observations = _observations()
    gaps = _gaps(observations)

    deterministic = draft_recommendations(gaps, observations, SELF_ID, frozenset({COMPETITOR_ID}))
    stub = StubLLMProvider()
    narrated = draft_recommendations(
        gaps, observations, SELF_ID, frozenset({COMPETITOR_ID}), llm_provider=stub
    )

    det_recs = [r for r in deterministic if isinstance(r, Recommendation)]
    nar_recs = [r for r in narrated if isinstance(r, Recommendation)]
    # Narration runs before the validation gate, so the LLM is called once per gap
    # (including the one that ends up ObservedOnly), not once per surviving Recommendation.
    assert len(stub.calls) == len(gaps)
    for det, nar in zip(det_recs, nar_recs):
        assert det.gap_id == nar.gap_id
        assert det.evidence_refs == nar.evidence_refs
        assert nar.narrated_by_llm is True
        assert nar.reasoning == "[llm narrated reasoning]"
        assert det.reasoning != nar.reasoning


def test_fabricated_evidence_ref_produces_observed_only_not_a_fabricated_recommendation():
    observations = _observations(n=3)
    gap = Gap(
        gap_type="presence",
        evidence_refs=("o0", "o_fabricated"),
        detail={"scope": "overall", "coverage": 0.0},
    )

    results = draft_recommendations([gap], observations, SELF_ID, frozenset({COMPETITOR_ID}))

    assert len(results) == 1
    assert isinstance(results[0], ObservedOnly)
    assert "not resolvable" in results[0].reason


def test_deterministic_ids_are_stable_across_calls():
    observations = _observations()
    gaps = _gaps(observations)

    first = draft_recommendations(gaps, observations, SELF_ID, frozenset({COMPETITOR_ID}))
    second = draft_recommendations(gaps, observations, SELF_ID, frozenset({COMPETITOR_ID}))

    first_ids = [r.id if isinstance(r, Recommendation) else r.gap_id for r in first]
    second_ids = [r.id if isinstance(r, Recommendation) else r.gap_id for r in second]
    assert first_ids == second_ids
