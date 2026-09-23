"""Importing this package registers every table on app.db.base.Base.metadata — required
before Alembic autogenerate or Base.metadata.create_all can see the full schema."""

from __future__ import annotations

from app.models import (  # noqa: F401
    admin,
    analysis,
    brand,
    collection,
    job,
    provider,
    queryset,
    recommendation,
    tracking,
)
