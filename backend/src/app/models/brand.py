from __future__ import annotations

import enum

from sqlalchemy import JSON, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class EntityKind(str, enum.Enum):
    SELF = "self"
    COMPETITOR = "competitor"
    DISCOVERED = "discovered"


class Brand(IDMixin, TimestampMixin, Base):
    __tablename__ = "brand"

    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    audience: Mapped[str | None] = mapped_column(Text)
    product_details: Mapped[dict | None] = mapped_column(JSON)

    tracked_entities: Mapped[list[TrackedEntity]] = relationship(back_populates="brand")


class TrackedEntity(IDMixin, TimestampMixin, Base):
    __tablename__ = "tracked_entity"
    __table_args__ = (UniqueConstraint("brand_id", "name", "kind"),)

    brand_id: Mapped[int] = mapped_column(ForeignKey("brand.id"), index=True)
    kind: Mapped[EntityKind] = mapped_column(Enum(EntityKind, native_enum=False, create_constraint=True))
    name: Mapped[str] = mapped_column(String(200))

    brand: Mapped[Brand] = relationship(back_populates="tracked_entities")
