from __future__ import annotations

import enum

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class GapType(str, enum.Enum):
    PRESENCE = "presence"
    PROMINENCE = "prominence"
    REPRESENTATION = "representation"
    COMPETITIVE = "competitive"
    SOURCE = "source"


class AnalysisResult(IDMixin, TimestampMixin, Base):
    __tablename__ = "analysis_result"

    job_id: Mapped[int] = mapped_column(ForeignKey("analysis_job.id"), unique=True, index=True)
    coverage: Mapped[float]
    prominence: Mapped[float | None]
    share_of_voice: Mapped[float | None]
    composite_score: Mapped[float]
    ci_low: Mapped[float]
    ci_high: Mapped[float]
    # per_provider_coverage tuple, observation_count, mentioned_count,
    # participating_providers, cluster_count — variable-shape, write-once/read-whole,
    # not queried by sub-field, so kept as one JSON blob rather than exploded columns.
    breakdown_json: Mapped[dict] = mapped_column(JSON)


class Gap(IDMixin, TimestampMixin, Base):
    __tablename__ = "gap"

    job_id: Mapped[int] = mapped_column(ForeignKey("analysis_job.id"), index=True)
    gap_type: Mapped[GapType] = mapped_column(Enum(GapType, native_enum=False, create_constraint=True))
    evidence_refs: Mapped[list] = mapped_column(JSON)
    detail: Mapped[dict] = mapped_column(JSON)
    is_inferred: Mapped[bool] = mapped_column(Boolean, default=False)
    # gap_id() from app.recommendation.identity — the dataclass layer's deterministic id.
    content_hash: Mapped[str] = mapped_column(String(80), unique=True, index=True)

    recommendations: Mapped[list["Recommendation"]] = relationship(back_populates="gap")  # noqa: F821
