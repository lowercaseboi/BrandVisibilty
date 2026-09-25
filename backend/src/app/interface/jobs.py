"""In-memory background job runner for pipeline runs (CONTRACT §7).

MVP stand-in for Celery: one worker thread drains a FIFO queue, so runs execute
one at a time. Job state lives in process memory and is lost on restart.

Cancelling a queued job drops it before it starts. Cancelling a running job is
cooperative: it stops at the next provider-call boundary during collection and saves
nothing. Once collection is done the run is too close to finishing to leave half-saved,
so a late cancel is ignored and the run completes normally.

Skipping is also cooperative: `skip(job_id, provider_id)` asks the pipeline to stop
calling one provider (or, with provider_id None, every provider) — including mid-way
through a retry wait — and the run is scored and saved with what was collected. The
pipeline's per-provider progress is kept on the job as `providers`.
"""

from __future__ import annotations

import queue
import threading
import uuid
from collections.abc import Callable
from typing import Any

# (brand_key, providers, samples, round, on_progress, should_skip, on_provider) -> snapshot record
RunFn = Callable[..., dict]

TERMINAL_STATUSES = frozenset({"completed", "partial", "failed", "cancelled"})
MAX_FINISHED_JOBS = 100


class JobNotRunning(Exception):
    """skip() on a job that is queued or already finished."""


class UnknownProvider(ValueError):
    """skip() named a provider this job isn't using."""


class JobCancelled(Exception):
    """Raised from on_progress inside the pipeline to unwind a cancelled run."""


