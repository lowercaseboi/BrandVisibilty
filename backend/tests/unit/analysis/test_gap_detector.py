import pytest

from app.analysis.gap_detector import detect_gaps
from app.analysis.types import (
    DetectionConfig,
    EntityMention,
    Observation,
    PromptedObservation,
    SourceLandscapeEntry,
)

BRAND = "brand-1"
COMP_A = "comp-a"
COMP_B = "comp-b"


def obs(obs_id, query_id, provider_id, mentions=(), intent_type=""):
    return Observation(
        observation_id=obs_id,
        query_id=query_id,
        provider_id=provider_id,
        mentions=tuple(mentions),
        intent_type=intent_type,
    )


def gaps_of_type(gaps, gap_type):
    return [g for g in gaps if g.gap_type == gap_type]


def test_presence_gap_fires_overall_when_coverage_at_or_below_threshold():
    config = DetectionConfig(presence_threshold=0.10)
    observations = [obs(f"o{i}", f"q{i}", "gemini", []) for i in range(10)]
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}), config)
    overall = [g for g in gaps_of_type(gaps, "presence") if g.detail["scope"] == "overall"]
    assert len(overall) == 1
    assert overall[0].detail["coverage"] == 0.0
    assert set(overall[0].evidence_refs) == {o.observation_id for o in observations}


def test_presence_gap_does_not_fire_above_threshold():
    config = DetectionConfig(presence_threshold=0.10)
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
    ] + [obs(f"o{i}", f"q{i}", "gemini", []) for i in range(2, 10)]
    # coverage = 1/9 ≈ 0.111 > 0.10 -> should not fire
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}), config)
    overall = [g for g in gaps_of_type(gaps, "presence") if g.detail["scope"] == "overall"]
    assert overall == []


def test_presence_gap_scoped_per_provider():
    config = DetectionConfig(presence_threshold=0.10)
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o2", "q2", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o3", "q1", "groq", []),
        obs("o4", "q2", "groq", []),
    ]
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}), config)
    provider_gaps = [g for g in gaps_of_type(gaps, "presence") if g.detail["scope"] == "provider"]
    assert len(provider_gaps) == 1
    assert provider_gaps[0].detail["provider_id"] == "groq"


def test_presence_gap_scoped_per_intent():
    config = DetectionConfig(presence_threshold=0.10)
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)], intent_type="category"),
        obs("o2", "q2", "gemini", [], intent_type="local"),
        obs("o3", "q3", "gemini", [], intent_type="local"),
    ]
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}), config)
    intent_gaps = [g for g in gaps_of_type(gaps, "presence") if g.detail["scope"] == "intent"]
    assert len(intent_gaps) == 1
    assert intent_gaps[0].detail["intent_type"] == "local"


def test_prominence_gap_fires_when_coverage_adequate_but_rank_poor():
    config = DetectionConfig(prominence_coverage_threshold=0.20, prominence_rank_threshold=4)
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
        obs("o2", "q2", "gemini", []),
    ]
    # coverage = 1/2 = 0.5 >= 0.20; mean rank of brand = 4 >= 4 -> fires
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}), config)
    prominence = gaps_of_type(gaps, "prominence")
    assert len(prominence) == 1
    assert prominence[0].detail["mean_rank"] == pytest.approx(4.0)


def test_prominence_gap_does_not_fire_when_coverage_below_threshold():
    config = DetectionConfig(prominence_coverage_threshold=0.20, prominence_rank_threshold=4)
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=5)]),
    ] + [obs(f"o{i}", f"q{i}", "gemini", []) for i in range(2, 10)]
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}), config)
    assert gaps_of_type(gaps, "prominence") == []


def test_prominence_gap_does_not_fire_when_rank_good():
    config = DetectionConfig(prominence_coverage_threshold=0.20, prominence_rank_threshold=4)
    observations = [
        obs("o1", "q1", "gemini", [EntityMention(BRAND, "self", rank=1)]),
        obs("o2", "q2", "gemini", [EntityMention(BRAND, "self", rank=1)]),
    ]
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}), config)
    assert gaps_of_type(gaps, "prominence") == []


def test_competitive_gap_fires_when_co_occurrence_and_beat_rate_cross_thresholds():
    config = DetectionConfig(competitive_co_occurrence_threshold=0.30, competitive_beat_threshold=0.60)
    # 5 observations, 4 co-occur with competitor (0.8 >= 0.30); of those, 3 have competitor outranking (0.75 >= 0.60)
    observations = [
        obs(
            "o1",
            "q1",
            "gemini",
            [EntityMention(COMP_A, "competitor", rank=1), EntityMention(BRAND, "self", rank=2)],
        ),
        obs(
            "o2",
            "q2",
            "gemini",
            [EntityMention(COMP_A, "competitor", rank=1), EntityMention(BRAND, "self", rank=2)],
        ),
        obs(
            "o3",
            "q3",
            "gemini",
            [EntityMention(COMP_A, "competitor", rank=1), EntityMention(BRAND, "self", rank=2)],
        ),
        obs(
            "o4",
            "q4",
            "gemini",
            [EntityMention(BRAND, "self", rank=1), EntityMention(COMP_A, "competitor", rank=2)],
        ),
        obs("o5", "q5", "gemini", [EntityMention(BRAND, "self", rank=1)]),
    ]
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}), config)
    competitive = gaps_of_type(gaps, "competitive")
    assert len(competitive) == 1
    assert competitive[0].detail["competitor_id"] == COMP_A
    assert competitive[0].detail["co_occurrence_rate"] == pytest.approx(0.8)
    assert competitive[0].detail["beat_rate"] == pytest.approx(0.75)


