"""One-time migration: split inline raw observations out of snapshot history.

Old layout: every line of DATA_DIR/tracking/<brand_key>.jsonl inlined the run's
`raw_observations` (full LLM answers + mention spans, ~70KB per run), so every history
read re-parsed all of them. New layout (see app/tracking/store.py):

    tracking/<brand_key>.jsonl                        light snapshot lines
    tracking/<brand_key>/<run_id>.observations.jsonl  one observation per line

For each brand file that still has inline lines, this writes each run's observations file
(atomically), rewrites the brand file with light lines (atomically) and keeps the original
as <brand_key>.jsonl.bak (.bak.1, .bak.2, ... if one already exists). Lines already in the
new layout and corrupt lines are kept verbatim. Idempotent: a migrated file has no inline
lines, so a re-run leaves it untouched. Stop the backend first so no run is appended while
a file is being rewritten.

Run (from backend/):
    uv run python scripts/migrate_split_observations.py                 # DATA_DIR / backend/data
    uv run python scripts/migrate_split_observations.py --data-dir /data --dry-run
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from app import paths
from app.tracking import store
from app.tracking.snapshot import OBSERVATIONS_SUFFIX, split_observations


def _backup_path(path: Path) -> Path:
    candidate = path.with_name(path.name + ".bak")
    n = 1
    while candidate.exists():
        candidate = path.with_name(f"{path.name}.bak.{n}")
        n += 1
    return candidate


def migrate_file(path: Path, *, dry_run: bool = False) -> dict:
    """Migrate one brand history file. Returns a small summary dict."""
    brand_key = path.stem
    lines = path.read_text(encoding="utf-8").splitlines()
    summary = {"brand_key": brand_key, "lines": len(lines), "split": 0,
               "bytes_before": path.stat().st_size, "bytes_after": None, "backup": None}

    out_lines: list[str] = []
    obs_files: dict[str, str] = {}  # file name -> content
    for line in lines:
        stripped = line.strip()
        try:
            record = json.loads(stripped) if stripped else None
        except json.JSONDecodeError:
            record = None
        if not isinstance(record, dict) or "raw_observations" not in record:
            out_lines.append(line)  # already light, blank or corrupt: keep as is
            continue
        light, raw = split_observations(record)
        name = store.observations_path(brand_key, light["run_id"]).name
        n = 1
        while name in obs_files:  # two lines sharing a run id: keep both runs' answers
            name = f"{light['run_id']}-{n}{OBSERVATIONS_SUFFIX}"
            n += 1
        obs_files[name] = store.dump_observations(raw or [])
        light["observations_file"] = name
        out_lines.append(json.dumps(light, ensure_ascii=False))
        summary["split"] += 1

    if not summary["split"]:
        return summary
    new_text = "".join(f"{line}\n" for line in out_lines)
    summary["bytes_after"] = len(new_text.encode("utf-8"))
    if dry_run:
        return summary

    obs_dir = store.observations_dir(brand_key)
    for name, content in obs_files.items():  # answers first, then the lines that point at them
        store.write_atomic(obs_dir / name, content)
    backup = _backup_path(path)
    shutil.copy2(path, backup)
    store.write_atomic(path, new_text)
    summary["backup"] = backup.name
    return summary


def migrate(data_dir: Path, *, dry_run: bool = False) -> list[dict]:
    paths.DATA_DIR = data_dir
    tracking = data_dir / "tracking"
    if not tracking.is_dir():
        return []
    return [migrate_file(p, dry_run=dry_run) for p in sorted(tracking.glob("*.jsonl"))]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=paths.DATA_DIR,
                        help=f"data root holding tracking/ (default: {paths.DATA_DIR})")
    parser.add_argument("--dry-run", action="store_true", help="report what would change, write nothing")
    args = parser.parse_args()

    results = migrate(args.data_dir.resolve(), dry_run=args.dry_run)
    if not results:
        print(f"No snapshot history under {args.data_dir / 'tracking'} — nothing to do.")
        return 0
    for r in results:
        if not r["split"]:
            print(f"{r['brand_key']}: already in the split layout ({r['lines']} lines)")
            continue
        verb = "would split" if args.dry_run else "split"
        print(f"{r['brand_key']}: {verb} {r['split']} of {r['lines']} runs, "
              f"{r['bytes_before']:,} -> {r['bytes_after']:,} bytes"
              + (f" (original kept as {r['backup']})" if r["backup"] else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
