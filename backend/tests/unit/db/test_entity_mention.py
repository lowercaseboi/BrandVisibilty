from __future__ import annotations

from datetime import UTC, datetime

from app.models.brand import Brand, EntityKind, TrackedEntity
from app.models.collection import EntityMention, ObservationStatus, RawObservation
from app.models.job import AnalysisJob, JobStatus
from app.models.provider import Provider, ProviderModel
from app.models.queryset import Query, QuerySet


def test_entity_mention_relationship_traversal(session):
    brand = Brand(name="Acme")
    session.add(brand)
    session.flush()
    entity = TrackedEntity(brand_id=brand.id, kind=EntityKind.SELF, name="Acme")
    session.add(entity)
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
    observation = RawObservation(
        job_id=job.id,
        provider_model_id=pm.id,
        query_id=query.id,
        sample_index=0,
        status=ObservationStatus.OK,
        captured_at=datetime.now(UTC),
    )
    session.add(observation)
    session.flush()
    session.add(EntityMention(observation_id=observation.id, entity_id=entity.id, rank=1))
    session.commit()

    fetched = session.query(RawObservation).filter_by(id=observation.id).one()
    assert len(fetched.mentions) == 1
    assert fetched.mentions[0].rank == 1