def test_competitive_gap_does_not_fire_below_co_occurrence_threshold():
    config = DetectionConfig(competitive_co_occurrence_threshold=0.30, competitive_beat_threshold=0.60)
    observations = [
        obs(
            "o1",
            "q1",
            "gemini",
            [EntityMention(COMP_A, "competitor", rank=1), EntityMention(BRAND, "self", rank=2)],
        ),
    ] + [obs(f"o{i}", f"q{i}", "gemini", [EntityMention(BRAND, "self", rank=1)]) for i in range(2, 6)]
    # co-occurrence = 1/5 = 0.2 < 0.30
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}), config)
    assert gaps_of_type(gaps, "competitive") == []


def test_source_gap_fires_for_dominant_non_mentioning_sources():
    landscape = [
        SourceLandscapeEntry(source_id="blog-1", mentions_brand=False),
        SourceLandscapeEntry(source_id="video-1", mentions_brand=True),
        SourceLandscapeEntry(source_id="blog-2", mentions_brand=False),
    ]
    gaps = detect_gaps(
        [], BRAND, frozenset({COMP_A}), category_source_landscape=landscape
    )
    source_gaps = gaps_of_type(gaps, "source")
    assert len(source_gaps) == 1
    assert set(source_gaps[0].evidence_refs) == {"blog-1", "blog-2"}


def test_source_gap_absent_when_all_dominant_sources_mention_brand():
    landscape = [SourceLandscapeEntry(source_id="blog-1", mentions_brand=True)]
    gaps = detect_gaps([], BRAND, frozenset({COMP_A}), category_source_landscape=landscape)
    assert gaps_of_type(gaps, "source") == []


def test_source_gap_skipped_when_landscape_not_provided():
    gaps = detect_gaps([], BRAND, frozenset({COMP_A}))
    assert gaps_of_type(gaps, "source") == []


def test_representation_gap_fires_on_disagreement_with_profile():
    config = DetectionConfig(representation_disagreement_threshold=0.5)
    prompted = [
        PromptedObservation("p1", "q1", "gemini", "identity", frozenset({"software"})),
        PromptedObservation("p2", "q2", "groq", "identity", frozenset({"software"})),
    ]
    expected = frozenset({"perfume", "fragrance"})
    gaps = detect_gaps(
        [],
        BRAND,
        frozenset({COMP_A}),
        config,
        prompted_observations=prompted,
        expected_attributes=expected,
    )
    representation = gaps_of_type(gaps, "representation")
    assert len(representation) == 1
    assert representation[0].detail["disagreement_rate"] == pytest.approx(1.0)


def test_representation_gap_fires_on_disagreement_between_providers():
    config = DetectionConfig(representation_disagreement_threshold=0.99)
    prompted = [
        PromptedObservation("p1", "q1", "gemini", "identity", frozenset({"perfume"})),
        PromptedObservation("p2", "q2", "groq", "identity", frozenset({"cologne_brand"})),
    ]
    expected = frozenset({"perfume"})
    gaps = detect_gaps(
        [],
        BRAND,
        frozenset({COMP_A}),
        config,
        prompted_observations=prompted,
        expected_attributes=expected,
    )
    representation = gaps_of_type(gaps, "representation")
    assert len(representation) == 1
    assert representation[0].detail["disagree_with_each_other"] is True


def test_representation_gap_absent_when_consistent_and_matching():
    config = DetectionConfig(representation_disagreement_threshold=0.5)
    prompted = [
        PromptedObservation("p1", "q1", "gemini", "identity", frozenset({"perfume"})),
        PromptedObservation("p2", "q2", "groq", "identity", frozenset({"perfume"})),
    ]
    expected = frozenset({"perfume"})
    gaps = detect_gaps(
        [],
        BRAND,
        frozenset({COMP_A}),
        config,
        prompted_observations=prompted,
        expected_attributes=expected,
    )
    assert gaps_of_type(gaps, "representation") == []


def test_no_gaps_ever_marked_inferred_by_the_deterministic_rules():
    observations = [obs("o1", "q1", "gemini", [])]
    gaps = detect_gaps(observations, BRAND, frozenset({COMP_A}))
    assert all(g.is_inferred is False for g in gaps)
