"""A session fixture backed by in-memory SQLite.

Deliberate, explicitly-justified departure from the repo's no-conftest.py convention:
every other test module tests pure functions/dataclasses with no shared expensive setup.
A DB session is the first genuinely repeated, stateful piece of test infrastructure in the
codebase — exactly the case fixtures exist for, not a reversal of "no fixtures needed yet."
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy.orm import Session

import app.models  # noqa: F401 -- registers every table on Base.metadata
from app.db.base import Base
from app.db.engine import get_engine


@pytest.fixture
def session() -> Iterator[Session]:
    engine = get_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s
    engine.dispose()
