"""Recompute metrics v2 for every stored run and print the history side by side with v1.

Old runs are rescored from their stored answers with the current metric config and competitor
list (cached in DATA_DIR/metrics/, see app.tracking.rescore); the snapshot history files are
read only — their SHA-256 is printed before and after to show they are unchanged.

Run:
    uv run python scripts/rescore_history.py --brand gajanan_vada_pav
    uv run python scripts/rescore_history.py --brand all --json history.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from app.analysis.matching import match  # noqa: E402
from app.brands.registry import list_brands  # noqa: E402
from app.tracking import rescore, store  # noqa: E402


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16] if path.exists() else "-"


def _fmt(v, digits: int = 1) -> str:
    return "—" if v is None else f"{v:.{digits}f}"


def rescore_brand(brand_key: str) -> list[dict]:
    path = store.snapshot_path(brand_key)
    before = _sha(path)
    rows = []
    previous = None
    for light in store.load_snapshots(brand_key):
        m = rescore.metrics_for(brand_key, light)
        v1 = light.get("analysis_result") or {}
        row = {
            "run_id": light.get("run_id"),
            "data_origin": light.get("data_origin"),
            "admissible": (light.get("admission") or {}).get("admissible"),
            "v1_composite": v1.get("composite_score"),
            "v1_ci": [v1.get("ci_low"), v1.get("ci_high")],
        }
        if m:
            own = m["entities"][m["self_id"]]
            row.update({
                "vi": own["vi"], "vi_ci": own["ci"], "named": own["named"], "answers": own["answers"],
                "position": f"{m['market_position']['rank']}/{m['market_position']['of']}",
                "reach": f"{m['question_reach']['named']}/{m['question_reach']['of']}",
                "rescored": bool(m.get("rescored")),
            })
            if previous is not None:
                c = match(previous["cells"], m["cells"], m["self_id"], seed_basis=f"{previous['seed_basis']}|{m['seed_basis']}")
                row["vs_previous"] = {k: c[k] for k in ("overlap", "questions", "delta", "ci95", "mde", "verdict")}
            previous = m
        rows.append(row)
    after = _sha(path)
    print(f"\n{brand_key}  (history sha256 {before} -> {after}{'' if before == after else '  CHANGED!'})")
    print(f"{'run':10} {'origin':9} {'v1':>6} {'VI':>6} {'VI 95% CI':>15} {'named':>8} {'pos':>4} {'reach':>6}  vs previous")
    for r in rows:
        ci = r.get("vi_ci") or [None, None]
        vs = r.get("vs_previous")
        vs_text = (
            f"{vs['verdict']} (Δ {_fmt(vs['delta'])}, MDE {_fmt(vs['mde'])}, overlap {vs['overlap']:.0%})" if vs else ""
        )
        print(
            f"{str(r['run_id'])[:8]:10} {str(r['data_origin']):9} {_fmt(r['v1_composite']):>6} {_fmt(r.get('vi')):>6} "
            f"{_fmt(ci[0]) + '–' + _fmt(ci[1]):>15} {str(r.get('named', '—')) + '/' + str(r.get('answers', '—')):>8} "
            f"{r.get('position', '—'):>4} {r.get('reach', '—'):>6}  {vs_text}"
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--brand", default="all")
    parser.add_argument("--json", default=None, help="also write the table as JSON")
    args = parser.parse_args()
    keys = sorted(store.brand_keys_with_data()) if args.brand == "all" else [args.brand]
    known = {b.brand_key for b in list_brands()}
    out = {key: rescore_brand(key) for key in keys if key in known}
    if args.json:
        Path(args.json).write_text(json.dumps(out, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
