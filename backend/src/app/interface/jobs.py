"""Background job runner for pipeline runs (CONTRACT §7).

MVP stand-in for Celery: one worker thread drains a FIFO queue, so runs execute
one at a time. Every state change is also persisted to
`DATA_DIR/jobs/<job_id>.json` (atomic tempfile + os.replace), so a restart doesn't
silently lose a job: `recover_from_restart()` reloads every record at startup and
flips any job still "queued"/"running" to "interrupted" (the process that would have
finished it is gone). Progress-only updates (on_progress/on_provider, which can fire
many times a second) are throttled to at most one disk write every 0.5s; status
changes always persist immediately.

Cancelling a queued job drops it before it starts. Cancelling a running job is
cooperative: it stops at the next provider-call boundary during collection and saves
nothing. Once collection is done the run is too close to finishing to leave half-saved,
so a late cancel is ignored and the run completes normally.

Skipping is also cooperative: `skip(job_id, provider_id)` asks the pipeline to stop
calling one provider (or, with provider_id None, every provider) — including mid-way
through a retry wait — and the run is scored and saved with what was collected. The
pipeline's per-provider progress is kept on the job as `providers`.

Job kinds: "analysis" (a tracking run, the default — everything above) and "campaign"
(Campaign Studio generation: copy + images, `submit_task`). Each kind has its own FIFO queue
and worker thread, so drafting a campaign never waits behind a multi-minute tracking run, while
runs of the same kind still execute one at a time. A task reports simple progress stages through
`on_progress(message, done, total)`; once started it always runs to completion (a late cancel is
ignored, like the end of an analysis run), because a half-generated campaign is worse than a
finished one the user can delete.

Single-worker only: the queue and job table above live in this process's memory (the
files on disk are a restart-safety net, not a way to share state between workers), so
`check_single_worker()` refuses to start if WEB_CONCURRENCY/UVICORN_WORKERS > 1.
"""

from __future__ import annotations

import contextlib
import json
import os
import queue
import tempfile
import threading
import time
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app import paths

# (brand_key, providers, samples, round, on_progress, should_skip, on_provider) -> snapshot record
RunFn = Callable[..., dict]
# on_progress(message, done, total) -> result dict ({"message": ...} optional)
ProgressFn = Callable[[str, int, int], None]
TaskFn = Callable[[ProgressFn], dict]

JOB_KINDS = ("analysis", "campaign")

TERMINAL_STATUSES = frozenset({"completed", "partial", "failed", "cancelled", "interrupted"})
MAX_FINISHED_JOBS = 100
PERSIST_THROTTLE_SECONDS = 0.5


def _jobs_dir() -> Path:
    return paths.DATA_DIR / "jobs"


def _job_path(job_id: str) -> Path:
    return _jobs_dir() / f"{job_id}.json"


class JobNotRunning(Exception):
    """skip() on a job that is queued or already finished."""


class UnknownProvider(ValueError):
    """skip() named a provider this job isn't using."""


class JobCancelled(Exception):
    """Raised from on_progress inside the pipeline to unwind a cancelled run."""


class MultipleWorkersError(RuntimeError):
    """WEB_CONCURRENCY/UVICORN_WORKERS > 1: the in-process job queue needs exactly one worker."""


def check_single_worker(env: dict[str, str] | None = None) -> None:
    """Raise if the server is configured to run with more than one worker process.

    JobManager keeps its queue and job table in process memory; each worker would get
    its own, so submitting a run to one worker and polling another would 404, and two
    workers could both pick up "the" run. Checked at JobManager construction time.
    """
    env = os.environ if env is None else env
    for var in ("WEB_CONCURRENCY", "UVICORN_WORKERS"):
        raw = env.get(var)
        if not raw:
            continue
        try:
            n = int(raw)
        except ValueError:
            continue
        if n > 1:
            raise MultipleWorkersError(
                f"{var}={raw}, but this server's job queue (app.interface.jobs.JobManager) lives in a "
                "single process's memory and on-disk job files. Running more than one worker would give "
                "each worker its own queue and job table, so runs could silently vanish or double-run. "
                "Start the server with exactly one worker (omit --workers/-w or WEB_CONCURRENCY, or set "
                "it to 1)."
            )


