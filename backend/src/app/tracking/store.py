"""File-backed snapshot store (CONTRACT §3) — an MVP stand-in for the PostgreSQL
Snapshot tables (DESIGN §2: `TrackingSnapshot` vs `RawObservation`).

Layout under `DATA_DIR/tracking/`:

    <brand_key>.jsonl                         one light snapshot record per line, append-only
                                              (metadata, scores, gaps, recommendations,
                                              mention_summary, counts) — the TrackingSnapshot
    <brand_key>/<run_id>.observations.jsonl   that run's raw observations, one per line
                                              (full LLM answers + mention spans) — RawObservation

History reads (`load_snapshots`: /snapshots, /runs, /brands, the runner) only parse the
light lines; `load_observations` / `get_snapshot(include_raw=True)` read one run's file.

Legacy: lines written before the split still inline `raw_observations`. Every reader
accepts them (the answers are taken from the line), and
`scripts/migrate_split_observations.py` rewrites them into the layout above.

Functions read `app.paths.DATA_DIR` at call time, so tests (or callers) can point the
store elsewhere with `monkeypatch.setattr(paths, "DATA_DIR", tmp_path)`.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from collections.abc import Iterator
from pathlib import Path

from app import paths
from app.tracking.snapshot import OBSERVATIONS_SUFFIX, legacy_run_id, split_observations

log = logging.getLogger(__name__)

_LEGACY_MARKER = b'"raw_observations"'


def _safe_name(value: str, what: str) -> str:
    if not value or "/" in value or "\\" in value or value.startswith("."):
        raise ValueError(f"Invalid {what} {value!r}")
    return value


def _tracking_dir() -> Path:
    return paths.DATA_DIR / "tracking"


def _path_for(brand_key: str) -> Path:
    return _tracking_dir() / f"{_safe_name(brand_key, 'brand_key')}.jsonl"


def snapshot_path(brand_key: str) -> Path:
    return _path_for(brand_key)


def observations_dir(brand_key: str) -> Path:
    return _tracking_dir() / _safe_name(brand_key, "brand_key")


def observations_path(brand_key: str, run_id: str) -> Path:
    return observations_dir(brand_key) / f"{_safe_name(run_id, 'run_id')}{OBSERVATIONS_SUFFIX}"


def write_atomic(path: Path, text: str) -> None:
    """Write via a temp file + rename, so readers never see a half-written file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def dump_observations(raw_observations: list[dict]) -> str:
    return "".join(json.dumps(o, ensure_ascii=False) + "\n" for o in raw_observations)


def append_snapshot(record: dict) -> None:
    """Store one run: its observations file first (atomically), then the light snapshot
    line. A crash in between leaves an orphan observations file, never a snapshot line
    pointing at missing answers. `record` is not modified."""
    brand_key = record["brand_key"]
    path = _path_for(brand_key)
    light, raw = split_observations(record)
    if raw is not None:
        obs_path = observations_path(brand_key, light["run_id"])
        write_atomic(obs_path, dump_observations(raw))
        light["observations_file"] = obs_path.name
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(light, ensure_ascii=False) + "\n")


def _iter_records(brand_key: str) -> Iterator[dict]:
    """Stored records as written, oldest first; corrupt/partial lines are skipped."""
    path = _path_for(brand_key)
    if not path.exists():
        return
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict):
                yield record


def _read_observations_file(brand_key: str, light: dict) -> list[dict]:
    name = light.get("observations_file") or f"{light.get('run_id')}{OBSERVATIONS_SUFFIX}"
    try:
        path = observations_dir(brand_key) / _safe_name(str(name), "observations_file")
    except ValueError:
        return []
    if not path.exists():
        if light.get("observations_file"):
            log.warning("Observations file missing for %s run %s: %s", brand_key, light.get("run_id"), path)
        return []
    out: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obs = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obs, dict):
                out.append(obs)
    return out


def _with_raw(brand_key: str, light: dict, raw: list[dict] | None) -> dict:
    light["raw_observations"] = raw if raw is not None else _read_observations_file(brand_key, light)
    return light


def load_snapshots(brand_key: str, *, include_raw: bool = False) -> list[dict]:
    """All snapshots for a brand, oldest first, as light records (no `raw_observations`;
    `observations_file` names the run's answers). Legacy inline lines are lightened in
    memory. `include_raw=True` attaches each run's observations — only for callers that
    really need every answer of every run."""
    records: list[dict] = []
    for record in _iter_records(brand_key):
        light, raw = split_observations(record)
        records.append(_with_raw(brand_key, light, raw) if include_raw else light)
    return records


def get_snapshot(brand_key: str, run_id: str, *, include_raw: bool = True) -> dict | None:
    """One run's snapshot, with its `raw_observations` attached unless `include_raw=False`.
    Matches legacy records by their derived run id too."""
    for record in _iter_records(brand_key):
        rid = record["run_id"] if "run_id" in record else legacy_run_id(record)
        if rid != run_id:
            continue
        light, raw = split_observations(record)
        return _with_raw(brand_key, light, raw) if include_raw else light
    return None


def load_observations(brand_key: str, run_id: str) -> list[dict] | None:
    """A run's raw observations (split file, or the legacy inline copy); None if the run
    is unknown."""
    snap = get_snapshot(brand_key, run_id, include_raw=True)
    return None if snap is None else snap["raw_observations"]


def legacy_inline_brands() -> list[str]:
    """Brands whose history still has lines with inline `raw_observations` (pre-split
    layout). Cheap byte scan — used for the one-line startup warning."""
    directory = _tracking_dir()
    if not directory.is_dir():
        return []
    return sorted(p.stem for p in directory.glob("*.jsonl") if _LEGACY_MARKER in p.read_bytes())


def delete_brand_data(brand_key: str) -> None:
    """Remove all stored data for a brand: its snapshot history and observation files, any
    saved custom question list (`DATA_DIR/questions/<brand_key>.json`, written by
    app.querysets.custom) and its saved recommendation board (`DATA_DIR/boards/<brand_key>.json`,
    written by app.tracking.board). Missing files are not an error — deleting is idempotent."""
    _path_for(brand_key).unlink(missing_ok=True)
    shutil.rmtree(observations_dir(brand_key), ignore_errors=True)
    (paths.DATA_DIR / "questions" / f"{brand_key}.json").unlink(missing_ok=True)
    (paths.DATA_DIR / "boards" / f"{brand_key}.json").unlink(missing_ok=True)


def brand_keys_with_data() -> set[str]:
    directory = _tracking_dir()
    if not directory.is_dir():
        return set()
    return {p.stem for p in directory.glob("*.jsonl") if p.stat().st_size > 0}
