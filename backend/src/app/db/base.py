"""Single SQLAlchemy metadata root every model attaches to.

`app/models/__init__.py` imports every model submodule so this metadata is fully
populated before Alembic (or `Base.metadata.create_all`) ever inspects it.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
