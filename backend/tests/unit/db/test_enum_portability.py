"""Confirms sa.Enum(..., native_enum=False) actually enforces its CHECK constraint on
SQLite, rather than silently becoming an unconstrained VARCHAR."""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.brand import Brand
from app.models.job import AnalysisJob
from app.models.queryset import QuerySet


def test_invalid_enum_value_rejected_at_db_level(session):
    brand = Brand(name="Acme")
    session.add(brand)
    session.flush()
    qs = QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="h1")
    session.add(qs)
    session.flush()

    # Bypass the ORM's own Python-level enum validation with a raw INSERT, so this
    # exercises the DB's CHECK constraint specifically, not SQLAlchemy's type coercion.
    with pytest.raises(IntegrityError):
        session.execute(
            text(
                "INSERT INTO analysis_job (brand_id, query_set_id, status, correlation_id) "
                "VALUES (:brand_id, :qs_id, 'not_a_real_status', 'run-x')"
            ),
            {"brand_id": brand.id, "qs_id": qs.id},
        )
        session.commit()


def test_valid_enum_value_accepted(session):
    brand = Brand(name="Acme2")
    session.add(brand)
    session.flush()
    qs = QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="h2")
    session.add(qs)
    session.flush()

    # SQLAlchemy's Enum type stores the Python enum member's `.name` by default (e.g.
    # "QUEUED"), not `.value` ("queued") — confirmed in the generated migration's CHECK
    # constraint values, which list uppercase member names.
    session.execute(
        text(
            "INSERT INTO analysis_job (brand_id, query_set_id, status, correlation_id) "
            "VALUES (:brand_id, :qs_id, 'QUEUED', 'run-y')"
        ),
        {"brand_id": brand.id, "qs_id": qs.id},
    )
    session.commit()

    fetched = session.query(AnalysisJob).filter_by(correlation_id="run-y").one()
    assert fetched.status.value == "queued"
