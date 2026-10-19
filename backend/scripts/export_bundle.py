"""Export one stored run as a self-contained, verifiable bundle (zip).

Run:
    uv run python scripts/export_bundle.py --brand gajanan_vada_pav --out run.zip            # latest run
    uv run python scripts/export_bundle.py --brand gajanan_vada_pav --run 33293934 --out run.zip

Then anyone can re-check every number with scripts/verify_bundle.py (no API keys needed).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from app.brands.registry import get_brand  # noqa: E402
from app.tracking import store  # noqa: E402
from app.tracking.bundle import build_bundle  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--brand", required=True)
    parser.add_argument("--run", default=None, help="run id or prefix (default: latest)")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    records = store.load_snapshots(args.brand)
    if args.run:
        records = [r for r in records if str(r.get("run_id", "")).startswith(args.run)]
    if not records:
        print(f"No stored run for {args.brand!r}{' matching ' + args.run if args.run else ''}.")
        return 1
    light = records[-1]
    observations = store.load_observations(args.brand, light["run_id"]) or []
    try:
        current = get_brand(args.brand).alias_table()
    except KeyError:
        current = ()
    data = build_bundle(light, observations, current_alias_table=current)
    Path(args.out).write_bytes(data)
    print(f"Wrote {args.out} ({len(data) // 1024} KB): run {light['run_id']}, {len(observations)} answers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