class JobManager:
    def __init__(self, run_fn: Callable[[], RunFn]) -> None:
        check_single_worker()
        # run_fn is a thunk so the pipeline module is resolved at execution time.
        self._run_fn = run_fn
        self._jobs: dict[str, dict[str, Any]] = {}
        self._order: list[str] = []
        self._lock = threading.Lock()
        self._queues: dict[str, queue.Queue[tuple[str, dict[str, Any]]]] = {k: queue.Queue() for k in JOB_KINDS}
        self._workers: dict[str, threading.Thread] = {}
        self._tasks: dict[str, TaskFn] = {}  # job_id -> callable, for non-analysis jobs (not persisted)
        self._cancel_requested: set[str] = set()
        self._skip_providers: dict[str, set[str]] = {}
        self._skip_all: set[str] = set()
        self._last_persist: dict[str, float] = {}

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
            "created_at": time.time(),
            "kind": "analysis",
        }
        with self._lock:
            self._jobs[job_id] = job
            self._order.append(job_id)
            self._persist_locked(job_id, force=True)
            submitted = self._copy(job)
        self._ensure_worker("analysis")
        self._queues["analysis"].put((job_id, {"providers": providers, "samples": samples, "round": round}))
        return submitted

    def submit_task(
        self,
        brand_key: str,
        *,
        kind: str,
        fn: TaskFn,
        message: str = "Queued",
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Queue a non-analysis job (e.g. kind="campaign"). `fn(on_progress)` runs on that kind's
        worker; it returns a dict (an optional "message" becomes the final job message) or raises
        (job "failed"). `extra` fields (e.g. {"campaign_id": ...}) are stored on the job record."""
        if kind not in JOB_KINDS or kind == "analysis":
            raise ValueError(f"unknown task kind {kind!r}")
        job_id = uuid.uuid4().hex
        job = {
            "job_id": job_id,
            "brand_key": brand_key,
            "status": "queued",
            "message": message,
            "done": 0,
            "total": 0,
            "run_id": None,
            "error": None,
            "providers": [],
            "created_at": time.time(),
            "kind": kind,
            **(extra or {}),
        }
        with self._lock:
            self._jobs[job_id] = job
            self._order.append(job_id)
            self._tasks[job_id] = fn
            self._persist_locked(job_id, force=True)
            submitted = self._copy(job)
        self._ensure_worker(kind)
        self._queues[kind].put((job_id, {}))
        return submitted

    @staticmethod
    def _copy(job: dict[str, Any]) -> dict[str, Any]:
        return {**job, "providers": [dict(p) for p in job["providers"]]}

    def _persist_locked(self, job_id: str, *, force: bool = False) -> None:
        """Write the job's current state to disk. Must be called with `self._lock` held.

        Best-effort: a disk error here must never crash a run, so failures are swallowed.
        Throttled to `PERSIST_THROTTLE_SECONDS` unless `force` (used for every status
        change, so a job's terminal/interrupted state is never lost to throttling).
        """
        job = self._jobs.get(job_id)
        if job is None:
            return
        now = time.monotonic()
        if not force and now - self._last_persist.get(job_id, 0.0) < PERSIST_THROTTLE_SECONDS:
            return
        self._last_persist[job_id] = now
        record = self._copy(job)
        path = _job_path(job_id)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{job_id}-", suffix=".json.tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    json.dump(record, f, ensure_ascii=False)
                os.replace(tmp_name, path)
            except BaseException:
                with contextlib.suppress(OSError):
                    os.unlink(tmp_name)
                raise
        except OSError:
            pass

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
                self._persist_locked(job_id, force=True)
                snapshot = self._copy(job)
                self._prune_locked()
                return snapshot
            if job["status"] == "running" and job.get("kind", "analysis") == "analysis":
                self._cancel_requested.add(job_id)
                job["message"] = "Cancelling after the current call…"
                self._persist_locked(job_id, force=True)
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
            self._persist_locked(job_id, force=True)
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
            self._persist_locked(job_id, force=True)

    def _finish(self, job_id: str, **fields: Any) -> None:
        """Set the final fields, drop the job's cancel/skip requests and prune old jobs."""
        with self._lock:
            self._jobs[job_id].update(fields)
            self._cancel_requested.discard(job_id)
            self._skip_all.discard(job_id)
            self._skip_providers.pop(job_id, None)
            self._persist_locked(job_id, force=True)
            self._prune_locked()

    def _prune_locked(self) -> None:
        finished = [j for j in self._order if self._jobs[j]["status"] in TERMINAL_STATUSES]
        for job_id in finished[: max(0, len(finished) - MAX_FINISHED_JOBS)]:
            del self._jobs[job_id]
            self._order.remove(job_id)
            self._last_persist.pop(job_id, None)
            self._tasks.pop(job_id, None)
            with contextlib.suppress(OSError):
                _job_path(job_id).unlink()

    def recover_from_restart(self) -> None:
        """Reload every persisted job record at startup. Any job still "queued"/"running" is
        marked "interrupted" (the process that would have finished it is gone) and re-saved;
        finished jobs are restored as-is, so `GET /jobs` and `GET /jobs/{id}` keep serving them
        after a restart. Call once, right after constructing the JobManager.
        """
        directory = _jobs_dir()
        if not directory.is_dir():
            return
        records: list[dict[str, Any]] = []
        for path in sorted(directory.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(data, dict) and isinstance(data.get("job_id"), str):
                records.append(data)
        records.sort(key=lambda r: r.get("created_at") or 0.0)
        with self._lock:
            for record in records:
                job_id = record["job_id"]
                record.setdefault("providers", [])
                record.setdefault("kind", "analysis")
                if record.get("status") in ("queued", "running"):
                    record["status"] = "interrupted"
                    record["message"] = "Interrupted"
                    record["error"] = "server restarted before the run finished"
                self._jobs[job_id] = record
                self._order.append(job_id)
                self._persist_locked(job_id, force=True)
            self._prune_locked()

    def _ensure_worker(self, kind: str = "analysis") -> None:
        with self._lock:
            worker = self._workers.get(kind)
            if worker is None or not worker.is_alive():
                name = "pipeline-jobs" if kind == "analysis" else f"{kind}-jobs"
                worker = threading.Thread(target=self._loop, args=(kind,), name=name, daemon=True)
                self._workers[kind] = worker
                worker.start()

    def _loop(self, kind: str = "analysis") -> None:
        q = self._queues[kind]
        while True:
            job_id, kwargs = q.get()
            try:
                with self._lock:
                    job = self._jobs.get(job_id)
                    runnable = job is not None and job["status"] != "cancelled"
                if runnable:
                    if kind == "analysis":
                        self._execute(job_id, kwargs)
                    else:
                        self._execute_task(job_id)
            finally:
                q.task_done()

    def _execute_task(self, job_id: str) -> None:
        with self._lock:
            fn = self._tasks.pop(job_id, None)
        self._update(job_id, status="running", message="Starting")
        if fn is None:  # pragma: no cover - defensive: the callable was lost
            self._finish(job_id, status="failed", message="Failed", error="task callable missing")
            return

        def on_progress(message: str, done: int, total: int) -> None:
            with self._lock:
                self._jobs[job_id].update(message=message, done=done, total=total)
                self._persist_locked(job_id, force=True)

        try:
            result = fn(on_progress) or {}
        except Exception as exc:  # noqa: BLE001 - surface any failure on the job, never crash the worker
            self._finish(job_id, status="failed", message="Failed", error=f"{type(exc).__name__}: {exc}")
            return
        with self._lock:
            job = self._jobs[job_id]
            if job["total"] and job["done"] < job["total"]:
                job["done"] = job["total"]
        self._finish(job_id, status="completed", message=str(result.get("message") or "Done"))

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
                self._persist_locked(job_id)

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
                self._persist_locked(job_id)

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
