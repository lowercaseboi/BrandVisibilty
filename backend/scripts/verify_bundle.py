"""Re-check a run bundle: recompute every number from the stored answers and compare.

Run (no API keys, no network, no data directory needed):
    uv run python scripts/verify_bundle.py run.zip

Exit code 0 when nothing differs (skipped checks are listed with the reason), 1 otherwise.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from app.tracking.bundle import verify_bundle  # noqa: E402

MARK = {"pass": "PASS", "fail": "FAIL", "skipped": "SKIP"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("bundle")
    args = parser.parse_args()
    report = verify_bundle(Path(args.bundle).read_bytes())
    m = report["manifest"]
    print(f"Bundle {args.bundle}: {m.get('brand_key')} run {m.get('run_id')} ({m.get('data_origin')}), "
          f"metrics {m.get('metric_version')}, code {str(m.get('code_sha'))[:10]}")
    for c in report["checks"]:
        print(f"  {MARK[c['status']]}  {c['check']:<16} {c['detail']}")
    for w in report["warnings"]:
        print(f"  note: {w}")
    print("Every recomputed number matches." if report["ok"] else "Differences found (see FAIL lines).")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
