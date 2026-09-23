from __future__ import annotations

from app.models.brand import Brand, EntityKind, TrackedEntity


def test_insert_and_query_round_trip(session):
    brand = Brand(name="Gajanan Vada Pav", description="street food")
    session.add(brand)
    session.commit()

    fetched = session.query(Brand).filter_by(name="Gajanan Vada Pav").one()
    assert fetched.description == "street food"


def test_tracked_entity_relationship_traversal(session):
    brand = Brand(name="Acme")
    session.add(brand)
    session.flush()

    entity = TrackedEntity(brand_id=brand.id, kind=EntityKind.SELF, name="Acme")
    session.add(entity)
    session.commit()

    fetched = session.query(Brand).filter_by(name="Acme").one()
    assert len(fetched.tracked_entities) == 1
    assert fetched.tracked_entities[0].kind == EntityKind.SELF
