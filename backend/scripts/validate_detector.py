"""AC-12 detector validation tool (PRD §11.7, §17 AC-12; DESIGN §1.6).

Determinism is not the same thing as accuracy: MentionDetector is a deterministic alias-table
matcher (same input -> same output, every time), which is what makes it testable and auditable,
but says nothing about whether its verdicts match what a human would call a "mention". This
script builds the human-labelling workflow that closes that gap — sampling stored observations,
producing a blind labelling sheet for two annotators, and scoring the filled sheet against the
detector with the pure functions in `app.analysis.validation`.

Run:
    uv run python scripts/validate_detector.py export --out sheet.csv
    uv run python scripts/validate_detector.py export --brand gajanan_vada_pav --out sheet.csv --n 40 --seed 1
    uv run python scripts/validate_detector.py score --sheet sheet.csv

`export` writes two files: the labelling sheet itself (annotator_a / annotator_b / adjudicated
columns left blank) and, by default (`--blind`, the default), a sidecar JSON file holding the
detector's verdicts so annotators can't see them while labelling. Pass `--no-blind` to put the
verdict directly in the sheet instead (useful for a dry run, not for real labelling).

See docs/DETECTOR_VALIDATION.md for the labelling guidelines and how to read the results.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from app.analysis.mention_detector import detect_mentions  # noqa: E402  (stdlib+local only)
from app.analysis.validation import (  # noqa: E402
    cohens_kappa,
    consensus_labels,
    kappa_band,
    precision_recall_f1,
)
from app.brands.registry import BrandConfig, get_brand, list_brands  # noqa: E402
from app.tracking import store  # noqa: E402

FIELDNAMES = [
    "row_id",
    "brand_key",
    "observation_id",
    "provider_id",
    "entity_id",
    "entity_kind",
    "entity_label",
    "query_text",
    "response_text",
    "annotator_a",
    "annotator_b",
    "adjudicated",
    "notes",
]
# Present only when the sheet is exported with --no-blind.
VERDICT_FIELDNAMES = ["detector_verdict", "detected_alias"]

_TRUE = {"y", "yes", "true", "1", "mentioned"}
_FALSE = {"n", "no", "false", "0", "not mentioned"}


def _parse_label(raw: str) -> bool | None:
    """Blank -> not yet labelled (`None`); otherwise yes/no (several spellings accepted)."""
    s = (raw or "").strip().lower()
    if not s:
        return None
    if s in _TRUE:
        return True
    if s in _FALSE:
        return False
    raise ValueError(f"unrecognized label {raw!r} — use yes/no")


def _yn(value: bool) -> str:
    return "yes" if value else "no"


def _sidecar_path(out: Path) -> Path:
    return out.with_suffix(".verdicts.json")


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------


def _brand_configs(brand_arg: str) -> list[BrandConfig]:
    if brand_arg == "all":
        keys_with_data = store.brand_keys_with_data()
        return [b for b in list_brands() if b.brand_key in keys_with_data]
    return [get_brand(brand_arg)]


def _candidate_rows(brand: BrandConfig, observations: list[dict]) -> list[dict]:
    """One candidate row per (observation, tracked entity), with a freshly computed detector
    verdict — re-running `detect_mentions` read-only rather than trusting whatever verdict was
    stored at collection time, so this always validates the *current* detector code."""
    alias_table = brand.alias_table()
    names = brand.entity_names()
    rows: list[dict] = []
    for obs in observations:
        text = obs.get("response_text") or ""
        if not text.strip():
            continue
        mentions = {m.entity_id: m for m in detect_mentions(text, alias_table)}
        for entry in alias_table:
            mention = mentions.get(entry.entity_id)
            verdict = mention is not None
            alias_text = text[mention.char_start : mention.char_end] if verdict and mention.char_start >= 0 else ""
            row_id = f"{brand.brand_key}:{obs['observation_id']}:{entry.entity_id}"
            rows.append(
                {
                    "row_id": row_id,
                    "brand_key": brand.brand_key,
                    "observation_id": obs["observation_id"],
                    "provider_id": obs.get("provider_id", "?"),
                    "entity_id": entry.entity_id,
                    "entity_kind": entry.entity_kind,
                    "entity_label": names.get(entry.entity_id, entry.entity_id),
                    "query_text": obs.get("query_text", ""),
                    "response_text": text,
                    "annotator_a": "",
                    "annotator_b": "",
                    "adjudicated": "",
                    "notes": "",
                    "_verdict": verdict,
                    "_alias_text": alias_text,
                }
            )
    return rows


def _stratified_sample(rows: list[dict], n: int, rng: random.Random) -> list[dict]:
    """Split into detected / not-detected pools and sample from both, so the sheet always has a
    mix of the two kinds of row rather than (say) only the easy, obviously-mentioned ones."""
    detected = [r for r in rows if r["_verdict"]]
    undetected = [r for r in rows if not r["_verdict"]]
    rng.shuffle(detected)
    rng.shuffle(undetected)

    take_detected = min(n // 2, len(detected))
    take_undetected = min(n - take_detected, len(undetected))
    remaining = n - take_detected - take_undetected
    if remaining > 0:
        extra = min(remaining, len(detected) - take_detected)
        take_detected += extra

    sample = detected[:take_detected] + undetected[:take_undetected]
    rng.shuffle(sample)
    return sample


def cmd_export(args: argparse.Namespace) -> int:
    brands = _brand_configs(args.brand)
    if not brands:
        print(f"No stored data for brand {args.brand!r}. Run scripts/run_tracking_loop.py first.")
        return 1

    all_rows: list[dict] = []
    for brand in brands:
        snapshots = store.load_snapshots(brand.brand_key)
        if args.run:
            snapshots = [s for s in snapshots if (s.get("run_id") or "").startswith(args.run)]
        if not snapshots:
            continue
        snapshot = snapshots[-1]  # most recent job
        all_rows.extend(_candidate_rows(brand, snapshot.get("raw_observations") or []))

    if not all_rows:
        print("No observations with response text found to sample from.")
        return 1

    rng = random.Random(args.seed) if args.seed is not None else random.Random()
    sample = _stratified_sample(all_rows, args.n, rng)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = list(FIELDNAMES) if args.blind else [*FIELDNAMES[:9], *VERDICT_FIELDNAMES, *FIELDNAMES[9:]]
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in sample:
            visible = {k: row[k] for k in FIELDNAMES}
            if not args.blind:
                visible["detector_verdict"] = _yn(row["_verdict"])
                visible["detected_alias"] = row["_alias_text"]
            writer.writerow(visible)

    detected_n = sum(1 for r in sample if r["_verdict"])
    print(f"Wrote {len(sample)} rows ({detected_n} detected, {len(sample) - detected_n} not detected) to {out}")

    if args.blind:
        sidecar = _sidecar_path(out)
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "sheet": str(out),
            "rows": {
                r["row_id"]: {"detector_verdict": r["_verdict"], "detected_alias": r["_alias_text"]} for r in sample
            },
        }
        sidecar.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Detector verdicts hidden from annotators — written to {sidecar} for `score` to read later.")
    else:
        print("--no-blind: detector verdicts are visible in the sheet itself (not suitable for real labelling).")

    return 0


# ---------------------------------------------------------------------------
# score
# ---------------------------------------------------------------------------


def _load_sheet(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _load_verdicts(sheet_path: Path, rows: list[dict], sidecar_arg: str | None) -> dict[str, bool]:
    """Verdict per row_id, from the sidecar file (blind export) or the sheet's own
    `detector_verdict` column (non-blind export)."""
    sidecar_path = Path(sidecar_arg) if sidecar_arg else _sidecar_path(sheet_path)
    if sidecar_path.exists():
        payload = json.loads(sidecar_path.read_text(encoding="utf-8"))
        return {row_id: entry["detector_verdict"] for row_id, entry in payload["rows"].items()}
    if rows and "detector_verdict" in rows[0]:
        return {row["row_id"]: _parse_label(row["detector_verdict"]) or False for row in rows}
    raise FileNotFoundError(
        f"No sidecar verdicts file at {sidecar_path} and no 'detector_verdict' column in the sheet. "
        "Pass --sidecar, or re-export with --no-blind."
    )


def _markdown_table(sections: list[tuple[str, int, float, float, float]]) -> str:
    lines = [
        "| Scope | N | Precision | Recall | F1 |",
        "|---|---:|---:|---:|---:|",
    ]
    for name, n, p, r, f1 in sections:
        lines.append(f"| {name} | {n} | {p:.2f} | {r:.2f} | {f1:.2f} |")
    return "\n".join(lines)


def cmd_score(args: argparse.Namespace) -> int:
    sheet_path = Path(args.sheet)
    rows = _load_sheet(sheet_path)
    if not rows:
        print(f"{sheet_path} has no rows.")
        return 1

    verdicts = _load_verdicts(sheet_path, rows, args.sidecar)

    labelled: list[dict] = []
    incomplete = 0
    for row in rows:
        try:
            a = _parse_label(row.get("annotator_a", ""))
            b = _parse_label(row.get("annotator_b", ""))
            adjudicated = _parse_label(row.get("adjudicated", ""))
        except ValueError as exc:
            print(f"  ! {row.get('row_id', '?')}: {exc}")
            return 1
        if a is None or b is None:
            incomplete += 1
            continue
        labelled.append({**row, "_a": a, "_b": b, "_adjudicated": adjudicated})

    if incomplete:
        print(f"{incomplete} row(s) missing annotator_a/annotator_b — skipped.")
    if not labelled:
        print("No fully-labelled rows to score yet.")
        return 1

    labels_a = [r["_a"] for r in labelled]
    labels_b = [r["_b"] for r in labelled]
    kappa = cohens_kappa(labels_a, labels_b)
    consensus = consensus_labels(labels_a, labels_b)

    gold_rows = []
    unresolved = 0
    for row, label in zip(labelled, consensus.labels, strict=True):
        gold = row["_adjudicated"] if label is None else label
        if gold is None:
            unresolved += 1
            continue
        gold_rows.append({**row, "_gold": gold, "_predicted": verdicts[row["row_id"]]})

    if unresolved:
        print(f"{unresolved} disagreement(s) still need adjudication (no 'adjudicated' value) — excluded from precision/recall.")

    def _section(name: str, subset: list[dict]) -> tuple[str, int, float, float, float] | None:
        if not subset:
            return None
        result = precision_recall_f1([r["_predicted"] for r in subset], [r["_gold"] for r in subset])
        return (name, result.support, result.precision, result.recall, result.f1)

    sections = [
        s
        for s in (
            _section("Overall", gold_rows),
            _section("Self", [r for r in gold_rows if r["entity_kind"] == "self"]),
            _section("Competitor", [r for r in gold_rows if r["entity_kind"] == "competitor"]),
        )
        if s is not None
    ]

    print()
    print(f"Precision / recall / F1 (n={len(gold_rows)} adjudicated rows, {unresolved} unresolved):")
    for name, n, p, r, f1 in sections:
        print(f"  {name:<11} n={n:<4} precision={p:.2f}  recall={r:.2f}  f1={f1:.2f}")

    print()
    band = kappa_band(kappa.kappa)
    degenerate_note = "  (degenerate: both annotators used a single label throughout)" if kappa.degenerate else ""
    print(
        f"Cohen's kappa: {kappa.kappa:.2f} ({band}) — n={kappa.n}, "
        f"po={kappa.observed_agreement:.2f}, pe={kappa.expected_agreement:.2f}{degenerate_note}"
    )
    print(f"Disagreements between annotator_a/annotator_b: {consensus.disagreement_count} of {kappa.n}")

    markdown = [
        f"<!-- generated by scripts/validate_detector.py score --sheet {sheet_path} on "
        f"{datetime.now(timezone.utc).isoformat()} -->",
        "",
        _markdown_table(sections),
        "",
        f"Cohen's kappa: **{kappa.kappa:.2f}** ({band}) — n={kappa.n}, po={kappa.observed_agreement:.2f}, "
        f"pe={kappa.expected_agreement:.2f}{' (degenerate)' if kappa.degenerate else ''}",
        "",
        f"Disagreements: {consensus.disagreement_count} of {kappa.n} rows "
        f"({unresolved} still unresolved / not yet adjudicated).",
        "",
    ]
    md_text = "\n".join(markdown)
    if args.out:
        Path(args.out).write_text(md_text, encoding="utf-8")
        print(f"\nMarkdown table written to {args.out}")
    else:
        print("\n--- markdown (paste into docs) ---")
        print(md_text)

    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="AC-12 detector validation: sample, blind-label, score.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_export = sub.add_parser("export", help="sample stored observations into a blind labelling sheet")
    p_export.add_argument("--out", required=True, help="path to write the labelling sheet (CSV)")
    p_export.add_argument("--brand", default="all", help="brand key, or 'all' brands with stored data (default)")
    p_export.add_argument("--run", metavar="RUN_ID", help="use this run instead of each brand's latest (prefix ok)")
    p_export.add_argument("--n", type=int, default=30, help="number of (observation, entity) rows to sample (default 30)")
    p_export.add_argument("--seed", type=int, default=None, help="random seed, for a reproducible sample")
    p_export.add_argument(
        "--blind", dest="blind", action="store_true", default=True,
        help="hide the detector verdict in a sidecar file (default)",
    )
    p_export.add_argument(
        "--no-blind", dest="blind", action="store_false",
        help="put the detector verdict directly in the sheet (not for real labelling)",
    )
    p_export.set_defaults(func=cmd_export)

    p_score = sub.add_parser("score", help="score a filled-in labelling sheet against the detector")
    p_score.add_argument("--sheet", required=True, help="the filled-in labelling sheet (CSV)")
    p_score.add_argument("--sidecar", default=None, help="path to the verdicts sidecar (default: <sheet>.verdicts.json)")
    p_score.add_argument("--out", default=None, help="write the markdown results table here (default: print only)")
    p_score.set_defaults(func=cmd_score)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
