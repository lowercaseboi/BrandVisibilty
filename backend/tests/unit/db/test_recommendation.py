from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.analysis import Gap, GapType
from app.models.brand import Brand
from app.models.job import AnalysisJob, JobStatus
from app.models.queryset import QuerySet
from app.models.recommendation import ActionClass, ObservedOnly, Recommendation


def _gap(session):
    brand = Brand(name="Acme")
    session.add(brand)
    session.flush()
    qs = QuerySet(brand_id=brand.id, version=1, sampling_config={}, content_hash="h1")
    session.add(qs)
    session.flush()
    job = AnalysisJob(brand_id=brand.id, query_set_id=qs.id, status=JobStatus.COMPLETED, correlation_id="run-1")
    session.add(job)
    session.flush()
    gap = Gap(job_id=job.id, gap_type=GapType.PRESENCE, evidence_refs=["o1"], detail={}, content_hash="gap_1")
    session.add(gap)
    session.flush()
    return gap


def test_recommendation_gap_id_not_null(session):
    with pytest.raises(IntegrityError):
        session.add(
            Recommendation(
                gap_id=None,
                gap_type=GapType.PRESENCE,
                diagnosis="x",
                action_class=ActionClass.DISTRIBUTION,
                action="Submit to directory",
                reasoning="x",
                priority=1.0,
                delta_composite=1.0,
                confidence=0.5,
                effort_constant=1,
                closure_assumption_json={},
                evidence_refs=["o1"],
                content_hash="rec_null",
            )
        )
        session.commit()


def test_recommendation_valid_insert(session):
    gap = _gap(session)
    session.add(
        Recommendation(
            gap_id=gap.id,
            gap_type=GapType.PRESENCE,
            diagnosis="x",
            action_class=ActionClass.DISTRIBUTION,
            action="Submit to directory",
            reasoning="x",
            priority=1.0,
            delta_composite=1.0,
            confidence=0.5,
            effort_constant=1,
            closure_assumption_json={},
            evidence_refs=["o1"],
            content_hash="rec_1",
        )
    )
    session.commit()

    fetched = session.query(Recommendation).filter_by(content_hash="rec_1").one()
    assert fetched.gap_id == gap.id


def test_recommendation_and_observed_only_can_coexist_for_same_gap(session):
    gap = _gap(session)
    session.add(
        Recommendation(
            gap_id=gap.id,
            gap_type=GapType.PRESENCE,
            diagnosis="x",
            action_class=ActionClass.DISTRIBUTION,
            action="Submit to directory",
            reasoning="x",
            priority=1.0,
            delta_composite=1.0,
            confidence=0.5,
            effort_constant=1,
            closure_assumption_json={},
            evidence_refs=["o1"],
            content_hash="rec_2",
        )
    )
    session.add(ObservedOnly(gap_id=gap.id, gap_type=GapType.PRESENCE, reason="also observed", evidence_refs=["o1"]))
    session.commit()

    assert session.query(Recommendation).filter_by(gap_id=gap.id).count() == 1
    assert session.query(ObservedOnly).filter_by(gap_id=gap.id).count() == 1
