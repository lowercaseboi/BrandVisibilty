"""Validate the v2 list placement against human labels (docs/METRICS_v2.md §8).

The list parser (app.analysis.list_parser) is deterministic, which makes it reproducible, not
correct. This script samples stored answers, asks a human where each named business sits in the
answer, and scores the parser against those labels — the same workflow as
scripts/validate_detector.py for the mention detector.

Run:
    uv run python scripts/validate_list_parser.py export --brand gajanan_vada_pav --out slots.csv --n 30 --seed 1
    # fill annotator_a (and optionally annotator_b): the option number, "u" (named, not as an
    # option) — then:
    uv run python scripts/validate_list_parser.py score --sheet slots.csv

How to label one row: read `response_text` like a customer would. If the business is offered as
one of the answer's options (a heading, a numbered/bulleted item, a table row), write which
option it is among options of the same kind in reading order (1 = first). If it is only named in
an introduction, a description of another option or a tip, write "u".

`export` hides the parser's verdict in a sidecar JSON file (blind labelling).
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from app.analysis.validation import cohens_kappa, kappa_band, precision_recall_f1  # noqa: E402
from app.analysis.visibility import MetricConfig, place_answer  # noqa: E402
from app.brands.registry import get_brand, list_brands  # noqa: E402
from app.tracking import store  # noqa: E402

FIELDNAMES = [
    "row_id", "brand_key", "observation_id", "provider_id", "entity_label", "query_text", "response_text",
    "annotator_a", "annotator_b", "adjudicated", "notes",
]


def _sidecar(out: Path) -> Path:
    return out.with_name(out.stem + ".parser.json")


def _label(raw: str) -> int | str | None:
    """None = blank, "u" = unlisted, int = slot."""
    s = (raw or "").strip().lower()
    if not s:
        return None
    if s in {"u", "unlisted", "no"}:
        return "u"
    if s.isdigit() and int(s) >= 1:
        return int(s)
    raise ValueError(f"unrecognised label {raw!r}: use an option number or 'u'")


def _rows_for(brand_key: str, run_prefix: str | None) -> list[dict]:
    brand = get_brand(brand_key)
    names = brand.entity_names()
    snapshots = store.load_snapshots(brand_key)
    if run_prefix:
        snapshots = [s for s in snapshots if str(s.get("run_id", "")).startswith(run_prefix)]
    if not snapshots:
        return []
    cfg = MetricConfig()
    raw = store.load_observations(brand_key, snapshots[-1]["run_id"]) or []
    rows = []
    for obs in raw:
        if obs.get("scored") is False or not (obs.get("response_text") or "").strip():
            continue
        placed = place_answer(obs, brand.alias_table(), cfg)
        for eid, p in placed.placements.items():
            rows.append({
                "row_id": f"{brand_key}:{obs['observation_id']}:{eid}",
                "brand_key": brand_key,
                "observation_id": obs["observation_id"],
                "provider_id": obs.get("provider_id", "?"),
                "entity_label": names.get(eid, eid),
                "query_text": obs.get("query_text", ""),
                "response_text": obs["response_text"],
                "_verdict": p.slot if p.mode != "unlisted" else "u",
            })
    return rows


def cmd_export(args: argparse.Namespace) -> int:
    keys = [b.brand_key for b in list_brands() if b.brand_key in store.brand_keys_with_data()] \
        if args.brand == "all" else [args.brand]
    rows = [r for key in keys for r in _rows_for(key, args.run)]
    if not rows:
        print("No stored answers naming a tracked business were found.")
        return 1
    rng = random.Random(args.seed)
    # Stratify by provider so every answer format is represented.
    by_provider: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_provider[row["provider_id"]].append(row)
    for pool in by_provider.values():
        rng.shuffle(pool)
    sample: list[dict] = []
    while len(sample) < args.n and any(by_provider.values()):
        for pool in by_provider.values():
            if pool and len(sample) < args.n:
                sample.append(pool.pop())
    rng.shuffle(sample)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in sample:
            writer.writerow({k: row.get(k, "") for k in FIELDNAMES})
    _sidecar(out).write_text(
        json.dumps({r["row_id"]: r["_verdict"] for r in sample}, indent=2), encoding="utf-8"
    )
    print(f"Wrote {len(sample)} rows to {out}; parser verdicts hidden in {_sidecar(out)}")
    return 0


def cmd_score(args: argparse.Namespace) -> int:
    sheet = Path(args.sheet)
    with sheet.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    verdicts = json.loads(_sidecar(sheet).read_text(encoding="utf-8"))

    gold, predicted, slot_errors, exact = [], [], [], 0
    a_labels, b_labels = [], []
    for row in rows:
        a, b, adjudicated = _label(row["annotator_a"]), _label(row["annotator_b"]), _label(row["adjudicated"])
        if a is not None and b is not None:
            a_labels.append(a != "u")
            b_labels.append(b != "u")
        truth = adjudicated if adjudicated is not None else (a if b is None or a == b else None)
        if truth is None:
            continue
        verdict = verdicts.get(row["row_id"])
        gold.append(truth != "u")
        predicted.append(verdict != "u")
        if truth != "u" and verdict != "u":
            slot_errors.append(abs(int(verdict) - int(truth)))
            exact += int(verdict) == int(truth)

    if not gold:
        print("No labelled rows yet.")
        return 1
    prf = precision_recall_f1(predicted, gold)
    print(f"Labelled rows: {len(gold)}")
    print(f"'Listed as an option' — precision {prf.precision:.2f}, recall {prf.recall:.2f}, F1 {prf.f1:.2f}")
    if slot_errors:
        print(
            f"Slot, where both say listed (n={len(slot_errors)}): exact {exact / len(slot_errors):.0%}, "
            f"mean absolute error {statistics.fmean(slot_errors):.2f}"
        )
    if a_labels:
        k = cohens_kappa(a_labels, b_labels)
        print(f"Annotator agreement on listed/unlisted: kappa {k.kappa:.2f} ({kappa_band(k.kappa)}), n={k.n}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export", help="sample answers into a blind labelling sheet")
    export.add_argument("--brand", default="all")
    export.add_argument("--run", default=None, help="run id prefix (default: latest run)")
    export.add_argument("--out", required=True)
    export.add_argument("--n", type=int, default=30)
    export.add_argument("--seed", type=int, default=1)
    export.set_defaults(func=cmd_export)
    score = sub.add_parser("score", help="score a filled sheet against the parser")
    score.add_argument("--sheet", required=True)
    score.set_defaults(func=cmd_score)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
