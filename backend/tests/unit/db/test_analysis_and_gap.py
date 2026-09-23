from __future__ import annotations

from app.models.analysis import AnalysisResult, Gap, GapType
from app.models.brand import Brand
from app.models.job import AnalysisJob, JobStatus
from app.models.queryset import QuerySet


def _job(session):
    brand = Brand(name="Acme")
    session.add(brand)
    session.flush()
    qs = QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="h1")
    session.add(qs)
    session.flush()
    job = AnalysisJob(brand_id=brand.id, query_set_id=qs.id, status=JobStatus.COMPLETED, correlation_id="run-1")
    session.add(job)
    session.flush()
    return job


def test_analysis_result_round_trip(session):
    job = _job(session)
    session.add(
        AnalysisResult(
            job_id=job.id,
            coverage=0.5,
            prominence=0.9,
            share_of_voice=0.4,
            composite_score=62.0,
            ci_low=50.0,
            ci_high=70.0,
            breakdown_json={"per_provider_coverage": []},
        )
    )
    session.commit()

    fetched = session.query(AnalysisResult).filter_by(job_id=job.id).one()
    assert fetched.composite_score == 62.0


def test_gap_json_fields_round_trip_exactly(session):
    job = _job(session)
    evidence = ["o1", "o2", "o3"]
    detail = {"scope": "overall", "coverage": 0.0}
    session.add(
        Gap(
            job_id=job.id,
            gap_type=GapType.PRESENCE,
            evidence_refs=evidence,
            detail=detail,
            content_hash="gap_abc",
        )
    )
    session.commit()

    fetched = session.query(Gap).filter_by(content_hash="gap_abc").one()
    assert fetched.evidence_refs == evidence
    assert fetched.detail == detail
    assert fetched.gap_type == GapType.PRESENCE
