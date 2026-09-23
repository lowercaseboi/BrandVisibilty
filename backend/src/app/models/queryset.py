from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class QuerySet(IDMixin, TimestampMixin, Base):
    """Immutable once `frozen_at` is set (PRD §14 / DESIGN §2.2). Enforced at the app/ORM
    write path, not by a DB trigger — SQLite/Postgres trigger semantics don't need to match
    since every write already funnels through Python. Editing a frozen query set must
    INSERT a new row with `version + 1`, never UPDATE this one."""

    __tablename__ = "query_set"
    __table_args__ = (UniqueConstraint("brand_id", "version"),)

    brand_id: Mapped[int] = mapped_column(ForeignKey("brand.id"), index=True)
    version: Mapped[int]
    sampling_config: Mapped[dict] = mapped_column(JSON)
    content_hash: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    frozen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    queries: Mapped[list[Query]] = relationship(back_populates="query_set")


class Query(IDMixin, TimestampMixin, Base):
    __tablename__ = "query"

    query_set_id: Mapped[int] = mapped_column(ForeignKey("query_set.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    intent_type: Mapped[str] = mapped_column(String(80))
    is_brand_named: Mapped[bool] = mapped_column(Boolean, default=False)

    query_set: Mapped[QuerySet] = relationship(back_populates="queries")
