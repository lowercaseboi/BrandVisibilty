"""Read-only JSONL parsing for tracking snapshots. No FastAPI imports — pure I/O helpers.

Snapshot files are written by `scripts/run_tracking_loop.py`, one JSON object per line.
A missing file means "no data collected for this brand yet", not an error, so callers get
an empty result rather than an exception.
"""

from __future__ import annotations

import json
from pathlib import Path


def read_snapshots(path: Path) -> list[dict]:
    if not path.exists():
        return []
    snapshots = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        snapshots.append(json.loads(line))
    return snapshots


def read_latest_snapshot(path: Path) -> dict | None:
    snapshots = read_snapshots(path)
    return snapshots[-1] if snapshots else None
