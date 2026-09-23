"""Smoke test for run_pipeline with in-test doubles standing in for the collection
registry/retry and recommendation engine (built by other workstreams, CONTRACT §1/§6)."""

import sys
import types
from dataclasses import dataclass

import pytest

from app.collection.types import CollectionResult
from app.tracking import store


class _FakeProvider:
    def __init__(self, provider_id: str):
        self.provider_id = provider_id
        self.calls = 0

    def query(self, prompt, params):
        self.calls += 1
        if self.provider_id == "flaky" and self.calls % 2 == 0:
            raise TimeoutError("simulated timeout")
        text = "Try Ashok Vada Pav first, then Gajanan Vada Pav." if "best" in prompt else "Jumbo King is popular."
        return CollectionResult(self.provider_id, "llm", f"{self.provider_id}-v1", text, 5)


@dataclass(frozen=True)
class _FakeRec:
    recommendation_id: str
    gap_id: str
    action: str


def _install_fakes(monkeypatch):
    registry = types.ModuleType("app.collection.registry")
    registry.resolve_provider_ids = lambda spec: spec.split(",")

    def build_provider(pid, *, brand=None, round=1):
        if pid == "broken":
            raise ValueError("not configured")
        return _FakeProvider(pid)

    registry.build_provider = build_provider
    retry = types.ModuleType("app.collection.retry")
    retry.query_with_retry = lambda provider, prompt, params: provider.query(prompt, params)
    engine = types.ModuleType("app.recommendation.engine")
    engine.recommend = lambda gaps, obs, self_id, comp_ids, *, entity_names=None, max_recommendations=10: [
        _FakeRec(f"rec-{i}", f"gap-{i}", "do something") for i, _ in enumerate(gaps)
    ]
    monkeypatch.setitem(sys.modules, "app.collection.registry", registry)
    monkeypatch.setitem(sys.modules, "app.collection.retry", retry)
    monkeypatch.setitem(sys.modules, "app.recommendation.engine", engine)


def test_run_pipeline_partial_run_is_saved(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    progress = []
    snap = run_pipeline(
        "gajanan_vada_pav", providers="steady,flaky,broken", samples=2, on_progress=lambda m, d, t: progress.append((d, t))
    )
    assert snap["status"] == "partial"
    assert snap["admission"]["missing_providers"] == ["broken"]
    assert snap["data_origin"] == "live"
    assert snap["cluster_count"] == 20
    assert snap["observation_count"] == 20 * 2 + 20  # steady all, flaky half, broken none
    assert snap["raw_observations"][0]["observation_id"] == "steady:q0-s0"
    assert snap["entities"]["ashok_vada_pav"] == "Ashok Vada Pav"
    assert 0 < snap["analysis_result"]["coverage"] < 1
    assert progress[-1] == (120, 120)
    assert store.load_snapshots("gajanan_vada_pav")[0]["run_id"] == snap["run_id"]


def test_run_pipeline_raises_when_nothing_collected(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    with pytest.raises(RuntimeError):
        run_pipeline("perfume_pilot", providers="broken", samples=1)
    assert store.load_snapshots("perfume_pilot") == []
