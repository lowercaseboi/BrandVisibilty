from __future__ import annotations

import json
from pathlib import Path

from app.interface.tracking_reader import read_latest_snapshot, read_snapshots


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")


def test_read_snapshots_parses_each_line(tmp_path: Path) -> None:
    path = tmp_path / "brand.jsonl"
    _write_jsonl(path, [{"run_id": "a"}, {"run_id": "b"}])

    assert read_snapshots(path) == [{"run_id": "a"}, {"run_id": "b"}]


def test_read_snapshots_missing_file_returns_empty_list(tmp_path: Path) -> None:
    assert read_snapshots(tmp_path / "missing.jsonl") == []


def test_read_snapshots_skips_blank_lines(tmp_path: Path) -> None:
    path = tmp_path / "brand.jsonl"
    path.write_text('{"run_id": "a"}\n\n   \n{"run_id": "b"}\n', encoding="utf-8")

    assert read_snapshots(path) == [{"run_id": "a"}, {"run_id": "b"}]


def test_read_latest_snapshot_returns_last_line(tmp_path: Path) -> None:
    path = tmp_path / "brand.jsonl"
    _write_jsonl(path, [{"run_id": "a"}, {"run_id": "b"}])

    assert read_latest_snapshot(path) == {"run_id": "b"}


def test_read_latest_snapshot_missing_file_returns_none(tmp_path: Path) -> None:
    assert read_latest_snapshot(tmp_path / "missing.jsonl") is None


def test_read_latest_snapshot_empty_file_returns_none(tmp_path: Path) -> None:
    path = tmp_path / "brand.jsonl"
    path.write_text("", encoding="utf-8")

    assert read_latest_snapshot(path) is None
