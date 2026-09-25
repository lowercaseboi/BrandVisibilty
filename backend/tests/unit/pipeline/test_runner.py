"""Smoke test for run_pipeline with in-test doubles standing in for the collection
registry/retry and recommendation engine (built by other workstreams, CONTRACT §1/§6)."""

import sys
import types
from dataclasses import dataclass

import pytest

from app.collection.retry import Skipped
from app.collection.types import CollectionResult
from app.tracking import store


def _n_questions(brand_key: str) -> int:
    """Default scored question count (derived, so template edits don't break these tests)."""
    from app.brands.registry import get_brand
    from app.querysets import custom

    _, scored, _ = custom.build_query_set(get_brand(brand_key))
    return len(scored)


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
    retry.Skipped = Skipped
    retry.query_with_retry = lambda provider, prompt, params, **kwargs: provider.query(prompt, params)
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

    n = _n_questions("gajanan_vada_pav")
    progress = []
    snap = run_pipeline(
        "gajanan_vada_pav", providers="steady,flaky,broken", samples=2, on_progress=lambda m, d, t: progress.append((d, t))
    )
    assert snap["status"] == "partial"
    assert snap["admission"]["missing_providers"] == ["broken"]
    assert snap["data_origin"] == "live"
    assert snap["cluster_count"] == n
    assert snap["observation_count"] == n * 2 + n  # steady all, flaky half, broken none
    assert snap["unscored_observation_count"] == 0
    assert snap["raw_observations"][0]["observation_id"] == "steady:q0-s0"
    assert snap["entities"]["ashok_vada_pav"] == "Ashok Vada Pav"
    assert 0 < snap["analysis_result"]["coverage"] < 1
    assert progress[-1] == (3 * n * 2, 3 * n * 2)
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

    n = _n_questions("gajanan_vada_pav")
    progress = []
    snap = runner.run_pipeline(
        "gajanan_vada_pav", providers="steady,dead", samples=1, on_progress=lambda m, d, t: progress.append((m, d, t))
    )
    assert snap["status"] == "partial" and snap["observation_count"] == n
    dead_failures = [m for m, _, _ in progress if m.startswith("dead · ") and "failed" in m]
    assert len(dead_failures) == runner.GIVE_UP_AFTER_CONSECUTIVE_FAILURES
    assert dead_failures[0] == "dead · question 1, answer 1 failed (timed out)"
    assert any(m == "dead skipped for the rest of this run after 3 failures in a row" for m, _, _ in progress)
    assert max(d for _, d, _ in progress) == progress[-1][2] == 2 * n


