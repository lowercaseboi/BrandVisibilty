"""JobManager cancellation: queued jobs are dropped, running jobs stop at the next
progress call during collection, and a cancel after collection is ignored."""

from __future__ import annotations

import threading
import time

from app.interface.jobs import JobManager


def _wait(manager: JobManager, job_id: str, statuses: set[str]) -> dict:
    for _ in range(250):
        job = manager.get(job_id)
        if job["status"] in statuses:
            return job
        time.sleep(0.02)
    raise AssertionError(f"job stuck in {manager.get(job_id)['status']}")


def _gated_run(gate: threading.Event, started: threading.Event, calls: list[str], *, done_before_gate: int):
    """A fake pipeline: reports `done_before_gate`/2 progress, blocks on `gate`, then reports again."""

    def run(brand_key, *, on_progress, **kwargs):
        calls.append(brand_key)
        on_progress("collecting", done_before_gate, 2)
        started.set()
        gate.wait(5)
        on_progress("next call", 2 if done_before_gate == 2 else 1, 2)
        on_progress("saved", 2, 2)
        return {"run_id": f"run-{brand_key}", "status": "completed"}

    return run


def test_cancel_queued_job_never_runs():
    gate, started, calls = threading.Event(), threading.Event(), []
    manager = JobManager(lambda: _gated_run(gate, started, calls, done_before_gate=0))
    first = manager.submit("a", providers="auto", samples=1, round=1)
    second = manager.submit("b", providers="auto", samples=1, round=1)
    assert started.wait(5)

    assert manager.cancel(second["job_id"])["status"] == "cancelled"
    gate.set()
    assert _wait(manager, first["job_id"], {"completed"})["run_id"] == "run-a"
    time.sleep(0.1)
    assert calls == ["a"] and manager.get(second["job_id"])["status"] == "cancelled"


def test_cancel_running_job_stops_before_saving():
    gate, started, calls = threading.Event(), threading.Event(), []
    manager = JobManager(lambda: _gated_run(gate, started, calls, done_before_gate=0))
    job = manager.submit("a", providers="auto", samples=1, round=1)
    assert started.wait(5)

    assert manager.cancel(job["job_id"])["status"] == "running"
    gate.set()
    final = _wait(manager, job["job_id"], {"cancelled", "completed", "failed"})
    assert final["status"] == "cancelled" and final["run_id"] is None


def test_cancel_after_collection_lets_run_finish():
    gate, started, calls = threading.Event(), threading.Event(), []
    manager = JobManager(lambda: _gated_run(gate, started, calls, done_before_gate=2))
    job = manager.submit("a", providers="auto", samples=1, round=1)
    assert started.wait(5)

    manager.cancel(job["job_id"])
    gate.set()
    assert _wait(manager, job["job_id"], {"cancelled", "completed", "failed"})["status"] == "completed"


def test_cancel_unknown_job():
    assert JobManager(lambda: None).cancel("nope") is None


def test_skip_requests_reach_the_pipeline_and_are_cleared():
    import pytest

    from app.interface import jobs as jobs_module

    started, seen = threading.Event(), {}

    def run(brand_key, *, on_progress, should_skip, on_provider, **kwargs):
        for pid in ("gemini", "groq"):
            on_provider({"provider_id": pid, "label": pid.title(), "done": 0, "total": 2, "succeeded": 0,
                         "failed": 0, "state": "running", "note": None})
        started.set()
        for _ in range(250):
            if should_skip("groq"):
                break
            time.sleep(0.02)
        seen.update(groq=should_skip("groq"), gemini=should_skip("gemini"))
        on_provider({"provider_id": "groq", "label": "Groq", "done": 2, "total": 2, "succeeded": 0,
                     "failed": 0, "state": "skipped", "note": "skipped"})
        return {"run_id": "r", "status": "partial"}

    manager = JobManager(lambda: run)
    job = manager.submit("a", providers="auto", samples=1)
    assert started.wait(5)
    with pytest.raises(jobs_module.UnknownProvider):
        manager.skip(job["job_id"], "openai")
    assert manager.skip(job["job_id"], "groq")["message"] == "Skipping Groq…"
    final = _wait(manager, job["job_id"], {"partial", "failed"})
    assert final["status"] == "partial" and seen == {"groq": True, "gemini": False}
    assert [p["provider_id"] for p in final["providers"]] == ["gemini", "groq"]
    assert final["providers"][1]["state"] == "skipped"
    assert manager.skip("nope", None) is None
    with pytest.raises(jobs_module.JobNotRunning):
        manager.skip(job["job_id"], None)
    assert not manager._skip_providers and not manager._skip_all and not manager._cancel_requested


def test_finished_jobs_are_pruned(monkeypatch):
    from app.interface import jobs as jobs_module

    monkeypatch.setattr(jobs_module, "MAX_FINISHED_JOBS", 2)
    manager = JobManager(lambda: (lambda brand_key, **kw: {"run_id": brand_key, "status": "completed"}))
    ids = [manager.submit(k, providers="auto", samples=1)["job_id"] for k in "abcd"]
    _wait(manager, ids[-1], {"completed"})
    assert [j["brand_key"] for j in manager.list()] == ["c", "d"]
    assert manager.get(ids[0]) is None


