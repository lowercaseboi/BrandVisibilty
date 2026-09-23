import random

import pytest

from app.analysis.scorer import _percentile, score
from app.analysis.types import EntityMention, Observation

BRAND = "brand-1"
COMP_A = "comp-a"
COMP_B = "comp-b"


def obs(obs_id, query_id, provider_id, mentions=()):
    return Observation(
        observation_id=obs_id,
        query_id=query_id,
        provider_id=provider_id,
        mentions=tuple(mentions),
    )


def test_coverage_is_mentioned_over_total_triples():
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o2", "q1", "gemini", []),
        obs("o3", "q2", "groq", [EntityMention(BRAND, "self", rank=1)]),
        obs("o4", "q2", "groq", []),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.coverage == pytest.approx(0.5)
    assert result.observation_count == 4
    assert result.mentioned_count == 2


def test_coverage_zero_makes_prominence_undefined_and_composite_renormalizes():
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(COMP_A, "competitor", rank=1)]),
        obs("o2", "q1", "gemini", []),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.coverage == 0.0
    assert result.prominence is None
    # SoV = 0 mentioned / 1 contested (only o1 names a tracked entity) -> defined, 0.0
    assert result.share_of_voice == pytest.approx(0.0)
    # composite renormalizes over coverage(0.4) + sov(0.3) only -> both terms are 0
    assert result.composite_score == pytest.approx(0.0)


def test_prominence_sole_option_named():
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.prominence == pytest.approx(1.0)


def test_prominence_first_of_several():
    observations = [
        obs(
            "o1",
            "q1",
            "gemini",
            [EntityMention(BRAND, "self", rank=1), EntityMention(COMP_A, "competitor", rank=2)],
        ),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.prominence == pytest.approx(0.9)


def test_prominence_rank_2_3_band():
    observations = [
        obs(
            "o1",
            "q1",
            "gemini",
            [
                EntityMention(COMP_A, "competitor", rank=1),
                EntityMention(BRAND, "self", rank=2),
            ],
        ),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.prominence == pytest.approx(0.6)


def test_prominence_rank_4_plus_band():
    observations = [
        obs(
            "o1",
            "q1",
            "gemini",
            [
                EntityMention("x1", "discovered", rank=1),
                EntityMention("x2", "discovered", rank=2),
                EntityMention("x3", "discovered", rank=3),
                EntityMention(BRAND, "self", rank=4),
            ],
        ),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.prominence == pytest.approx(0.3)


def test_prominence_passing_mention_overrides_rank():
    observations = [
        obs(
            "o1",
            "q1",
            "gemini",
            [EntityMention(BRAND, "self", rank=1, is_passing_mention=True)],
        ),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.prominence == pytest.approx(0.1)


def test_share_of_voice_is_per_response_presence_not_occurrence_count():
    # o1 "mentions" brand once, o2 mentions competitor once — SoV should be 0.5,
    # not inflated by any notion of repeated occurrence within a response.
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o2", "q1", "gemini", [EntityMention(COMP_A, "competitor", rank=1)]),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.share_of_voice == pytest.approx(0.5)


def test_share_of_voice_excludes_responses_naming_no_tracked_entity():
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o2", "q1", "gemini", []),  # names nothing tracked — excluded from denominator
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.share_of_voice == pytest.approx(1.0)


def test_share_of_voice_undefined_when_no_tracked_entity_ever_mentioned():
    observations = [
        obs("o1", "q1", "gemini", []),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.share_of_voice is None


def test_per_provider_coverage_breakdown():
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o2", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o3", "q1", "groq", []),
        obs("o4", "q1", "groq", []),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    by_provider = {b.provider_id: b.coverage for b in result.per_provider_coverage}
    assert by_provider == {"gemini": pytest.approx(1.0), "groq": pytest.approx(0.0)}


def test_bootstrap_ci_resamples_queries_not_individual_calls():
    # Two queries: one always mentions the brand, one never does. With only
    # 2 clusters, every bootstrap resample lands on one of {both-q1, both-q2,
    # one-of-each} -- so coverage across resamples is one of {1.0, 0.0, 0.5},
    # and the interval should span nearly the full range, not tightly hug 0.5
    # the way a naive per-call CI would.
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o2", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o3", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o4", "q2", "gemini", []),
        obs("o5", "q2", "gemini", []),
        obs("o6", "q2", "gemini", []),
    ]
    result = score(
        observations, BRAND, frozenset({COMP_A}), n_bootstrap=500, rng=random.Random(42)
    )
    assert result.ci_low < 30
    assert result.ci_high > 70


def test_empty_observations_returns_zeroed_result():
    result = score([], BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    assert result.coverage == 0.0
    assert result.prominence is None
    assert result.share_of_voice is None
    assert result.composite_score == 0.0
    assert result.ci_low == result.ci_high == 0.0
    assert result.observation_count == 0


def test_composite_formula_weights_when_all_components_defined():
    observations = [
        obs(
            "o1",
            "q1",
            "gemini",
            [EntityMention(BRAND, "self", rank=1)],
        ),
        obs("o2", "q1", "gemini", [EntityMention(COMP_A, "competitor", rank=1)]),
    ]
    result = score(observations, BRAND, frozenset({COMP_A}), n_bootstrap=10, rng=random.Random(0))
    # coverage = 1/2 = 0.5, prominence = 1.0 (sole option in o1), sov = 1/2 = 0.5
    expected = (0.4 * 0.5 + 0.3 * 1.0 + 0.3 * 0.5) * 100
    assert result.composite_score == pytest.approx(expected)


def test_percentile_interpolates_linearly_between_ranks():
    values = [0.0, 10.0, 20.0, 30.0, 40.0]
    assert _percentile(values, 0) == 0.0
    assert _percentile(values, 100) == 40.0
    assert _percentile(values, 50) == 20.0
    # rank = 0.375 * 4 = 1.5 -> halfway between 10 and 20
    assert _percentile(values, 37.5) == pytest.approx(15.0)


def test_percentile_degenerate_inputs():
    assert _percentile([], 50) == 0.0
    assert _percentile([7.0], 2.5) == 7.0
