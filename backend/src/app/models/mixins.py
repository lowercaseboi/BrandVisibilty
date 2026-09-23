"""Small declarative mixins shared by every model — a surrogate integer PK and a
creation timestamp, used identically across all 17 tables (see plan's PK-strategy
decision: surrogate int PKs everywhere, content-hash ids live in their own unique column)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column


class IDMixin:
    id: Mapped[int] = mapped_column(primary_key=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
