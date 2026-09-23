"""Smoke tests for the HTTP API with the brands/store/provider/pipeline modules faked.

The fakes are injected into sys.modules (and onto their parent packages) before
`app.interface.main` is imported, so these tests don't depend on those modules' internals.
"""

from __future__ import annotations

import importlib
import sys
import time
import types
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

NEW_RECORD = {
    "brand_key": "gajanan_vada_pav",
    "brand": "Gajanan Vada Pav",
    "run_id": "run-new",
    "status": "partial",
    "data_origin": "synthetic",
    "providers": ["synthetic"],
    "comparability_key": "abc",
    "collection_started_at": "2026-09-20T10:00:00+00:00",
    "collection_completed_at": "2026-09-20T10:05:00+00:00",
    "collection_span_days": 0,
    "query_set_content_hash": "h",
    "query_set_template_version": "v1",
    "sampling_config": {"temperature": None, "system_prompt": None, "samples_per_query": 1},
    "observation_count": 1,
    "mentioned_count": 1,
    "cluster_count": 1,
    "analysis_result": {
        "coverage": 1.0, "prominence": 1.0, "share_of_voice": 1.0, "composite_score": 90.0,
        "ci_low": 80.0, "ci_high": 95.0, "per_provider_coverage": [],
    },
    "gaps": [],
    "recommendations": [],
    "admission": {
        "admissible": True, "status": "admitted", "reasons": [], "query_coverage": 1.0,
        "sample_completeness": 1.0, "missing_query_ids": [], "missing_providers": [],
        "collection_span_days": 0, "policy_version": "v0",
    },
    "entities": {"self": "Gajanan Vada Pav"},
    "raw_observations": [{"observation_id": "synthetic:q0-s0", "query_id": "q0", "response_text": "..."}],
}

LEGACY_RECORD = {
    "brand_key": "old_brand",
    "brand": "Old Brand",
    "collected_at": "2026-09-02T15:00:00+00:00",
    "query_set_content_hash": "h",
    "query_set_template_version": "v1",
    "sampling_config": {"temperature": None, "system_prompt": None, "samples_per_query": 2},
    "observation_count": 1,
    "mentioned_count": 0,
    "analysis_result": {
        "coverage": 0.0, "prominence": None, "share_of_voice": None, "composite_score": 0.0,
        "ci_low": 0.0, "ci_high": 0.0,
        "per_provider_coverage": [
            {"provider_id": "gemini", "coverage": 0.0, "observation_count": 1, "mentioned_count": 0}
        ],
    },
    "gaps": [{"gap_type": "PRESENCE", "evidence_refs": ["q0-s0"], "detail": {}, "is_inferred": False}],
    "raw_observations": [{"observation_id": "q0-s0", "query_text": "best vada pav", "response_text": "x",
                          "intent_type": "local", "model_version": "g", "mentions": []}],
}


@dataclass(frozen=True)
class _Params:
    brand: str


@dataclass(frozen=True)
class _Brand:
    brand_key: str
    params: _Params
    is_pilot: bool = True


@dataclass(frozen=True)
class _ProviderInfo:
    provider_id: str
    label: str
    configured: bool
    model: str | None
    kind: str


def _install(monkeypatch: pytest.MonkeyPatch, name: str, module: types.ModuleType) -> None:
    parent_name, _, child = name.rpartition(".")
    try:
        parent = importlib.import_module(parent_name)
    except ImportError:
        parent = types.ModuleType(parent_name)
        parent.__path__ = []  # mark as package
        monkeypatch.setitem(sys.modules, parent_name, parent)
    monkeypatch.setitem(sys.modules, name, module)
    monkeypatch.setattr(parent, child, module, raising=False)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    records = {"gajanan_vada_pav": [NEW_RECORD], "old_brand": [LEGACY_RECORD]}
    brands = [_Brand("gajanan_vada_pav", _Params("Gajanan Vada Pav")),
              _Brand("va_mayekar_opticians", _Params("V.A. Mayekar Opticians"))]

    store = types.ModuleType("app.tracking.store")
    store.load_snapshots = lambda key: list(records.get(key, []))
    store.get_snapshot = lambda key, run_id: next((r for r in records.get(key, []) if r.get("run_id") == run_id), None)
    store.brand_keys_with_data = lambda: set(records)

    registry = types.ModuleType("app.brands.registry")
    registry.list_brands = lambda: list(brands)

    def get_brand(key):
        for b in brands:
            if b.brand_key == key:
                return b
        raise KeyError(key)

    def create_brand(spec):
        if not spec["competitors"]:
            raise ValueError("at least one competitor is required")
        b = _Brand("ashok_vada_pav", _Params(spec["name"]), is_pilot=False)
        brands.append(b)
        return b

    registry.get_brand = get_brand
    registry.create_brand = create_brand

    providers = types.ModuleType("app.collection.registry")
    providers.available_providers = lambda: [_ProviderInfo("synthetic", "Synthetic", True, None, "offline")]

    def resolve_provider_ids(spec):
        if spec == "groq":
            raise ValueError("provider 'groq' is not configured: set GROQ_API_KEY")
        return ["synthetic"]

    providers.resolve_provider_ids = resolve_provider_ids

    runner = types.ModuleType("app.pipeline.runner")

    def run_pipeline(brand_key, *, providers="auto", samples=3, round=1, record=False, on_progress=None):
        on_progress("querying", 1, 2)
        on_progress("scoring", 2, 2)
        return {"run_id": "run-job", "status": "completed"}

    runner.run_pipeline = run_pipeline

    _install(monkeypatch, "app.tracking.store", store)
    _install(monkeypatch, "app.brands.registry", registry)
    _install(monkeypatch, "app.collection.registry", providers)
    _install(monkeypatch, "app.pipeline.runner", runner)

    sys.modules.pop("app.interface.main", None)
    main = importlib.import_module("app.interface.main")
    try:
        yield TestClient(main.app)
    finally:
        sys.modules.pop("app.interface.main", None)


