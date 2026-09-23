from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class ObservationStatus(str, enum.Enum):
    OK = "ok"
    FAILED = "failed"


class RawObservation(IDMixin, TimestampMixin, Base):
    """DESIGN §2.2: `UNIQUE(job_id, provider_model_id, query_id, sample_index)` — idempotent
    retries. Never overwritten once written. `response_text` is stored inline, matching the
    existing FileResponseStore's StoredResponse shape (a full JSON blob per sample, not a
    pointer to a separate blob store)."""

    __tablename__ = "raw_observation"
    __table_args__ = (UniqueConstraint("job_id", "provider_model_id", "query_id", "sample_index"),)

    job_id: Mapped[int] = mapped_column(ForeignKey("analysis_job.id"), index=True)
    provider_model_id: Mapped[int] = mapped_column(ForeignKey("provider_model.id"), index=True)
    query_id: Mapped[int] = mapped_column(ForeignKey("query.id"), index=True)
    sample_index: Mapped[int]
    status: Mapped[ObservationStatus] = mapped_column(Enum(ObservationStatus, native_enum=False, create_constraint=True))
    response_text: Mapped[str | None] = mapped_column(Text)
    model_version: Mapped[str | None] = mapped_column(String(120))
    latency_ms: Mapped[int | None]
    token_usage: Mapped[dict | None] = mapped_column(JSON)
    raw_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    mentions: Mapped[list[EntityMention]] = relationship(back_populates="observation")


class EntityMention(IDMixin, TimestampMixin, Base):
    __tablename__ = "entity_mention"

    observation_id: Mapped[int] = mapped_column(ForeignKey("raw_observation.id"), index=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("tracked_entity.id"), index=True)
    rank: Mapped[int]
    char_start: Mapped[int] = mapped_column(default=-1)
    char_end: Mapped[int] = mapped_column(default=-1)
    is_passing_mention: Mapped[bool] = mapped_column(default=False)
    prominence_band: Mapped[float | None]

    observation: Mapped[RawObservation] = relationship(back_populates="mentions")
