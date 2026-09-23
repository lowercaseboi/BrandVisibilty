from __future__ import annotations

import enum

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.analysis import Gap, GapType
from app.models.mixins import IDMixin, TimestampMixin


class ActionClass(str, enum.Enum):
    CONTENT = "content"
    MESSAGING = "messaging"
    DISTRIBUTION = "distribution"


class DecisionStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SAVED = "saved"


class ObservedOnlyStatus(str, enum.Enum):
    OBSERVED_ONLY = "observed_only"


class ApprovalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Recommendation(IDMixin, TimestampMixin, Base):
    """`gap_id` is NOT NULL by construction (PRD AC-7) — no recommendation can exist
    without a traceable origin. `decision_status` excludes "observed_only": that state is
    a separate `ObservedOnly` row, not a nulled-out Recommendation (mirrors the dataclass
    split already made in app.recommendation.types for the same reason)."""

    __tablename__ = "recommendation"

    gap_id: Mapped[int] = mapped_column(ForeignKey("gap.id"), index=True, nullable=False)
    gap_type: Mapped[GapType] = mapped_column(Enum(GapType, native_enum=False, create_constraint=True))
    diagnosis: Mapped[str] = mapped_column(Text)
    action_class: Mapped[ActionClass] = mapped_column(Enum(ActionClass, native_enum=False, create_constraint=True))
    action: Mapped[str] = mapped_column(String(120))
    reasoning: Mapped[str] = mapped_column(Text)
    priority: Mapped[float]
    delta_composite: Mapped[float]
    confidence: Mapped[float]
    effort_constant: Mapped[float]
    closure_assumption_json: Mapped[dict] = mapped_column(JSON)
    evidence_refs: Mapped[list] = mapped_column(JSON)
    decision_status: Mapped[DecisionStatus] = mapped_column(
        Enum(DecisionStatus, native_enum=False, create_constraint=True), default=DecisionStatus.PENDING
    )
    narrated_by_llm: Mapped[bool] = mapped_column(Boolean, default=False)
    # recommendation_id() from app.recommendation.identity.
    content_hash: Mapped[str] = mapped_column(String(80), unique=True, index=True)

    gap: Mapped[Gap] = relationship(back_populates="recommendations")
    distribution_events: Mapped[list[DistributionEvent]] = relationship(back_populates="recommendation")


class ObservedOnly(IDMixin, TimestampMixin, Base):
    """§5.6 fallback: a gap had evidence but no valid recommendation could be drafted.
    Deliberately a separate table, not a Recommendation row with nulled action/priority —
    same rationale as the dataclass split in app.recommendation.types. No cross-table
    exclusion constraint against `recommendation` for the same gap_id — a gap could in
    principle accumulate both over multiple drafting attempts; documented as a known,
    non-enforced invariant rather than worth a constraint for this pass."""

    __tablename__ = "observed_only"

    gap_id: Mapped[int] = mapped_column(ForeignKey("gap.id"), index=True, nullable=False)
    gap_type: Mapped[GapType] = mapped_column(Enum(GapType, native_enum=False, create_constraint=True))
    reason: Mapped[str] = mapped_column(Text)
    evidence_refs: Mapped[list] = mapped_column(JSON)
    decision_status: Mapped[ObservedOnlyStatus] = mapped_column(
        Enum(ObservedOnlyStatus, native_enum=False, create_constraint=True), default=ObservedOnlyStatus.OBSERVED_ONLY
    )


class DistributionEvent(IDMixin, TimestampMixin, Base):
    __tablename__ = "distribution_event"

    recommendation_id: Mapped[int] = mapped_column(ForeignKey("recommendation.id"), index=True)
    channel: Mapped[str] = mapped_column(String(80))
    content: Mapped[str] = mapped_column(Text)
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus, native_enum=False, create_constraint=True), default=ApprovalStatus.PENDING
    )
    outcome: Mapped[dict | None] = mapped_column(JSON)

    recommendation: Mapped[Recommendation] = relationship(back_populates="distribution_events")
