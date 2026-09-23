from __future__ import annotations

import pytest

from app.recommendation.types import ClosureAssumption, Recommendation
from app.recommendation.validation import RecommendationValidationError, validate_recommendation

CLOSURE = ClosureAssumption(description="coverage 0.00 -> 0.50", field_changed="coverage", before=0.0, after=0.5)


def _rec(**overrides):
    defaults = dict(
        id="rec_1",
        gap_id="gap_1",
        gap_type="presence",
        diagnosis="No category association exists",
        action_class="distribution",
        action="Submit to directory",
        reasoning="because",
        priority=1.0,
        delta_composite=10.0,
        confidence=0.5,
        effort_constant=1,
        closure_assumption=CLOSURE,
        evidence_refs=("o1", "o2"),
    )
    defaults.update(overrides)
    return Recommendation(**defaults)


def test_valid_recommendation_passes():
    rec = _rec()
    validate_recommendation(rec, frozenset({"gap_1"}), frozenset({"o1", "o2"}))


def test_unknown_gap_id_rejected():
    rec = _rec(gap_id="gap_unknown")
    with pytest.raises(RecommendationValidationError, match="does not reference a known gap"):
        validate_recommendation(rec, frozenset({"gap_1"}), frozenset({"o1", "o2"}))


def test_unresolvable_evidence_ref_rejected():
    rec = _rec(evidence_refs=("o1", "o_fabricated"))
    with pytest.raises(RecommendationValidationError, match="not resolvable"):
        validate_recommendation(rec, frozenset({"gap_1"}), frozenset({"o1", "o2"}))


def test_action_outside_vocabulary_rejected():
    rec = _rec(action="Do something creative")
    with pytest.raises(RecommendationValidationError, match="vocabulary"):
        validate_recommendation(rec, frozenset({"gap_1"}), frozenset({"o1", "o2"}))
