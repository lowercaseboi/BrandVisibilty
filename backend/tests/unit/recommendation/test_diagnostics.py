from __future__ import annotations

import pytest

from app.analysis.types import Gap
from app.recommendation.action_vocabulary import is_valid_action
from app.recommendation.diagnostics import diagnose

CASES = [
    Gap(gap_type="presence", evidence_refs=("o1",), detail={"scope": "overall", "coverage": 0.0}),
    Gap(gap_type="presence", evidence_refs=("o1",), detail={"scope": "overall", "coverage": 0.08}),
    Gap(gap_type="prominence", evidence_refs=("o1",), detail={"coverage": 0.5, "mean_rank": 4.2}),
    Gap(
        gap_type="competitive",
        evidence_refs=("o1",),
        detail={"competitor_id": "comp-a", "co_occurrence_rate": 0.4, "beat_rate": 0.8},
    ),
    Gap(
        gap_type="representation",
        evidence_refs=("o1",),
        detail={"disagreement_rate": 0.6, "disagree_with_each_other": True, "distinct_claim_sets": []},
    ),
    Gap(gap_type="source", evidence_refs=("s1",), detail={"dominant_source_count": 5, "non_mentioning_count": 3}),
]


@pytest.mark.parametrize("gap", CASES)
def test_diagnose_returns_vocabulary_valid_action(gap):
    diagnosis = diagnose(gap)
    assert diagnosis.text
    assert is_valid_action(diagnosis.action)


def test_severe_presence_gap_recommends_distribution():
    gap = Gap(gap_type="presence", evidence_refs=("o1",), detail={"scope": "overall", "coverage": 0.0})
    diagnosis = diagnose(gap)
    assert diagnosis.action_class == "distribution"


def test_weak_presence_gap_recommends_content():
    gap = Gap(gap_type="presence", evidence_refs=("o1",), detail={"scope": "overall", "coverage": 0.08})
    diagnosis = diagnose(gap)
    assert diagnosis.action_class == "content"


def test_competitive_diagnosis_names_the_competitor():
    gap = Gap(
        gap_type="competitive",
        evidence_refs=("o1",),
        detail={"competitor_id": "comp-a", "co_occurrence_rate": 0.4, "beat_rate": 0.8},
    )
    diagnosis = diagnose(gap)
    assert "comp-a" in diagnosis.text