def test_progress_messages_are_human_readable(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    n = _n_questions("gajanan_vada_pav")
    messages = []
    snap = run_pipeline("gajanan_vada_pav", providers="steady", samples=3, on_progress=lambda m, d, t: messages.append(m))
    assert messages[0] == f"Asking Steady AI {n} questions, 3 times each ({3 * n} calls)"
    assert messages[1].startswith(f"Steady AI · question 1 of {n}, answer 1 of 3 · “best vada pav outlet for")
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
    assert snap["query_set_template_version"].endswith("-custom")
    assert snap["unscored_observation_count"] == 2
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


def _latest_by_provider(payloads: list[dict]) -> dict[str, dict]:
    return {p["provider_id"]: p for p in payloads}


def test_skipping_one_provider_mid_run_keeps_its_answers(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    n = _n_questions("gajanan_vada_pav")
    payloads, messages = [], []

    def should_skip(pid):
        latest = _latest_by_provider(payloads).get(pid, {})
        return pid == "second" and latest.get("succeeded", 0) >= 3

    snap = run_pipeline(
        "gajanan_vada_pav", providers="steady,second", samples=1,
        on_progress=lambda m, d, t: messages.append((m, d, t)), should_skip=should_skip, on_provider=payloads.append,
    )
    assert payloads[0]["state"] == "queued" and {p["provider_id"] for p in payloads[:2]} == {"steady", "second"}
    final = _latest_by_provider(payloads)
    assert final["steady"] == {
        "provider_id": "steady", "label": "Steady AI", "done": n, "total": n, "succeeded": n, "failed": 0,
        "state": "done", "note": None, "wait_seconds": None, "skip_reason": None,
    }
    assert final["second"]["state"] == "skipped" and final["second"]["skip_reason"] == "user" and final["second"]["succeeded"] == 3
    assert final["second"]["done"] == final["second"]["total"] == n
    assert ("second skipped — continuing with the answers collected so far") in [m for m, _, _ in messages]
    assert snap["status"] == "partial" and snap["observation_count"] == n + 3
    assert snap["admission"]["missing_providers"] == []
    assert max(d for _, d, _ in messages) == 2 * n


def test_skipped_provider_without_answers_is_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    snap = run_pipeline("gajanan_vada_pav", providers="steady,second", samples=1, should_skip=lambda pid: pid == "second")
    assert snap["status"] == "partial"
    assert snap["admission"]["missing_providers"] == ["second"]
    assert {o["provider_id"] for o in snap["raw_observations"]} == {"steady"}


def test_skip_all_scores_what_was_collected(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    payloads, messages = [], []
    snap = run_pipeline(
        "gajanan_vada_pav", providers="steady", samples=1, on_progress=lambda m, d, t: messages.append(m),
        should_skip=lambda pid: any(p["succeeded"] >= 5 for p in payloads), on_provider=payloads.append,
    )
    assert snap["observation_count"] == 5 and snap["status"] == "partial"
    assert "Scoring answers…" in messages
    assert store.load_snapshots("gajanan_vada_pav")[-1]["run_id"] == snap["run_id"]


def test_skip_all_before_any_answer_fails_the_run(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline.runner import run_pipeline

    with pytest.raises(RuntimeError, match="No answers were collected before the run was skipped"):
        run_pipeline("gajanan_vada_pav", providers="steady,second", samples=1, should_skip=lambda pid: True)
    assert store.load_snapshots("gajanan_vada_pav") == []


def test_provider_stuck_on_rate_limit_is_auto_skipped(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline import runner

    clock = [0.0]
    monkeypatch.setattr(runner, "_now", lambda: clock[0])

    def fake_retry(provider, prompt, params, *, should_stop=None, on_wait=None):
        """Mimics the real retry: 4 attempts, a 40s rate-limit wait between them."""
        for attempt in range(4):
            if should_stop is not None and should_stop():
                raise Skipped
            try:
                return provider.query(prompt, params)
            except TimeoutError:
                if attempt == 3:
                    raise
                on_wait(40.0, "rate limited")
                clock[0] += 40.0

    sys.modules["app.collection.retry"].query_with_retry = fake_retry
    n = _n_questions("gajanan_vada_pav")
    payloads, messages = [], []
    snap = runner.run_pipeline(
        "gajanan_vada_pav", providers="steady,dead", samples=1,
        on_progress=lambda m, d, t: messages.append((m, d, t)), on_provider=payloads.append,
    )
    texts = [m for m, _, _ in messages]
    assert f"dead rate limited — waiting 40s before retrying (question 1 of {n})" in texts
    assert "dead auto-skipped: no answer for 2 minutes (rate limited)" in texts
    assert not any("failures in a row" in m for m in texts)
    waiting = [p for p in payloads if p["provider_id"] == "dead" and p["state"] == "waiting"]
    assert waiting and waiting[0]["note"] == "waiting 40s — rate limited" and waiting[0]["wait_seconds"] == 40
    final = _latest_by_provider(payloads)["dead"]
    assert final["state"] == "skipped" and final["skip_reason"] == "auto" and final["note"] == "auto-skipped after 2 min without an answer"
    assert final["done"] == final["total"] == n and final["succeeded"] == 0
    assert snap["admission"]["missing_providers"] == ["dead"] and snap["status"] == "partial"
    assert messages[-1][1] == messages[-1][2] == 2 * n


def test_waiting_payload_carries_rounded_up_wait_seconds(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.pipeline import runner

    waited = []

    def fake_retry(provider, prompt, params, *, should_stop=None, on_wait=None):
        if not waited:  # one short wait before the very first answer
            waited.append(True)
            on_wait(12.2, "rate limited")
        return provider.query(prompt, params)

    sys.modules["app.collection.retry"].query_with_retry = fake_retry
    payloads = []
    runner.run_pipeline("gajanan_vada_pav", providers="steady", samples=1, on_provider=payloads.append)
    assert payloads[0]["state"] == "queued" and payloads[0]["wait_seconds"] is None
    waiting = [p for p in payloads if p["state"] == "waiting"]
    assert [p["wait_seconds"] for p in waiting] == [13]
    assert waiting[0]["note"] == "waiting 12s — rate limited"
    assert all(p["wait_seconds"] is None for p in payloads if p["state"] != "waiting")
    assert payloads[-1]["state"] == "done"


def test_snapshot_mention_summary_counts_scored_answers_only(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    _install_fakes(monkeypatch)
    from app.brands.registry import get_brand
    from app.pipeline.runner import run_pipeline
    from app.querysets import custom

    _, scored, _ = custom.build_query_set(get_brand("gajanan_vada_pav"))
    n = len(scored)
    best = sum(1 for q in scored if "best" in q.text)  # the fake names Ashok then Gajanan for these
    snap = run_pipeline("gajanan_vada_pav", providers="steady", samples=2)
    summary = snap["mention_summary"]
    assert summary["total_answers"] == 2 * n == snap["observation_count"]
    assert set(summary["entities"]) == set(get_brand("gajanan_vada_pav").entity_names())
    assert summary["entities"]["ashok_vada_pav"] == {"answers_mentioning": 2 * best, "answers_ranked_first": 2 * best}
    assert summary["entities"]["self"] == {"answers_mentioning": 2 * best, "answers_ranked_first": 0}
    assert summary["entities"]["jumbo_king"] == {
        "answers_mentioning": 2 * (n - best), "answers_ranked_first": 2 * (n - best),
    }
    assert summary["entities"]["goli_vada_pav"] == {"answers_mentioning": 0, "answers_ranked_first": 0}

    # Brand-named (unscored) answers are asked but not counted.
    _save_custom_questions()
    custom_snap = run_pipeline("gajanan_vada_pav", providers="steady", samples=1)
    assert custom_snap["unscored_observation_count"] == 1
    assert custom_snap["mention_summary"]["total_answers"] == 2
