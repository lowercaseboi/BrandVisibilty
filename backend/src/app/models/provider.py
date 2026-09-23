from __future__ import annotations

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class Provider(IDMixin, TimestampMixin, Base):
    __tablename__ = "provider"

    name: Mapped[str] = mapped_column(String(80), unique=True)
    # No explicit "tier" concept exists in app.collection.providers.catalog today
    # (only PRD's summary mentions one) — kept nullable/free-text for forward-compat
    # rather than a hard Enum validated against nothing real.
    tier: Mapped[str | None] = mapped_column(String(40))
    daily_quota: Mapped[int | None]

    models: Mapped[list[ProviderModel]] = relationship(back_populates="provider")


class ProviderModel(IDMixin, TimestampMixin, Base):
    """Mirrors app.collection.providers.catalog's ProviderLimits shape (rpm/rpd/
    daily_budget/daily_reset_tz), the real tested shape, rather than PRD §14's thinner
    `daily_quota`-only summary."""

    __tablename__ = "provider_model"
    __table_args__ = (UniqueConstraint("provider_id", "model_id"),)

    provider_id: Mapped[int] = mapped_column(ForeignKey("provider.id"), index=True)
    model_id: Mapped[str] = mapped_column(String(120))
    # Filled in per-call from response metadata (C-3) — not static, may differ from what
    # was configured if the provider silently resolves an alias to a newer version.
    resolved_version: Mapped[str | None] = mapped_column(String(120))
    rpm: Mapped[int | None]
    rpd: Mapped[int | None]
    daily_budget: Mapped[int | None]
    daily_reset_tz: Mapped[str] = mapped_column(String(60), default="UTC")

    provider: Mapped[Provider] = relationship(back_populates="models")
