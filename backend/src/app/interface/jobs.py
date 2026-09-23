"""In-memory background job runner for pipeline runs (CONTRACT §7).

MVP stand-in for Celery: one worker thread drains a FIFO queue, so runs execute
one at a time. Job state lives in process memory and is lost on restart.
"""

from __future__ import annotations

import queue
import threading
import uuid
from collections.abc import Callable
from typing import Any

# (brand_key, providers, samples, round, on_progress) -> snapshot record
RunFn = Callable[..., dict]


class JobManager:
    def __init__(self, run_fn: Callable[[], RunFn]) -> None:
        # run_fn is a thunk so the pipeline module is resolved at execution time.
        self._run_fn = run_fn
        self._jobs: dict[str, dict[str, Any]] = {}
        self._order: list[str] = []
        self._lock = threading.Lock()
        self._queue: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue()
        self._worker: threading.Thread | None = None

    def submit(self, brand_key: str, *, providers: str, samples: int, round: int) -> dict[str, Any]:
        job_id = uuid.uuid4().hex
        job = {
            "job_id": job_id,
            "brand_key": brand_key,
            "status": "queued",
            "message": "Queued",
            "done": 0,
            "total": 0,
            "run_id": None,
            "error": None,
        }
        with self._lock:
            self._jobs[job_id] = job
            self._order.append(job_id)
        self._ensure_worker()
        self._queue.put((job_id, {"providers": providers, "samples": samples, "round": round}))
        return dict(job)

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def list(self, brand_key: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            jobs = [dict(self._jobs[j]) for j in self._order]
        if brand_key is not None:
            jobs = [j for j in jobs if j["brand_key"] == brand_key]
        return jobs

    def _update(self, job_id: str, **fields: Any) -> None:
        with self._lock:
            self._jobs[job_id].update(fields)

    def _ensure_worker(self) -> None:
        with self._lock:
            if self._worker is None or not self._worker.is_alive():
                self._worker = threading.Thread(target=self._loop, name="pipeline-jobs", daemon=True)
                self._worker.start()

    def _loop(self) -> None:
        while True:
            job_id, kwargs = self._queue.get()
            try:
                self._execute(job_id, kwargs)
            finally:
                self._queue.task_done()

    def _execute(self, job_id: str, kwargs: dict[str, Any]) -> None:
        brand_key = self._jobs[job_id]["brand_key"]
        self._update(job_id, status="running", message="Starting run")

        def on_progress(message: str, done: int, total: int) -> None:
            self._update(job_id, message=message, done=done, total=total)

        try:
            snapshot = self._run_fn()(brand_key, on_progress=on_progress, **kwargs)
        except Exception as exc:  # noqa: BLE001 - surface any failure on the job, never crash the worker
            self._update(job_id, status="failed", message="Run failed", error=f"{type(exc).__name__}: {exc}")
            return

        status = snapshot.get("status", "completed")
        if status not in ("completed", "partial"):
            status = "completed"
        with self._lock:
            job = self._jobs[job_id]
            job.update(
                status=status,
                run_id=snapshot.get("run_id"),
                message="Run completed" if status == "completed" else "Run completed with missing data (partial)",
            )
            if job["total"] and job["done"] < job["total"]:
                job["done"] = job["total"]
