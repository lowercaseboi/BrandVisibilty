"""Acceptance test: a real on-disk tracking snapshot (already written by
scripts/run_tracking_loop.py) can be losslessly represented as rows and round-tripped."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from app.models.analysis import AnalysisResult, Gap, GapType
from app.models.brand import Brand
from app.models.job import AnalysisJob, JobStatus
from app.models.queryset import QuerySet
from app.models.tracking import SnapshotStatus, TrackingSnapshot

SNAPSHOT_PATH = Path(__file__).resolve().parents[3] / "data" / "tracking" / "gajanan_vada_pav.jsonl"


def _load_first_snapshot() -> dict:
    with open(SNAPSHOT_PATH, encoding="utf-8") as f:
        return json.loads(f.readline())


def test_real_snapshot_round_trips_losslessly(session):
    snap = _load_first_snapshot()

    brand = Brand(name=snap["brand"])
    session.add(brand)
    session.flush()
    qs = QuerySet(
        brand_id=brand.id,
        version=1,
        sampling_config=snap["sampling_config"],
        content_hash=snap["query_set_content_hash"],
    )
    session.add(qs)
    session.flush()
    job = AnalysisJob(
        brand_id=brand.id,
        query_set_id=qs.id,
        status=JobStatus.COMPLETED if snap["status"] == "COMPLETE" else JobStatus.PARTIAL,
        correlation_id=snap["run_id"],
    )
    session.add(job)
    session.flush()

    ar = snap["analysis_result"]
    session.add(
        AnalysisResult(
            job_id=job.id,
            coverage=ar["coverage"],
            prominence=ar["prominence"],
            share_of_voice=ar["share_of_voice"],
            composite_score=ar["composite_score"],
            ci_low=ar["ci_low"],
            ci_high=ar["ci_high"],
            breakdown_json={"per_provider_coverage": ar["per_provider_coverage"]},
        )
    )

    gap_rows = []
    for i, g in enumerate(snap["gaps"]):
        gap = Gap(
            job_id=job.id,
            gap_type=GapType(g["gap_type"]),
            evidence_refs=list(g["evidence_refs"]),
            detail=g["detail"],
            is_inferred=g["is_inferred"],
            content_hash=f"gap_{i}",
        )
        session.add(gap)
        gap_rows.append((gap, g))

    session.add(
        TrackingSnapshot(
            brand_id=brand.id,
            job_id=job.id,
            comparability_key=snap["comparability_key"],
            query_set_content_hash=snap["query_set_content_hash"],
            model_fingerprint=snap["comparability_key"],  # not separately serialized on disk today
            composite_score=ar["composite_score"],
            ci_low=ar["ci_low"],
            ci_high=ar["ci_high"],
            breakdown_json={
                "observation_count": snap["observation_count"],
                "mentioned_count": snap["mentioned_count"],
                "cluster_count": snap["cluster_count"],
                "per_provider_coverage": ar["per_provider_coverage"],
            },
            admission_json=snap["admission"],
            status=SnapshotStatus(snap["status"]),
            captured_at=datetime.fromisoformat(snap["collection_completed_at"]),
        )
    )
    session.commit()

    fetched_result = session.query(AnalysisResult).filter_by(job_id=job.id).one()
    assert fetched_result.coverage == ar["coverage"]
    assert fetched_result.composite_score == ar["composite_score"]
    assert fetched_result.breakdown_json["per_provider_coverage"] == ar["per_provider_coverage"]

    fetched_gaps = session.query(Gap).filter_by(job_id=job.id).order_by(Gap.id).all()
    assert len(fetched_gaps) == len(snap["gaps"])
    for row, (_, original) in zip(fetched_gaps, gap_rows):
        assert row.gap_type.value == original["gap_type"]
        assert row.evidence_refs == list(original["evidence_refs"])
        assert row.detail == original["detail"]
        assert row.is_inferred == original["is_inferred"]

    fetched_snapshot = session.query(TrackingSnapshot).filter_by(job_id=job.id).one()
    assert fetched_snapshot.admission_json == snap["admission"]
    assert fetched_snapshot.status.value == snap["status"]
