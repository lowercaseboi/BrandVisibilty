from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PARTIAL = "partial"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUCCEEDED = "succeeded"
    FAILED_TERMINAL = "failed_terminal"


class AnalysisJob(IDMixin, TimestampMixin, Base):
    __tablename__ = "analysis_job"

    brand_id: Mapped[int] = mapped_column(ForeignKey("brand.id"), index=True)
    query_set_id: Mapped[int] = mapped_column(ForeignKey("query_set.id"), index=True)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus, native_enum=False, create_constraint=True), default=JobStatus.QUEUED)
    correlation_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CollectionTask(IDMixin, TimestampMixin, Base):
    """DESIGN §2.1 addition (not in PRD §14's summary table): one row per
    `(provider_model, query, sample_index)`, tracking attempt count and terminal state —
    sits between AnalysisJob and RawObservation."""

    __tablename__ = "collection_task"
    __table_args__ = (UniqueConstraint("job_id", "provider_model_id", "query_id", "sample_index"),)

    job_id: Mapped[int] = mapped_column(ForeignKey("analysis_job.id"), index=True)
    provider_model_id: Mapped[int] = mapped_column(ForeignKey("provider_model.id"), index=True)
    query_id: Mapped[int] = mapped_column(ForeignKey("query.id"), index=True)
    sample_index: Mapped[int]
    attempt_count: Mapped[int] = mapped_column(default=0)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus, native_enum=False, create_constraint=True), default=TaskStatus.PENDING)
    last_error: Mapped[str | None] = mapped_column(Text)