def test_job_state_is_persisted_to_disk_and_matches_get(tmp_path, monkeypatch):
    """Every state change is written to DATA_DIR/jobs/<job_id>.json; the file's contents match
    what get() returns once the run has settled into a stable (throttle-safe) state."""
    import json

    from app.interface import jobs as jobs_module

    monkeypatch.setattr(jobs_module.paths, "DATA_DIR", tmp_path)
    gate, started, calls = threading.Event(), threading.Event(), []
    manager = JobManager(lambda: _gated_run(gate, started, calls, done_before_gate=0))
    job = manager.submit("a", providers="auto", samples=1, round=1)
    assert started.wait(5)

    job_file = tmp_path / "jobs" / f"{job['job_id']}.json"
    assert job_file.exists()
    on_disk = json.loads(job_file.read_text())
    assert on_disk["status"] == "running"
    assert on_disk["job_id"] == job["job_id"]
    assert on_disk["brand_key"] == "a"

    gate.set()
    final = _wait(manager, job["job_id"], {"completed"})
    on_disk = json.loads(job_file.read_text())
    assert on_disk["status"] == "completed" and on_disk["run_id"] == final["run_id"] == "run-a"


def test_interrupted_jobs_are_marked_on_restart(tmp_path, monkeypatch):
    """A job left "queued" or "running" by a previous process becomes "interrupted" once a new
    JobManager calls recover_from_restart(); a job that had already finished is restored as-is,
    and both are served by get()/list() after the "restart"."""
    import json

    from app.interface import jobs as jobs_module

    monkeypatch.setattr(jobs_module.paths, "DATA_DIR", tmp_path)
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir(parents=True)
    stale_running = {
        "job_id": "stale-running",
        "brand_key": "a",
        "status": "running",
        "message": "Starting run",
        "done": 1,
        "total": 4,
        "run_id": None,
        "error": None,
        "providers": [],
        "created_at": 1.0,
    }
    stale_queued = {**stale_running, "job_id": "stale-queued", "status": "queued", "created_at": 2.0}
    finished = {**stale_running, "job_id": "done-job", "status": "completed", "run_id": "run-x", "created_at": 3.0}
    for record in (stale_running, stale_queued, finished):
        (jobs_dir / f"{record['job_id']}.json").write_text(json.dumps(record))

    manager = JobManager(lambda: None)
    manager.recover_from_restart()

    for job_id in ("stale-running", "stale-queued"):
        job = manager.get(job_id)
        assert job["status"] == "interrupted"
        assert job["error"] == "server restarted before the run finished"
        on_disk = json.loads((jobs_dir / f"{job_id}.json").read_text())
        assert on_disk["status"] == "interrupted"

    done = manager.get("done-job")
    assert done["status"] == "completed" and done["run_id"] == "run-x"
    assert [j["job_id"] for j in manager.list("a")] == ["stale-running", "stale-queued", "done-job"]


def test_pruning_removes_old_finished_job_files(tmp_path, monkeypatch):
    from app.interface import jobs as jobs_module

    monkeypatch.setattr(jobs_module.paths, "DATA_DIR", tmp_path)
    monkeypatch.setattr(jobs_module, "MAX_FINISHED_JOBS", 2)
    manager = JobManager(lambda: (lambda brand_key, **kw: {"run_id": brand_key, "status": "completed"}))
    ids = [manager.submit(k, providers="auto", samples=1)["job_id"] for k in "abcd"]
    _wait(manager, ids[-1], {"completed"})

    jobs_dir = tmp_path / "jobs"
    remaining = {p.stem for p in jobs_dir.glob("*.json")}
    assert remaining == {ids[-2], ids[-1]}
    assert not (jobs_dir / f"{ids[0]}.json").exists()
    assert not (jobs_dir / f"{ids[1]}.json").exists()


def test_single_worker_guard_rejects_multiple_workers(monkeypatch):
    import pytest

    from app.interface import jobs as jobs_module

    monkeypatch.setenv("WEB_CONCURRENCY", "3")
    with pytest.raises(jobs_module.MultipleWorkersError):
        JobManager(lambda: None)
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)

    monkeypatch.setenv("UVICORN_WORKERS", "2")
    with pytest.raises(jobs_module.MultipleWorkersError):
        JobManager(lambda: None)
    monkeypatch.delenv("UVICORN_WORKERS", raising=False)

    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    JobManager(lambda: None)  # does not raise


def test_cancel_interrupts_a_provider_waiting_on_a_rate_limit():
    started = threading.Event()

    def run(brand_key, *, on_progress, should_skip, on_provider, **kwargs):
        on_progress("Groq rate limited — waiting 60s before retrying (question 1 of 5)", 0, 10)
        started.set()
        for _ in range(250):  # the retry wait polls should_stop in slices
            if should_skip("groq"):
                break
            time.sleep(0.02)
        on_provider({"provider_id": "groq", "label": "Groq", "done": 10, "total": 10, "succeeded": 0,
                     "failed": 0, "state": "skipped", "note": "skipped"})
        on_progress("Groq skipped", 10, 10)
        return {"run_id": "r", "status": "completed"}

    manager = JobManager(lambda: run)
    job = manager.submit("a", providers="auto", samples=1)
    assert started.wait(5)
    manager.cancel(job["job_id"])
    final = _wait(manager, job["job_id"], {"cancelled", "completed", "failed"})
    assert final["status"] == "cancelled" and final["run_id"] is None
