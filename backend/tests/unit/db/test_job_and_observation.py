from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.brand import Brand
from app.models.collection import ObservationStatus, RawObservation
from app.models.job import AnalysisJob, CollectionTask, JobStatus, TaskStatus
from app.models.provider import Provider, ProviderModel
from app.models.queryset import Query, QuerySet


def _chain(session):
    brand = Brand(name="Acme")
    session.add(brand)
    session.flush()
    qs = QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="h1")
    session.add(qs)
    session.flush()
    query = Query(query_set_id=qs.id, text="q", intent_type="alt", is_brand_named=False)
    session.add(query)
    provider = Provider(name="groq")
    session.add(provider)
    session.flush()
    pm = ProviderModel(provider_id=provider.id, model_id="m1")
    session.add(pm)
    job = AnalysisJob(brand_id=brand.id, query_set_id=qs.id, status=JobStatus.RUNNING, correlation_id="run-1")
    session.add(job)
    session.flush()
    return job, pm, query


def test_raw_observation_round_trip(session):
    job, pm, query = _chain(session)
    session.add(
        RawObservation(
            job_id=job.id,
            provider_model_id=pm.id,
            query_id=query.id,
            sample_index=0,
            status=ObservationStatus.OK,
            response_text="hello",
            captured_at=datetime.now(UTC),
        )
    )
    session.commit()

    fetched = session.query(RawObservation).filter_by(job_id=job.id).one()
    assert fetched.response_text == "hello"


def test_raw_observation_duplicate_key_rejected(session):
    job, pm, query = _chain(session)
    kwargs = dict(
        job_id=job.id,
        provider_model_id=pm.id,
        query_id=query.id,
        sample_index=0,
        status=ObservationStatus.OK,
        captured_at=datetime.now(UTC),
    )
    session.add(RawObservation(**kwargs))
    session.commit()

    session.add(RawObservation(**kwargs))
    with pytest.raises(IntegrityError):
        session.commit()


def test_collection_task_duplicate_key_rejected(session):
    job, pm, query = _chain(session)
    kwargs = dict(job_id=job.id, provider_model_id=pm.id, query_id=query.id, sample_index=0, status=TaskStatus.PENDING)
    session.add(CollectionTask(**kwargs))
    session.commit()

    session.add(CollectionTask(**kwargs))
    with pytest.raises(IntegrityError):
        session.commit()
