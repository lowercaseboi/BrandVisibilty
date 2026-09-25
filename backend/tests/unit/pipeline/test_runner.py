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
        if self.provider_id == "dead" or (self.provider_id == "flaky" and self.calls % 2 == 0):
            raise TimeoutError("simulated timeout")
        if self.provider_id == "picky" and "Gajanan" in prompt:
            raise TimeoutError("simulated timeout on brand-named questions")
        text = "Try Ashok Vada Pav first, then Gajanan Vada Pav." if "best" in prompt else "Jumbo King is popular."
        return CollectionResult(self.provider_id, "llm", f"{self.provider_id}-v1", text, 5)


@dataclass(frozen=True)
class _FakeRec:
    recommendation_id: str
    gap_id: str
    action: str


def _install_fakes(monkeypatch, rounds=None):
    registry = types.ModuleType("app.collection.registry")
    registry.resolve_provider_ids = lambda spec: spec.split(",")
    registry.provider_label = lambda pid: {"steady": "Steady AI"}.get(pid, pid)

    def build_provider(pid, *, brand=None, round=1):
        if rounds is not None:
            rounds.append(round)
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


def test_provider_failing_repeatedly_is_abandoned(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline import runner

    progress = []
    snap = runner.run_pipeline(
        "gajanan_vada_pav", providers="steady,dead", samples=1, on_progress=lambda m, d, t: progress.append((m, d, t))
    )
    assert snap["status"] == "partial" and snap["observation_count"] == 20
    dead_failures = [m for m, _, _ in progress if m.startswith("dead · ") and "failed" in m]
    assert len(dead_failures) == runner.GIVE_UP_AFTER_CONSECUTIVE_FAILURES
    assert dead_failures[0] == "dead · question 1, answer 1 failed (timed out)"
    assert any(m == "dead skipped for the rest of this run after 3 failures in a row" for m, _, _ in progress)
    assert max(d for _, d, _ in progress) == progress[-1][2] == 40


def test_progress_messages_are_human_readable(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    messages = []
    snap = run_pipeline("gajanan_vada_pav", providers="steady", samples=3, on_progress=lambda m, d, t: messages.append(m))
    assert messages[0] == "Asking Steady AI 20 questions, 3 times each (60 calls)"
    assert messages[1].startswith("Steady AI · question 1 of 20, answer 1 of 3 · “best vada pav outlet for")
    assert messages[1].endswith(" · brand mentioned")  # "best" prompts name Gajanan in the fake
    assert "Scoring answers…" in messages
    assert messages[-1] == f"Saved run {snap['run_id']} (completed)"


def test_short_error_never_leaks_http_details():
    import httpx

    from app.pipeline.runner import _short_error

    request = httpx.Request("GET", "https://api.example.com/v1?key=SECRET")

    def http_error(code):
        return httpx.HTTPStatusError("boom SECRET", request=request, response=httpx.Response(code, request=request))

    assert _short_error(http_error(429)) == "rate limited"
    assert _short_error(http_error(503)) == "provider error 503"
    assert "SECRET" not in _short_error(http_error(401))
    assert _short_error(httpx.ReadTimeout("slow", request=request)) == "timed out"
    assert _short_error(KeyError("x")) == "KeyError"


def _save_custom_questions(extra_brand_named=True):
    from app.brands.registry import get_brand
    from app.querysets import custom

    questions = [
        {"text": "best vada pav near Dadar station"},
        {"text": "vada pav outlet for students", "intent_type": "category_discovery", "source": "template"},
    ]
    if extra_brand_named:
        questions.append({"text": "is Gajanan Vada Pav good for breakfast"})
    return custom.save_questions(get_brand("gajanan_vada_pav"), questions)


def test_custom_questions_brand_named_are_asked_but_not_scored(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    qs = _save_custom_questions()
    assert qs["scored_count"] == 2 and qs["unscored_count"] == 1

    messages, totals = [], []
    snap = run_pipeline(
        "gajanan_vada_pav", providers="steady", samples=2,
        on_progress=lambda m, d, t: (messages.append(m), totals.append(t)),
    )
    assert messages[0] == (
        "Asking Steady AI 2 questions + 1 brand-named question (not scored), twice each (6 calls)"
    )
    assert set(totals) == {6}
    raws = snap["raw_observations"]
    unscored = [o for o in raws if not o["scored"]]
    assert [o["observation_id"] for o in unscored] == ["steady:p0-s0", "steady:p0-s1"]
    assert all(o["query_id"] == "p0" for o in unscored)
    assert {o["query_id"] for o in raws if o["scored"]} == {"q0", "q1"}
    # Metrics, cluster count and admission are over the scored q* questions only.
    assert snap["observation_count"] == 4 and snap["cluster_count"] == 2
    assert snap["status"] == "completed" and snap["admission"]["admissible"]
    assert snap["query_set_template_version"] == "v1-custom"
    for gap in snap["gaps"]:
        assert not any(":p" in ref for ref in gap["evidence_refs"])

    # Same scored questions without the brand-named one -> identical metrics.
    _save_custom_questions(extra_brand_named=False)
    plain = run_pipeline("gajanan_vada_pav", providers="steady", samples=2)
    assert plain["analysis_result"] == snap["analysis_result"]
    assert plain["gaps"] == snap["gaps"]


def test_failed_brand_named_calls_do_not_affect_status(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    _save_custom_questions()
    snap = run_pipeline("gajanan_vada_pav", providers="picky", samples=1)
    assert snap["status"] == "completed"
    assert snap["admission"]["missing_query_ids"] == []
    assert all(o["scored"] for o in snap["raw_observations"])


def test_round_none_auto_increments_for_synthetic(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    rounds = []
    _install_fakes(monkeypatch, rounds)
    from app.pipeline.runner import run_pipeline

    for origin in ("synthetic", "live", "synthetic"):
        store.append_snapshot({"brand_key": "gajanan_vada_pav", "data_origin": origin})
    run_pipeline("gajanan_vada_pav", providers="steady", samples=1)
    run_pipeline("gajanan_vada_pav", providers="steady", samples=1, round=7)
    assert rounds == [3, 7]
