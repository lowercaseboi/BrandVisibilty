"""The snapshot/observation routes declare response models (architecture review point #5),
and those models neither drop nor add anything the normaliser emits for a real synthetic run."""

from __future__ import annotations

import importlib
import json
import sys

import pytest
from fastapi.testclient import TestClient

from app.interface.schemas import ObservationsResponse, Snapshot

BRAND = "gajanan_vada_pav"


@pytest.fixture
def main(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """The real app over a temp DATA_DIR (same pattern as test_api.py's `real_client`)."""
    from app import paths

    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    sys.modules.pop("app.interface.main", None)
    module = importlib.import_module("app.interface.main")
    try:
        yield module
    finally:
        sys.modules.pop("app.interface.main", None)


def _response_schema(openapi: dict, path: str) -> dict:
    return openapi["paths"][path]["get"]["responses"]["200"]["content"]["application/json"]["schema"]


def test_snapshot_routes_have_response_schemas(main) -> None:
    openapi = main.app.openapi()
    schemas = openapi["components"]["schemas"]
    assert _response_schema(openapi, "/brands/{brand_key}/snapshots/latest") == {"$ref": "#/components/schemas/Snapshot"}
    listed = _response_schema(openapi, "/brands/{brand_key}/snapshots")
    assert listed["type"] == "array" and listed["items"] == {"$ref": "#/components/schemas/Snapshot"}
    assert _response_schema(openapi, "/brands/{brand_key}/snapshots/{run_id}/observations") == {
        "$ref": "#/components/schemas/ObservationsResponse"
    }
    for name in ("Snapshot", "SnapshotAnalysis", "ObservationsResponse", "Observation", "TrendVerdict"):
        assert name in schemas
    # The documented scales: components 0–1, composite and CI 0–100 points.
    analysis = schemas["SnapshotAnalysis"]["properties"]
    assert "0–100" in analysis["composite_score"]["description"]
    assert "0–1" in analysis["coverage"]["description"]

    # /runs is a hidden alias of /snapshots, but it is typed the same way.
    runs = next(r for r in main.app.routes if getattr(r, "path", "") == "/brands/{brand_key}/runs"
                and "GET" in getattr(r, "methods", set()))
    assert runs.response_model == list[Snapshot]


def _roundtrip(value):
    return json.loads(json.dumps(value, default=str))


def test_real_synthetic_run_validates_and_is_unchanged(main) -> None:
    from app.pipeline.runner import run_pipeline

    run_pipeline(BRAND, providers="synthetic", samples=1)
    run_pipeline(BRAND, providers="synthetic", samples=1)
    client = TestClient(main.app)

    # What the routes returned before they had response models: the normalised dicts.
    expected = _roundtrip(main.with_trend_verdict(main._normalized_snapshots(BRAND)))
    assert len(expected) == 2

    latest = client.get(f"/brands/{BRAND}/snapshots/latest")
    assert latest.status_code == 200
    assert latest.json() == expected[-1]
    Snapshot.model_validate(latest.json())
    assert "trend_verdict" in latest.json()

    for path in (f"/brands/{BRAND}/snapshots", f"/brands/{BRAND}/runs"):
        body = client.get(path).json()
        assert body == expected
        # Only the newest carries the verdict; the model must not add `trend_verdict: null`.
        assert "trend_verdict" not in body[0] and "trend_verdict" in body[-1]
        for snap in body:
            Snapshot.model_validate(snap)

    run_id = expected[-1]["run_id"]
    obs = client.get(f"/brands/{BRAND}/snapshots/{run_id}/observations")
    assert obs.status_code == 200
    body = obs.json()
    ObservationsResponse.model_validate(body)
    assert set(body) >= {"brand_key", "run_id", "entities", "raw_observations"}
    assert body["run_id"] == run_id and body["entities"] == expected[-1]["entities"]
    assert len(body["raw_observations"]) == expected[-1]["observation_count"] + expected[-1]["unscored_observation_count"]
    first = body["raw_observations"][0]
    assert {"observation_id", "query_text", "response_text", "mentions", "scored"} <= set(first)


def test_extra_keys_are_kept() -> None:
    """The payload is additive by contract: unknown keys survive validation and serialisation."""
    snap = {
        "brand_key": "b", "brand": "B", "run_id": "r", "status": "completed", "data_origin": "live",
        "providers": [], "comparability_key": "k", "collection_started_at": "", "collection_completed_at": "",
        "collection_span_days": 0, "query_set_content_hash": "", "query_set_template_version": "",
        "sampling_config": {"temperature": None, "system_prompt": None, "samples_per_query": 1, "seed": 7},
        "observation_count": 0, "unscored_observation_count": 0, "mentioned_count": 0, "cluster_count": 0,
        "analysis_result": {"coverage": 0.0, "prominence": None, "share_of_voice": None, "composite_score": 0.0,
                            "ci_low": 0.0, "ci_high": 0.0, "per_provider_coverage": []},
        "gaps": [], "recommendations": [],
        "admission": {"admissible": True, "status": "admitted", "reasons": [], "query_coverage": 1.0,
                      "sample_completeness": 1.0, "missing_query_ids": [], "missing_providers": [],
                      "collection_span_days": 0, "policy_version": "v0"},
        "entities": {"self": "B"}, "mention_summary": {"total_answers": 0, "entities": {}},
        "future_field": {"x": 1},
    }
    dumped = Snapshot.model_validate(snap).model_dump(mode="json", exclude_unset=True)
    assert dumped == snap
