"""Smoke tests for the HTTP API with the brands/store/provider/pipeline modules faked.

The fakes are injected into sys.modules (and onto their parent packages) before
`app.interface.main` is imported, so these tests don't depend on those modules' internals.
"""

from __future__ import annotations

import importlib
import sys
import threading
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
    runner.calls = []
    runner.gated = False  # when True, the fake waits (up to 5s) for a skip before scoring
    runner.started = threading.Event()
    runner.skipped = None

    def run_pipeline(
        brand_key, *, providers="auto", samples=3, round=None, record=False, on_progress=None,
        should_skip=None, on_provider=None,
    ):
        runner.calls.append({"providers": providers, "samples": samples, "round": round})
        on_progress("querying", 1, 2)
        if runner.gated:
            status = {"provider_id": "synthetic", "label": "Synthetic", "done": 1, "total": 2,
                      "succeeded": 1, "failed": 0, "state": "running", "note": None}
            on_provider(status)
            runner.started.set()
            for _ in range(250):
                if should_skip("synthetic"):
                    break
                time.sleep(0.02)
            runner.skipped = should_skip("synthetic")
            on_provider({**status, "done": 2, "state": "skipped", "note": "skipped"})
        on_progress("scoring", 2, 2)
        return {"run_id": "run-job", "status": "completed"}

    runner.run_pipeline = run_pipeline

    _install(monkeypatch, "app.tracking.store", store)
    _install(monkeypatch, "app.brands.registry", registry)
    _install(monkeypatch, "app.collection.registry", providers)
    _install(monkeypatch, "app.pipeline.runner", runner)

    sys.modules.pop("app.interface.main", None)
    main = importlib.import_module("app.interface.main")
    main.fake_runner = runner
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
    assert client.post("/jobs/unknown/cancel").status_code == 404
    assert client.post(f"/jobs/{job_id}/cancel").status_code == 409
    assert job["providers"] == []


def _wait_finished(client: TestClient, job_id: str) -> dict:
    for _ in range(250):
        job = client.get(f"/jobs/{job_id}").json()
        if job["status"] not in ("queued", "running"):
            return job
        time.sleep(0.02)
    raise AssertionError("job did not finish")


@pytest.mark.parametrize("provider_id", ["synthetic", None])
def test_skip_job(client: TestClient, provider_id) -> None:
    from app.interface import main

    main.fake_runner.gated = True
    first = client.post("/brands/gajanan_vada_pav/runs", json={"providers": "synthetic"}).json()
    assert main.fake_runner.started.wait(5)
    queued = client.post("/brands/gajanan_vada_pav/runs", json={"providers": "synthetic"}).json()

    assert client.post("/jobs/unknown/skip", json={"provider_id": None}).status_code == 404
    res = client.post(f"/jobs/{queued['job_id']}/skip", json={"provider_id": None})
    assert res.status_code == 409 and "cancel" in res.json()["detail"]
    assert client.post(f"/jobs/{queued['job_id']}/cancel").json()["status"] == "cancelled"

    running = client.get(f"/jobs/{first['job_id']}").json()
    assert running["providers"] == [{"provider_id": "synthetic", "label": "Synthetic", "done": 1, "total": 2,
                                     "succeeded": 1, "failed": 0, "state": "running", "note": None}]
    assert client.post(f"/jobs/{first['job_id']}/skip", json={"provider_id": "groq"}).status_code == 422

    res = client.post(f"/jobs/{first['job_id']}/skip", json={"provider_id": provider_id})
    assert res.status_code == 200
    assert res.json()["message"] == ("Skipping Synthetic…" if provider_id else
                                     "Finishing now with the answers collected so far…")
    job = _wait_finished(client, first["job_id"])
    assert main.fake_runner.skipped is True
    assert job["status"] == "completed" and job["providers"][0]["state"] == "skipped"
    assert client.post(f"/jobs/{first['job_id']}/skip", json={"provider_id": None}).status_code == 409


def test_run_without_round_lets_the_pipeline_pick_it(client: TestClient) -> None:
    from app.interface import main

    for body, expected in (({"providers": "synthetic", "samples": 1}, None), ({"round": 4}, 4)):
        res = client.post("/brands/gajanan_vada_pav/runs", json=body)
        assert res.status_code == 202
        job_id = res.json()["job_id"]
        for _ in range(100):
            if client.get(f"/jobs/{job_id}").json()["status"] not in ("queued", "running"):
                break
            time.sleep(0.02)
        assert main.fake_runner.calls[-1]["round"] == expected
    assert client.post("/brands/gajanan_vada_pav/runs", json={"round": 0}).status_code == 422


@pytest.fixture
def real_client(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """The real brands registry + question-set module over a temp DATA_DIR."""
    from app.tracking import store

    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    sys.modules.pop("app.interface.main", None)
    main = importlib.import_module("app.interface.main")
    try:
        yield TestClient(main.app)
    finally:
        sys.modules.pop("app.interface.main", None)


def test_questions_get_put_delete(real_client: TestClient) -> None:
    url = "/brands/gajanan_vada_pav/questions"
    assert real_client.get("/brands/nope/questions").status_code == 404
    assert real_client.put("/brands/nope/questions", json={"questions": [{"text": "hello there"}]}).status_code == 404
    assert real_client.delete("/brands/nope/questions").status_code == 404

    from app.brands.registry import get_brand
    from app.querysets import custom

    default_count = len(custom.build_query_set(get_brand("gajanan_vada_pav"))[1])
    body = real_client.get(url).json()
    assert body["brand_key"] == "gajanan_vada_pav" and body["customized"] is False
    assert body["scored_count"] == default_count and body["unscored_count"] == 0
    assert set(body["questions"][0]) == {"id", "text", "intent_type", "source", "enabled", "names_brand", "scored"}

    res = real_client.put(url, json={"questions": [
        {"text": "best vada pav near Dadar station"},
        {"text": "is Gajanan Vada Pav good for breakfast", "enabled": True},
        {"text": "vada pav outlet for students", "intent_type": "category_discovery", "source": "template"},
    ]})
    assert res.status_code == 200
    saved = res.json()
    assert saved["customized"] is True and saved["scored_count"] == 2 and saved["unscored_count"] == 1
    assert saved["questions"][1] | {"id": 1} == {
        "id": 1, "text": "is Gajanan Vada Pav good for breakfast", "intent_type": "custom", "source": "custom",
        "enabled": True, "names_brand": True, "scored": False,
    }
    assert real_client.get(url).json() == saved

    res = real_client.put(url, json={"questions": [{"text": "is Gajanan Vada Pav open late"}]})
    assert res.status_code == 422 and "must not mention" in res.json()["detail"]
    res = real_client.put(url, json={"questions": [{"text": "hello there", "intent_type": "bogus"}]})
    assert res.status_code == 422 and isinstance(res.json()["detail"], str)
    assert real_client.get(url).json() == saved  # a rejected save changes nothing

    reset = real_client.delete(url).json()
    assert reset["customized"] is False and reset["scored_count"] == default_count