class JobManager:
    def __init__(self, run_fn: Callable[[], RunFn]) -> None:
        # run_fn is a thunk so the pipeline module is resolved at execution time.
        self._run_fn = run_fn
        self._jobs: dict[str, dict[str, Any]] = {}
        self._order: list[str] = []
        self._lock = threading.Lock()
        self._queue: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue()
        self._worker: threading.Thread | None = None
        self._cancel_requested: set[str] = set()
        self._skip_providers: dict[str, set[str]] = {}
        self._skip_all: set[str] = set()

    def submit(self, brand_key: str, *, providers: str, samples: int, round: int | None = None) -> dict[str, Any]:
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
            "providers": [],
        }
        with self._lock:
            self._jobs[job_id] = job
            self._order.append(job_id)
            submitted = self._copy(job)
        self._ensure_worker()
        self._queue.put((job_id, {"providers": providers, "samples": samples, "round": round}))
        return submitted

    @staticmethod
    def _copy(job: dict[str, Any]) -> dict[str, Any]:
        return {**job, "providers": [dict(p) for p in job["providers"]]}

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return self._copy(job) if job else None

    def list(self, brand_key: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            jobs = [self._copy(self._jobs[j]) for j in self._order]
        if brand_key is not None:
            jobs = [j for j in jobs if j["brand_key"] == brand_key]
        return jobs

    def cancel(self, job_id: str) -> dict[str, Any] | None:
        """None if unknown; otherwise the job after the request (unchanged if already finished)."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job["status"] == "queued":
                job.update(status="cancelled", message="Cancelled before it started")
                snapshot = self._copy(job)
                self._prune_locked()
                return snapshot
            if job["status"] == "running":
                self._cancel_requested.add(job_id)
                job["message"] = "Cancelling after the current call…"
            return self._copy(job)

    def skip(self, job_id: str, provider_id: str | None) -> dict[str, Any] | None:
        """Skip one provider's remaining calls (provider_id), or all of them (None) so the run
        goes straight to scoring what was collected. None if the job is unknown; raises
        JobNotRunning unless it is running, UnknownProvider if it doesn't use provider_id."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job["status"] != "running":
                raise JobNotRunning(job["status"])
            if provider_id is None:
                self._skip_all.add(job_id)
                job["message"] = "Finishing now with the answers collected so far…"
            else:
                entry = next((p for p in job["providers"] if p["provider_id"] == provider_id), None)
                if entry is None:
                    raise UnknownProvider(provider_id)
                self._skip_providers.setdefault(job_id, set()).add(provider_id)
                job["message"] = f"Skipping {entry['label']}…"
            return self._copy(job)

    def _should_skip(self, job_id: str, provider_id: str) -> bool:
        with self._lock:
            return (
                job_id in self._skip_all
                or job_id in self._cancel_requested  # interrupts retry waits so a cancel is prompt
                or provider_id in self._skip_providers.get(job_id, ())
            )

    def _update(self, job_id: str, **fields: Any) -> None:
        with self._lock:
            self._jobs[job_id].update(fields)

    def _finish(self, job_id: str, **fields: Any) -> None:
        """Set the final fields, drop the job's cancel/skip requests and prune old jobs."""
        with self._lock:
            self._jobs[job_id].update(fields)
            self._cancel_requested.discard(job_id)
            self._skip_all.discard(job_id)
            self._skip_providers.pop(job_id, None)
            self._prune_locked()

    def _prune_locked(self) -> None:
        finished = [j for j in self._order if self._jobs[j]["status"] in TERMINAL_STATUSES]
        for job_id in finished[: max(0, len(finished) - MAX_FINISHED_JOBS)]:
            del self._jobs[job_id]
            self._order.remove(job_id)

    def _ensure_worker(self) -> None:
        with self._lock:
            if self._worker is None or not self._worker.is_alive():
                self._worker = threading.Thread(target=self._loop, name="pipeline-jobs", daemon=True)
                self._worker.start()

    def _loop(self) -> None:
        while True:
            job_id, kwargs = self._queue.get()
            try:
                with self._lock:
                    job = self._jobs.get(job_id)
                    runnable = job is not None and job["status"] != "cancelled"
                if runnable:
                    self._execute(job_id, kwargs)
            finally:
                self._queue.task_done()

    def _execute(self, job_id: str, kwargs: dict[str, Any]) -> None:
        brand_key = self._jobs[job_id]["brand_key"]
        self._update(job_id, status="running", message="Starting run")

        def on_progress(message: str, done: int, total: int) -> None:
            with self._lock:
                if job_id in self._cancel_requested and done < total:
                    raise JobCancelled
                if job_id in self._cancel_requested:
                    message = f"{message} (too late to cancel, finishing)"
                self._jobs[job_id].update(message=message, done=done, total=total)

        def on_provider(payload: dict[str, Any]) -> None:
            with self._lock:
                # A provider being skipped because of a cancel: unwind now rather than finish.
                if job_id in self._cancel_requested and payload.get("state") == "skipped":
                    raise JobCancelled
                providers = self._jobs[job_id]["providers"]
                for i, entry in enumerate(providers):
                    if entry["provider_id"] == payload["provider_id"]:
                        providers[i] = dict(payload)
                        break
                else:
                    providers.append(dict(payload))

        def should_skip(provider_id: str) -> bool:
            return self._should_skip(job_id, provider_id)

        try:
            snapshot = self._run_fn()(
                brand_key, on_progress=on_progress, should_skip=should_skip, on_provider=on_provider, **kwargs
            )
        except JobCancelled:
            self._finish(job_id, status="cancelled", message="Cancelled, nothing saved")
            return
        except Exception as exc:  # noqa: BLE001 - surface any failure on the job, never crash the worker
            self._finish(job_id, status="failed", message="Run failed", error=f"{type(exc).__name__}: {exc}")
            return

        status = snapshot.get("status", "completed")
        if status not in ("completed", "partial"):
            status = "completed"
        with self._lock:
            job = self._jobs[job_id]
            if job["total"] and job["done"] < job["total"]:
                job["done"] = job["total"]
        self._finish(
            job_id,
            status=status,
            run_id=snapshot.get("run_id"),
            message="Run completed" if status == "completed" else "Run completed with missing data (partial)",
        )
