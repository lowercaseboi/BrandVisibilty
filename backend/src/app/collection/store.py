"""Durable, resumable per-sample response store (DESIGN_v1 §3.4's "cached-response fixture
set" made real, and the file-mode stand-in for the `raw_observation` table).

Every response is written to disk the instant it arrives, atomically (`.tmp` +
`os.replace`), so a crash or a mid-run quota stop cannot lose anything already paid for.
A resumed run against the same key set skips everything already collected — `has()` is a
stat-per-key, no parsing required to decide.

**`run_id` is a deliberate addition beyond a purely content-addressed key** — see
`SampleKey`'s docstring for why a cache keyed only on query content would silently corrupt
the weekly tracking series.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterator, Literal, Protocol

_UNSAFE_PATH_CHARS = re.compile(r"[^A-Za-z0-9._-]")


def content_addressed_query_id(text: str) -> str:
    """Derive a stable query id from its text (DESIGN §2, C-5 seam onto a future `Query`
    row). Content-addressed rather than positional (`f"q{index}"`, the previous scheme):
    survives query-set reordering, and is self-describing in a directory listing where a
    positional id is not."""
    return "q" + hashlib.sha256(text.encode("utf-8")).hexdigest()[:10]


def sanitize_path_segment(value: str) -> str:
    """Make a provider/model id filesystem-safe (OpenRouter ids look like
    "meta-llama/llama-4-scout:free"). Deterministic and injective enough in practice —
    tested against the concrete ids this project actually uses."""
    return _UNSAFE_PATH_CHARS.sub("_", value)


@dataclass(frozen=True)
class SampleKey:
    """Identifies one collected (or attempted) sample.

    **Conflict with a purely content-addressed cache, resolved in DESIGN §2.2's favour.**
    §2.2 puts a `UNIQUE (job_id, provider_model_id, query_id, sample_index)` constraint on
    `raw_observation` — `job_id` is exactly the discriminator that makes two runs of the
    same frozen query set two distinct observations. Without `run_id` here, next Monday's
    run against an unchanged query set would be a 100% cache hit and silently reproduce
    last week's snapshot instead of collecting a new one. `run_id` is the file-mode
    stand-in for `AnalysisJob.id`; it defaults to an ISO week string so "resume within a
    run" (same week) stays free while "a new week" forces a real re-collect.
    """

    run_id: str
    query_set_hash: str
    sampling_hash: str
    provider_id: str
    model_id: str
    query_id: str
    sample_index: int

    def path_parts(self) -> tuple[str, str, str, str]:
        provider_dir = f"{self.provider_id}__{sanitize_path_segment(self.model_id)}"
        filename_stem = f"{self.query_id}__s{self.sample_index}"
        return self.run_id, self.query_set_hash[:12], provider_dir, filename_stem


Status = Literal["ok", "failed"]


@dataclass(frozen=True)
class StoredResponse:
    """One `raw_observation` row minus `job_id` (which `SampleKey.run_id` stands in for)."""

    schema_version: int
    captured_at: str
    run_id: str
    brand_key: str
    query_set_hash: str
    sampling_hash: str
    provider_id: str
    model_id: str
    model_version: str | None
    query_id: str
    query_text: str
    intent_type: str
    is_brand_named: bool
    sample_index: int
    status: Status
    latency_ms: int | None = None
    token_usage: dict | None = None
    response_text: str | None = None
    raw_meta: dict = field(default_factory=dict)
    error: dict | None = None


class ResponseStore(Protocol):
    def has(self, key: SampleKey) -> bool: ...

    def get(self, key: SampleKey) -> StoredResponse | None: ...

    def put(self, key: SampleKey, record: StoredResponse) -> None: ...

    def put_failure(self, key: SampleKey, record: StoredResponse) -> None: ...

    def iter_run(self, *, run_id: str, query_set_hash: str) -> Iterator[StoredResponse]: ...


class FileResponseStore:
    """One JSON file per sample under `root/<run_id>/<query_set_hash[:12]>/
    <provider>__<model>/<query_id>__s<n>[.failed].json`.

    A store instance is scoped to one brand — construct it with
    `root / "responses" / brand_key`, matching `StoredResponse.brand_key` on every record
    it writes. `SampleKey` itself carries no brand, since brand is a property of the run
    directory, not of an individual sample.

    `ok` and `failed` records use different filenames deliberately — an `ok` write can
    never be shadowed by a stale `failed` record from an earlier attempt, and `has()`
    (the resume check) returns True only for `ok`, so a previously failed sample is always
    retried on the next run.
    """

    def __init__(self, root: Path):
        self._root = root

    def _dir(self, key: SampleKey) -> Path:
        run_id, qs_prefix, provider_dir, _ = key.path_parts()
        return self._root / run_id / qs_prefix / provider_dir

    def _ok_path(self, key: SampleKey) -> Path:
        *_, filename_stem = key.path_parts()
        return self._dir(key) / f"{filename_stem}.json"

    def _failed_path(self, key: SampleKey) -> Path:
        *_, filename_stem = key.path_parts()
        return self._dir(key) / f"{filename_stem}.failed.json"

    def has(self, key: SampleKey) -> bool:
        return self._ok_path(key).exists()

    def get(self, key: SampleKey) -> StoredResponse | None:
        path = self._ok_path(key)
        if not path.exists():
            return None
        return StoredResponse(**json.loads(path.read_text(encoding="utf-8")))

    def _write_atomic(self, path: Path, record: StoredResponse) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(asdict(record), indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp_path, path)

    def put(self, key: SampleKey, record: StoredResponse) -> None:
        self._write_atomic(self._ok_path(key), record)

    def put_failure(self, key: SampleKey, record: StoredResponse) -> None:
        self._write_atomic(self._failed_path(key), record)

    def iter_run(self, *, run_id: str, query_set_hash: str) -> Iterator[StoredResponse]:
        run_dir = self._root / run_id / query_set_hash[:12]
        if not run_dir.exists():
            return
        for provider_dir in sorted(run_dir.iterdir()):
            if not provider_dir.is_dir():
                continue
            for path in sorted(provider_dir.glob("*.json")):
                if path.name.endswith(".failed.json") or path.name.endswith(".tmp"):
                    continue
                yield StoredResponse(**json.loads(path.read_text(encoding="utf-8")))


class InMemoryResponseStore:
    """No-filesystem store for unit tests."""

    def __init__(self) -> None:
        self._ok: dict[SampleKey, StoredResponse] = {}
        self._failed: dict[SampleKey, StoredResponse] = {}

    def has(self, key: SampleKey) -> bool:
        return key in self._ok

    def get(self, key: SampleKey) -> StoredResponse | None:
        return self._ok.get(key)

    def put(self, key: SampleKey, record: StoredResponse) -> None:
        self._ok[key] = record

    def put_failure(self, key: SampleKey, record: StoredResponse) -> None:
        self._failed[key] = record

    def iter_run(self, *, run_id: str, query_set_hash: str) -> Iterator[StoredResponse]:
        for key, record in self._ok.items():
            if key.run_id == run_id and key.query_set_hash == query_set_hash:
                yield record