def test_health_and_providers(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/providers").json()[0]["provider_id"] == "synthetic"
    assert client.get("/openapi.json").status_code == 200


def test_brands_includes_registry_and_data_only_brands(client: TestClient) -> None:
    by_key = {b["brand_key"]: b for b in client.get("/brands").json()}
    assert by_key["gajanan_vada_pav"] == {
        "brand_key": "gajanan_vada_pav", "brand": "Gajanan Vada Pav", "has_data": True, "is_pilot": True,
    }
    assert by_key["va_mayekar_opticians"]["has_data"] is False
    assert by_key["old_brand"] == {"brand_key": "old_brand", "brand": "Old Brand", "has_data": True, "is_pilot": False}

    res = client.post("/brands", json={"name": "Ashok", "category": "vada pav", "competitors": []})
    assert res.status_code == 422 and "competitor" in res.json()["detail"]
    res = client.post("/brands", json={"name": "Ashok", "category": "vada pav", "competitors": ["Gajanan"]})
    assert res.status_code == 201 and res.json()["brand_key"] == "ashok_vada_pav"


def test_latest_snapshot_404_and_strips_raw_observations(client: TestClient) -> None:
    assert client.get("/brands/va_mayekar_opticians/snapshots/latest").status_code == 404
    res = client.get("/brands/gajanan_vada_pav/snapshots/latest")
    assert res.status_code == 200
    body = res.json()
    assert body["run_id"] == "run-new" and body["status"] == "partial"
    assert "raw_observations" not in body

    obs = client.get("/brands/gajanan_vada_pav/snapshots/run-new/observations").json()
    assert obs["raw_observations"][0]["provider_id"] == "synthetic"


def test_legacy_snapshot_normalized(client: TestClient) -> None:
    [snap] = client.get("/brands/old_brand/snapshots").json()
    assert "raw_observations" not in snap
    assert len(snap["run_id"]) == 40 and snap["status"] == "completed"
    assert snap["collection_started_at"] == snap["collection_completed_at"] == LEGACY_RECORD["collected_at"]
    assert snap["admission"]["policy_version"] == "legacy" and snap["admission"]["admissible"] is True
    assert snap["recommendations"] == [] and snap["data_origin"] == "live"
    assert snap["providers"] == ["gemini"] and snap["entities"] == {"self": "Old Brand"}
    assert snap["gaps"][0]["gap_id"].startswith("gap-")

    obs = client.get(f"/brands/old_brand/snapshots/{snap['run_id']}/observations").json()
    assert obs["raw_observations"][0]["query_id"] == "q0"
    assert obs["raw_observations"][0]["provider_id"] == "gemini"


def test_run_job_lifecycle(client: TestClient) -> None:
    assert client.post("/brands/nope/runs", json={}).status_code == 404
    res = client.post("/brands/gajanan_vada_pav/runs", json={"providers": "groq"})
    assert res.status_code == 422 and "GROQ_API_KEY" in res.json()["detail"]

    res = client.post("/brands/gajanan_vada_pav/runs", json={"providers": "synthetic", "samples": 1})
    assert res.status_code == 202
    job_id = res.json()["job_id"]
    for _ in range(100):
        job = client.get(f"/jobs/{job_id}").json()
        if job["status"] not in ("queued", "running"):
            break
        time.sleep(0.02)
    assert job["status"] == "completed" and job["run_id"] == "run-job" and job["done"] == job["total"] == 2
    assert client.get("/jobs/unknown").status_code == 404
