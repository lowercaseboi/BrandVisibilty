"""Validation gate (DESIGN_v1 §5.6): every recommendation is checked against real data
before it can be treated as valid — never trusting anything the LLM might have supplied.
"""

from __future__ import annotations

from app.recommendation.action_vocabulary import is_valid_action
from app.recommendation.types import Recommendation


class RecommendationValidationError(Exception):
    pass


def validate_recommendation(
    rec: Recommendation,
    known_gap_ids: frozenset[str],
    known_evidence_refs: frozenset[str],
) -> None:
    if not rec.gap_id or rec.gap_id not in known_gap_ids:
        raise RecommendationValidationError(f"gap_id {rec.gap_id!r} does not reference a known gap")

    if not rec.evidence_refs:
        raise RecommendationValidationError("evidence_refs is empty")

    unresolved = set(rec.evidence_refs) - known_evidence_refs
    if unresolved:
        raise RecommendationValidationError(
            f"evidence_refs not resolvable to real observations: {sorted(unresolved)}"
        )

    if not is_valid_action(rec.action):
        raise RecommendationValidationError(f"action {rec.action!r} is not in the §5.5 vocabulary")
