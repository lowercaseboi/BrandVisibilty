"""File-backed snapshot store (CONTRACT §3) — an MVP stand-in for the PostgreSQL
Snapshot tables. One JSONL file per brand, one snapshot record (CONTRACT §5) per line,
append-only so tracking history is never rewritten.

Functions read the module-level `DATA_DIR` at call time, so tests (or callers) can point
the store elsewhere with `monkeypatch.setattr(store, "DATA_DIR", tmp_path)`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[3]  # backend/src/app/tracking -> backend
DATA_DIR = Path(os.environ.get("DATA_DIR", _BACKEND_DIR / "data"))


def _tracking_dir() -> Path:
    return DATA_DIR / "tracking"


def _path_for(brand_key: str) -> Path:
    if not brand_key or "/" in brand_key or "\\" in brand_key or brand_key.startswith("."):
        raise ValueError(f"Invalid brand_key {brand_key!r}")
    return _tracking_dir() / f"{brand_key}.jsonl"


def snapshot_path(brand_key: str) -> Path:
    return _path_for(brand_key)


def append_snapshot(record: dict) -> None:
    path = _path_for(record["brand_key"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def load_snapshots(brand_key: str) -> list[dict]:
    """All snapshots for a brand, oldest first; corrupt/partial lines are skipped."""
    path = _path_for(brand_key)
    if not path.exists():
        return []
    records: list[dict] = []
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
                records.append(record)
    return records


def get_snapshot(brand_key: str, run_id: str) -> dict | None:
    for record in load_snapshots(brand_key):
        if record.get("run_id") == run_id:
            return record
    return None


def brand_keys_with_data() -> set[str]:
    directory = _tracking_dir()
    if not directory.is_dir():
        return set()
    return {p.stem for p in directory.glob("*.jsonl") if p.stat().st_size > 0}
