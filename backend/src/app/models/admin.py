from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class ProviderUsageLedger(IDMixin, TimestampMixin, Base):
    """Absorbs the richer, already-tested shape of app.collection.ledger.DailyUsage rather
    than PRD §14's thinner summary (calls_made/cost_incurred/credit_remaining). Keyed by
    provider_model_id (the actual quota-bearing unit per DESIGN §2.1's Provider/
    ProviderModel split and catalog.py's own (provider_id, model_id) keying), not
    provider_id as PRD's literal field list suggests — a deliberate deviation in favor of
    the real, tested shape."""

    __tablename__ = "provider_usage_ledger"
    __table_args__ = (UniqueConstraint("provider_model_id", "usage_date"),)

    provider_model_id: Mapped[int] = mapped_column(ForeignKey("provider_model.id"), index=True)
    usage_date: Mapped[date] = mapped_column(Date)
    requests: Mapped[int] = mapped_column(default=0)
    successes: Mapped[int] = mapped_column(default=0)
    rate_limited: Mapped[int] = mapped_column(default=0)
    errors: Mapped[int] = mapped_column(default=0)
    prompt_tokens: Mapped[int] = mapped_column(default=0)
    completion_tokens: Mapped[int] = mapped_column(default=0)
    exhausted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exhausted_quota_id: Mapped[str | None] = mapped_column(String(200))


class AuditLogEntry(IDMixin, Base):
    __tablename__ = "audit_log_entry"

    actor: Mapped[str] = mapped_column(String(120))
    # Free text, not Enum — unbounded action log, not a closed vocabulary.
    action: Mapped[str] = mapped_column(String(120))
    target_ref: Mapped[str] = mapped_column(String(200))
    context: Mapped[dict | None] = mapped_column(JSON)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
