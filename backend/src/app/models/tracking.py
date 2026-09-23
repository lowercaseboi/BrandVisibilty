from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class SnapshotStatus(str, enum.Enum):
    COMPLETE = "COMPLETE"
    PARTIAL = "PARTIAL"


class TrackingSnapshot(IDMixin, TimestampMixin, Base):
    """Trend queries MUST filter/group by `comparability_key` (or equivalently by matching
    `query_set_content_hash` AND `model_fingerprint`) before comparing rows across time —
    this is a query-time discipline the schema cannot enforce structurally; joining two
    snapshots with differing `comparability_key` values produces a methodologically
    meaningless trend line (DESIGN §2.2/§4.5).

    `breakdown_json` reserves `per_intent_coverage` and `per_competitor_sov` keys per
    DESIGN §6.6, but neither is currently produced by app.analysis.scorer or
    app.tracking.snapshot — only per-provider coverage exists today. This schema can store
    them once produced; it does not itself compute them.
    """

    __tablename__ = "tracking_snapshot"

    brand_id: Mapped[int] = mapped_column(ForeignKey("brand.id"), index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("analysis_job.id"), index=True)
    comparability_key: Mapped[str] = mapped_column(String(80), index=True)
    query_set_content_hash: Mapped[str] = mapped_column(String(80))
    model_fingerprint: Mapped[str] = mapped_column(String(80))
    composite_score: Mapped[float]
    ci_low: Mapped[float]
    ci_high: Mapped[float]
    breakdown_json: Mapped[dict] = mapped_column(JSON)
    admission_json: Mapped[dict] = mapped_column(JSON)
    status: Mapped[SnapshotStatus] = mapped_column(Enum(SnapshotStatus, native_enum=False, create_constraint=True))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
