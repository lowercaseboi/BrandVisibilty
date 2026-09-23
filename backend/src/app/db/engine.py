from __future__ import annotations

from sqlalchemy import Engine, create_engine

from app.config.settings import settings


def get_engine(url: str | None = None) -> Engine:
    return create_engine(url or settings.database_url, future=True)


engine = get_engine()
