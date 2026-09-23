from __future__ import annotations

from app.models.analysis import Gap, GapType
from app.models.brand import Brand
from app.models.job import AnalysisJob, JobStatus
from app.models.queryset import QuerySet
from app.models.recommendation import ActionClass, DistributionEvent, Recommendation


def test_distribution_event_round_trip(session):
    brand = Brand(name="Acme")
    session.add(brand)
    session.flush()
    qs = QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="h1")
    session.add(qs)
    session.flush()
    job = AnalysisJob(brand_id=brand.id, query_set_id=qs.id, status=JobStatus.COMPLETED, correlation_id="run-1")
    session.add(job)
    session.flush()
    gap = Gap(job_id=job.id, gap_type=GapType.SOURCE, evidence_refs=["s1"], detail={}, content_hash="gap_1")
    session.add(gap)
    session.flush()
    rec = Recommendation(
        gap_id=gap.id,
        gap_type=GapType.SOURCE,
        diagnosis="x",
        action_class=ActionClass.DISTRIBUTION,
        action="Pitch inclusion in listicle",
        reasoning="x",
        priority=1.0,
        delta_composite=0.0,
        confidence=0.5,
        effort_constant=1,
        closure_assumption_json={},
        evidence_refs=["s1"],
        content_hash="rec_1",
    )
    session.add(rec)
    session.flush()
    session.add(DistributionEvent(recommendation_id=rec.id, channel="dev.to", content="draft body"))
    session.commit()

    fetched = session.query(Recommendation).filter_by(content_hash="rec_1").one()
    assert len(fetched.distribution_events) == 1
    assert fetched.distribution_events[0].channel == "dev.to"
