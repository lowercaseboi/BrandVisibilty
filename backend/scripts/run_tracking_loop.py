"""Tracking-loop runner (DESIGN_v1 §6.8).

"Tracking history is the only deliverable in this project that cannot be built at the
end... the collection loop (Provider adapters + Scorer) needs to start running against
2-3 real brands as soon as those two pieces exist." This script is that loop — now a thin
CLI over `app.pipeline.runner.run_pipeline` (the same pipeline the HTTP API runs), so the
CLI and the API can never drift apart. Still deliberately minimal: no DB, no Celery; it
appends one snapshot per brand to DATA_DIR/tracking/<brand_key>.jsonl.

Run: uv run python scripts/run_tracking_loop.py --brand gajanan_vada_pav --providers auto --samples 3
     (--brand all runs every registered brand; --record also saves live responses for replay)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from app.brands.registry import list_brands
from app.pipeline.runner import run_pipeline
from app.tracking import store


def _fmt(value: float | None, pattern: str = "{:.2f}") -> str:
    return "n/a" if value is None else pattern.format(value)


def _progress_printer(brand_key: str):
    is_tty = sys.stdout.isatty()
    state = {"last_len": 0}

    def on_progress(message: str, done: int, total: int) -> None:
        line = f"  [{brand_key}] {done}/{total}  {message}"
        failed = "FAILED" in message or "unavailable" in message or "failed" in message
        if is_tty and not failed:
            pad = max(0, state["last_len"] - len(line))
            sys.stdout.write("\r" + line + " " * pad)
            state["last_len"] = len(line)
        else:
            if is_tty and state["last_len"]:
                sys.stdout.write("\n")
            sys.stdout.write(line + "\n")
            state["last_len"] = 0
        sys.stdout.flush()

    def finish() -> None:
        if is_tty and state["last_len"]:
            sys.stdout.write("\n")
            state["last_len"] = 0

    return on_progress, finish


def _summary(snapshot: dict) -> str:
    r = snapshot["analysis_result"]
    adm = snapshot["admission"]
    return (
        f"{snapshot['brand_key']}: {snapshot['status']}/{adm['status']} origin={snapshot['data_origin']} "
        f"obs={snapshot['observation_count']} Coverage={r['coverage']:.1%} "
        f"Prominence={_fmt(r['prominence'])} SoV={_fmt(r['share_of_voice'], '{:.1%}')} "
        f"Composite={r['composite_score']:.1f} CI=[{r['ci_low']:.1f}, {r['ci_high']:.1f}] "
        f"gaps={len(snapshot['gaps'])} recs={len(snapshot['recommendations'])}"
    )


def main() -> int:
    brand_keys = [b.brand_key for b in list_brands()]
    parser = argparse.ArgumentParser(description="Run one tracking-loop snapshot per brand.")
    parser.add_argument("--brand", default="all", help=f"brand key or 'all' (known: {', '.join(brand_keys)})")
    parser.add_argument(
        "--providers", default="auto", help="'auto' (every configured provider, else synthetic) or a comma list"
    )
    parser.add_argument("--samples", type=int, default=3, help="samples per unprompted query (default 3)")
    parser.add_argument("--round", type=int, default=1, help="round number (varies synthetic data; default 1)")
    parser.add_argument("--record", action="store_true", help="record live responses to the replay cache")
    args = parser.parse_args()

    targets = brand_keys if args.brand == "all" else [args.brand]
    if args.brand != "all" and args.brand not in brand_keys:
        parser.error(f"unknown brand {args.brand!r}; known: {', '.join(brand_keys)}")

    failures = 0
    for brand_key in targets:
        on_progress, finish = _progress_printer(brand_key)
        try:
            snapshot = run_pipeline(
                brand_key,
                providers=args.providers,
                samples=args.samples,
                round=args.round,
                record=args.record,
                on_progress=on_progress,
            )
        except (RuntimeError, ValueError, KeyError) as exc:
            finish()
            print(f"{brand_key}: FAILED — {exc}")
            failures += 1
            continue
        finish()
        print(_summary(snapshot))
        print(f"  -> {store.snapshot_path(brand_key)}  (run {snapshot['run_id']})")

    return 1 if failures == len(targets) else 0


if __name__ == "__main__":
    sys.exit(main())
