from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.brand import Brand
from app.models.queryset import Query, QuerySet


def _brand(session):
    brand = Brand(name="Acme")
    session.add(brand)
    session.flush()
    return brand


def test_query_set_and_query_round_trip(session):
    brand = _brand(session)
    qs = QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="hash1")
    session.add(qs)
    session.flush()
    session.add(Query(query_set_id=qs.id, text="best acme", intent_type="alt", is_brand_named=False))
    session.commit()

    fetched = session.query(QuerySet).filter_by(content_hash="hash1").one()
    assert len(fetched.queries) == 1


def test_content_hash_unique(session):
    brand = _brand(session)
    session.add(QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="dup"))
    session.commit()

    session.add(QuerySet(brand_id=brand.id, version=2, sampling_config={}, content_hash="dup"))
    with pytest.raises(IntegrityError):
        session.commit()


def test_brand_version_unique(session):
    brand = _brand(session)
    session.add(QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="a"))
    session.commit()

    session.add(QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="b"))
    with pytest.raises(IntegrityError):
        session.commit()
