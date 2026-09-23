from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.interface.main import create_app

_SNAPSHOT = {
    "brand_key": "gajanan_vada_pav",
    "brand": "Gajanan Vada Pav",
    "run_id": "smoke-test-2026-W36",
    "status": "COMPLETE",
    "comparability_key": "abc123",
    "collection_started_at": "2026-09-02T15:54:03.745131+00:00",
    "collection_completed_at": "2026-09-02T15:54:09.948482+00:00",
    "collection_span_days": 7.18e-05,
    "query_set_content_hash": "0f7110434d8d",
    "query_set_template_version": "v1",
    "sampling_config": {"temperature": None, "system_prompt": None, "samples_per_query": 1},
    "observation_count": 13,
    "mentioned_count": 0,
    "cluster_count": 13,
    "analysis_result": {
        "coverage": 0.0,
        "prominence": None,
        "share_of_voice": 0.0,
        "composite_score": 0.0,
        "ci_low": 0.0,
        "ci_high": 0.0,
        "per_provider_coverage": [
            {"provider_id": "groq", "coverage": 0.0, "observation_count": 13, "mentioned_count": 0}
        ],
    },
    "gaps": [
        {
            "gap_type": "presence",
            "evidence_refs": ["q31f3656c0d-s0"],
            "detail": {"scope": "overall", "coverage": 0.0},
            "is_inferred": False,
        }
    ],
    "admission": {
        "admissible": True,
        "status": "COMPLETE",
        "reasons": [],
        "query_coverage": 1.0,
        "sample_completeness": 1.0,
        "missing_query_ids": [],
        "missing_providers": [],
        "collection_span_days": 7.18e-05,
        "policy_version": "v1",
    },
}


def _client(tracking_root: Path) -> TestClient:
    return TestClient(create_app(tracking_root=tracking_root))


def test_snapshots_unknown_brand_returns_404(tmp_path: Path) -> None:
    response = _client(tmp_path).get("/brands/not_a_brand/snapshots")
    assert response.status_code == 404


def test_snapshots_known_brand_no_data_returns_empty_list(tmp_path: Path) -> None:
    response = _client(tmp_path).get("/brands/mayekar_opticians/snapshots")
    assert response.status_code == 200
    assert response.json() == []


def test_snapshots_parses_real_shape(tmp_path: Path) -> None:
    (tmp_path / "gajanan_vada_pav.jsonl").write_text(json.dumps(_SNAPSHOT) + "\n", encoding="utf-8")

    response = _client(tmp_path).get("/brands/gajanan_vada_pav/snapshots")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["analysis_result"]["prominence"] is None
    assert body[0]["sampling_config"]["temperature"] is None
    assert body[0]["run_id"] == "smoke-test-2026-W36"


def test_latest_snapshot_missing_returns_404(tmp_path: Path) -> None:
    response = _client(tmp_path).get("/brands/gajanan_vada_pav/snapshots/latest")
    assert response.status_code == 404


def test_latest_snapshot_returns_last_line(tmp_path: Path) -> None:
    second = dict(_SNAPSHOT, run_id="second-run")
    (tmp_path / "gajanan_vada_pav.jsonl").write_text(
        json.dumps(_SNAPSHOT) + "\n" + json.dumps(second) + "\n", encoding="utf-8"
    )

    response = _client(tmp_path).get("/brands/gajanan_vada_pav/snapshots/latest")

    assert response.status_code == 200
    assert response.json()["run_id"] == "second-run"


def test_runs_returns_full_audit_trail(tmp_path: Path) -> None:
    not_admissible = dict(_SNAPSHOT, run_id="rejected-run", status="PARTIAL")
    (tmp_path / "gajanan_vada_pav.runs.jsonl").write_text(
        json.dumps(not_admissible) + "\n" + json.dumps(_SNAPSHOT) + "\n", encoding="utf-8"
    )

    response = _client(tmp_path).get("/brands/gajanan_vada_pav/runs")

    assert response.status_code == 200
    run_ids = [row["run_id"] for row in response.json()]
    assert run_ids == ["rejected-run", "smoke-test-2026-W36"]


def test_runs_skips_legacy_rows_that_dont_match_current_schema(tmp_path: Path) -> None:
    # Real shape found in production data: a pre-admissibility-gate migrated record with
    # a flat admissible/reasons instead of a nested "admission" object, no cluster_count,
    # etc. Must not 500 the whole endpoint.
    legacy_row = {
        "brand_key": "gajanan_vada_pav",
        "brand": "Gajanan Vada Pav",
        "run_id": "pre-hardening-2026-W36",
        "status": "PARTIAL",
        "admissible": False,
        "reasons": ["migrated from the original ungated snapshot file"],
    }
    (tmp_path / "gajanan_vada_pav.runs.jsonl").write_text(
        json.dumps(legacy_row) + "\n" + json.dumps(_SNAPSHOT) + "\n", encoding="utf-8"
    )

    response = _client(tmp_path).get("/brands/gajanan_vada_pav/runs")

    assert response.status_code == 200
    run_ids = [row["run_id"] for row in response.json()]
    assert run_ids == ["smoke-test-2026-W36"]
