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
