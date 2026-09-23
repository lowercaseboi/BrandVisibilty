"""Data shapes for drafted recommendations (DESIGN_v1 §5, PRD §14 `Recommendation` entity).

No DB yet, so these are plain dataclasses like the analysis layer's — `gap_id` is a
deterministic content hash (see `identity.py`), not a DB-assigned id, but it is always
non-null by construction (PRD AC-7).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.analysis.types import GapType

DecisionStatus = Literal["pending", "approved", "rejected", "saved", "observed_only"]
ActionClass = Literal["content", "messaging", "distribution"]


@dataclass(frozen=True)
class ClosureAssumption:
    """The hypothetical gap-closure fed into the counterfactual re-score (§5.4), recorded
    verbatim so a reviewer can inspect exactly what was assumed."""

    description: str
    field_changed: str
    before: float
    after: float


@dataclass(frozen=True)
class Recommendation:
    id: str
    gap_id: str  # NOT NULL by construction — always code-assigned, never LLM-supplied (AC-7)
    gap_type: GapType
    diagnosis: str
    action_class: ActionClass
    action: str  # always a member of action_vocabulary.ACTION_VOCABULARY, never free text
    reasoning: str
    priority: float
    delta_composite: float
    confidence: float
    effort_constant: float
    closure_assumption: ClosureAssumption
    evidence_refs: tuple[str, ...]  # always a validated subset of the originating Gap's refs
    decision_status: DecisionStatus = "pending"
    narrated_by_llm: bool = False


@dataclass(frozen=True)
class ObservedOnly:
    """§5.6 fallback: the gap has evidence but no valid recommendation could be drafted.
    Deliberately a separate, smaller type from `Recommendation` rather than one with nulled
    action/priority fields — keeps "no actionable claim was made" structurally distinct from
    a real recommendation."""

    gap_id: str
    gap_type: GapType
    reason: str
    evidence_refs: tuple[str, ...]
    decision_status: Literal["observed_only"] = "observed_only"
