"""Terminal viewer for tracking snapshots (CONTRACT §5 records in DATA_DIR/tracking/).

Stdlib only. Colour is on for a TTY and off when piped or when NO_COLOR is set.

Run: uv run python scripts/report.py                      # one line per brand
     uv run python scripts/report.py gajanan_vada_pav     # latest snapshot in full
     uv run python scripts/report.py gajanan_vada_pav --evidence 3
     uv run python scripts/report.py gajanan_vada_pav --history
     uv run python scripts/report.py gajanan_vada_pav --run <run_id>
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
import textwrap
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from app.tracking import store  # noqa: E402  (stdlib-only module)

# --- colour ---------------------------------------------------------------------------

_USE_COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
_CODES = {
    "bold": "1",
    "dim": "2",
    "red": "31",
    "green": "32",
    "yellow": "33",
    "blue": "34",
    "magenta": "35",
    "cyan": "36",
    "grey": "90",
    "on_yellow": "30;43",
    "on_green": "30;42",
    "on_red": "97;41",
}


def c(text: object, *styles: str) -> str:
    text = str(text)
    if not _USE_COLOR or not styles:
        return text
    codes = ";".join(_CODES[s] for s in styles)
    return f"\033[{codes}m{text}\033[0m"


_ANSI_RE = re.compile(r"\033\[[0-9;]*m")


def _visible_len(text: str) -> int:
    return len(_ANSI_RE.sub("", text))


def pad(text: str, width: int, align: str = "<") -> str:
    gap = max(0, width - _visible_len(text))
    return (" " * gap + text) if align == ">" else (text + " " * gap)


WIDTH = min(110, shutil.get_terminal_size((100, 24)).columns)

# --- formatting helpers ---------------------------------------------------------------


def pct(value: float | None, digits: int = 1) -> str:
    return "n/a" if value is None else f"{value * 100:.{digits}f}%"


def num(value: float | None, digits: int = 2) -> str:
    return "n/a" if value is None else f"{value:.{digits}f}"


def bar(fraction: float | None, width: int = 24, colour: str = "cyan") -> str:
    if fraction is None:
        return c("·" * width, "grey")
    fraction = max(0.0, min(1.0, fraction))
    full = int(round(fraction * width))
    return c("█" * full, colour) + c("░" * (width - full), "grey")


def ci_bar(value: float, low: float, high: float, width: int = 24) -> str:
    """0-100 scale: ░ outside the CI, ▒ inside it, █ at the point estimate."""
    cells = []
    for i in range(width):
        lo_edge, hi_edge = i * 100 / width, (i + 1) * 100 / width
        if lo_edge <= value < hi_edge or (i == width - 1 and value >= 100):
            cells.append(c("█", "magenta"))
        elif hi_edge > low and lo_edge < high:
            cells.append(c("▒", "magenta"))
        else:
            cells.append(c("░", "grey"))
    return "".join(cells)


def sparkline(values: list[float]) -> str:
    ticks = "▁▂▃▄▅▆▇█"
    if not values:
        return ""
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return ticks[3] * len(values)
    return "".join(ticks[int((v - lo) / (hi - lo) * (len(ticks) - 1))] for v in values)


def when(iso: str | None) -> str:
    if not iso:
        return "?"
    try:
        return datetime.fromisoformat(iso).strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return iso[:16]


def short(run_id: str | None) -> str:
    return (run_id or "legacy")[:8]


def rule(title: str = "") -> None:
    if title:
        line = f"── {title} "
        print(c(line + "─" * max(0, WIDTH - len(line)), "blue"))
    else:
        print(c("─" * WIDTH, "blue"))


def table(headers: list[str], rows: list[list[str]], aligns: str | None = None) -> None:
    aligns = aligns or "<" * len(headers)
    widths = [max([_visible_len(h)] + [_visible_len(r[i]) for r in rows]) for i, h in enumerate(headers)]
    print("  " + "  ".join(pad(c(h, "bold"), w, a) for h, w, a in zip(headers, widths, aligns)))
    for row in rows:
        print("  " + "  ".join(pad(cell, w, a) for cell, w, a in zip(row, widths, aligns)))


def wrap(text: str, indent: int) -> str:
    return textwrap.fill(
        " ".join(text.split()),
        width=max(40, WIDTH - 2),
        initial_indent=" " * indent,
        subsequent_indent=" " * indent,
    )


def synthetic_banner() -> None:
    msg = "  SYNTHETIC DEMO DATA — not a real measurement  "
    print(c(msg.center(WIDTH), "on_yellow", "bold") if _USE_COLOR else f"*** {msg.strip()} ***")


# --- views ----------------------------------------------------------------------------


def show_header(s: dict) -> None:
    rule()
    title = f"{s.get('brand', s.get('brand_key'))}  ({s.get('brand_key')})"
    print(c(title, "bold"))
    origin = s.get("data_origin", "live")
    origin_style = {"live": "green", "replay": "cyan", "synthetic": "yellow"}.get(origin, "grey")
    started = s.get("collection_started_at") or s.get("collected_at")
    print(
        f"  run {c(s.get('run_id', 'legacy'), 'bold')}   {when(started)} UTC   "
        f"origin {c(origin, origin_style, 'bold')}   providers {', '.join(s.get('providers', [])) or '?'}"
    )
    adm = s.get("admission") or {}
    status = s.get("status", "?")
    status_txt = c(status, "green" if status == "completed" else "yellow")
    if adm:
        adm_txt = c(adm.get("status", "?").upper(), "green" if adm.get("admissible") else "red", "bold")
        print(
            f"  status {status_txt}   admission {adm_txt}   "
            f"query coverage {pct(adm.get('query_coverage'), 0)}   "
            f"sample completeness {pct(adm.get('sample_completeness'), 0)}   "
            f"{s.get('observation_count', '?')} obs · {s.get('cluster_count', '?')} queries"
        )
        for reason in adm.get("reasons", []):
            print(c(f"    ! {reason}", "yellow"))
    else:
        print(f"  status {status_txt}")
    if origin == "synthetic":
        synthetic_banner()


def show_metrics(s: dict) -> None:
    r = s.get("analysis_result") or {}
    rule("Visibility (unprompted queries only)")
    comp, lo, hi = r.get("composite_score", 0.0), r.get("ci_low", 0.0), r.get("ci_high", 0.0)
    rows = [
        ["Coverage", pct(r.get("coverage")), bar(r.get("coverage"), colour="green"), "share of answers naming the brand"],
        ["Prominence", num(r.get("prominence")), bar(r.get("prominence"), colour="cyan"), "how early/central when named (0-1)"],
        ["Share of voice", pct(r.get("share_of_voice")), bar(r.get("share_of_voice"), colour="blue"), "brand vs competitor mentions"],
        [
            c("Composite", "bold"),
            c(f"{comp:.1f}", "bold") + "/100",
            ci_bar(comp, lo, hi),
            f"95% CI [{lo:.1f}, {hi:.1f}]",
        ],
    ]
    table(["metric", "value", "", ""], rows, "<><<")

    per = r.get("per_provider_coverage") or []
    if per:
        print()
        rows = [
            [
                p["provider_id"],
                pct(p.get("coverage")),
                bar(p.get("coverage"), 16, "green"),
                f"{p.get('mentioned_count', 0)}/{p.get('observation_count', 0)} answers",
            ]
            for p in per
        ]
        table(["provider", "coverage", "", "mentioned"], rows, "<><<")


def _gap_numbers(detail: dict, entities: dict) -> str:
    parts = []
    for key, value in detail.items():
        if key == "competitor_id":
            parts.append(f"vs {c(entities.get(value, value), 'red')}")
        elif isinstance(value, float):
            parts.append(f"{key}={pct(value) if 'rate' in key or key == 'coverage' else num(value)}")
        elif isinstance(value, (list, tuple)):
            parts.append(f"{key}={len(value)}")
        else:
            parts.append(f"{key}={value}")
    return "  ".join(parts)


def show_gaps(s: dict) -> None:
    gaps = s.get("gaps") or []
    entities = s.get("entities") or {}
    rule(f"Gaps ({len(gaps)})")
    if not gaps:
        print(c("  no gaps detected", "grey"))
        return
    for g in gaps:
        detail = dict(g.get("detail") or {})
        scope = detail.pop("scope", None) or ("competitor" if "competitor_id" in detail else "overall")
        n_evidence = len(g.get("evidence_refs") or [])
        print(
            f"  {c(g.get('gap_id', '—'), 'magenta')}  {pad(c(g.get('gap_type', '?').upper(), 'bold'), 12)}"
            f" {pad(c(scope, 'cyan'), 11)} {_gap_numbers(detail, entities)}"
            f"  {c(f'({n_evidence} evidence)', 'grey')}"
        )


def show_recommendations(s: dict) -> None:
    recs = s.get("recommendations") or []
    gap_types = {g.get("gap_id"): g.get("gap_type") for g in s.get("gaps") or []}
    rule(f"Recommendations ({len(recs)})")
    if not recs:
        print(c("  no recommendations", "grey"))
        return
    for i, rec in enumerate(recs, 1):
        delta = rec.get("delta_composite", 0.0) or 0.0
        gap_id = rec.get("gap_id")
        traced = gap_id in gap_types
        trace = (
            c(f"← {gap_id} ({gap_types[gap_id]})", "magenta")
            if traced
            else c(f"← {gap_id or 'NO GAP'} (untraced!)", "red", "bold")
        )
        print(
            f"  {c(f'#{i}', 'bold')} {c(rec.get('action', '?'), 'bold')}  "
            f"{c(rec.get('action_class', ''), 'cyan')}"
        )
        print(
            f"     priority {num(rec.get('priority'))}   Δcomposite {c(f'{delta:+.1f}', 'green' if delta > 0 else 'grey')}"
            f"   confidence {pct(rec.get('confidence'), 0)}   effort {rec.get('effort', '?')} ({ {1: 'listing', 3: 'content', 5: 'positioning', 8: 'product'}.get(rec.get('effort'), '?')})   {trace}"
            f"   {c('drafted by ' + rec.get('drafted_by', 'template'), 'grey')}"
        )
        if rec.get("reasoning"):
            print(wrap(rec["reasoning"], 5))
        print()


def _highlight(text: str, spans: list[tuple[int, int, str]]) -> str:
    out, pos = [], 0
    for start, end, kind in sorted(spans):
        if start < pos or start < 0 or end > len(text):
            continue
        out.append(text[pos:start])
        style = ("on_green", "bold") if kind == "self" else ("on_red", "bold")
        out.append(c(text[start:end], *style) if _USE_COLOR else f"[[{text[start:end]}]]")
        pos = end
    out.append(text[pos:])
    return "".join(out)


def show_evidence(s: dict, n: int) -> None:
    obs = s.get("raw_observations") or []
    entities = s.get("entities") or {}
    # Most informative first: brand named, then competitor-only, then no mentions.
    def rank(o: dict) -> int:
        kinds = {m.get("entity_kind") for m in o.get("mentions", [])}
        return 0 if "self" in kinds else 1 if kinds else 2

    chosen = sorted(obs, key=rank)[:n]
    rule(f"Evidence ({len(chosen)} of {len(obs)} observations)")
    legend = f"{c(' brand ', 'on_green')} {c(' competitor ', 'on_red')}" if _USE_COLOR else "[[mention]]"
    print(f"  {legend}")
    for o in chosen:
        mentions = o.get("mentions", [])
        spans = [(m["char_start"], m["char_end"], m["entity_kind"]) for m in mentions if m.get("char_start", -1) >= 0]
        text = o.get("response_text", "")
        # Excerpt around the first mention so long answers stay readable.
        first = min((sp[0] for sp in spans), default=0)
        lo = max(0, first - 250)
        hi = min(len(text), lo + 900)
        excerpt_spans = [(a - lo, b - lo, k) for a, b, k in spans if a >= lo and b <= hi]
        body = _highlight(text[lo:hi], excerpt_spans)
        body = ("… " if lo else "") + body + (" …" if hi < len(text) else "")
        print()
        print(
            f"  {c(o.get('observation_id', '?'), 'magenta')}  {c(o.get('provider_id', '?'), 'cyan')}"
            f" {c(o.get('model_version') or '', 'grey')}  intent {o.get('intent_type', '?')}"
            + ("" if o.get("scored", True) else "  " + c("not scored (names brand)", "grey"))
        )
        print(f"  {c('Q:', 'bold')} {c(o.get('query_text', '?'), 'bold')}")
        summary = ", ".join(
            f"{entities.get(m['entity_id'], m['entity_id'])} #{m.get('rank')}"
            + (" (passing)" if m.get("is_passing_mention") else "")
            for m in sorted(mentions, key=lambda m: m.get("rank", 99))
        )
        print(f"  {c('mentions:', 'grey')} {summary or c('none', 'grey')}")
        print("  " + c("A:", "bold") + " " + body.strip().replace("\n", "\n     "))


def show_history(brand_key: str, snaps: list[dict]) -> None:
    rule(f"History — {brand_key} ({len(snaps)} snapshots)")
    rows = []
    for s in snaps:
        r = s.get("analysis_result") or {}
        adm = s.get("admission") or {}
        ok = adm.get("admissible", True)
        style = () if ok else ("dim",)
        rows.append(
            [
                c(when(s.get("collection_started_at") or s.get("collected_at")), *style),
                c(short(s.get("run_id")), *style),
                c(s.get("data_origin", "live"), "yellow" if s.get("data_origin") == "synthetic" else "grey"),
                c(f"{r.get('composite_score', 0.0):.1f}", "bold", *style),
                c(f"[{r.get('ci_low', 0.0):.1f}, {r.get('ci_high', 0.0):.1f}]", *style),
                c(pct(r.get("coverage")), *style),
                c("yes" if ok else "no", "green" if ok else "red"),
                c(s.get("comparability_key", "—"), "grey"),
            ]
        )
    table(["date (UTC)", "run", "origin", "composite", "95% CI", "coverage", "admit", "comparability_key"], rows, "<<<>><<<")
    values = [(s.get("analysis_result") or {}).get("composite_score", 0.0) for s in snaps]
    if values:
        print(f"\n  composite trend  {c(sparkline(values), 'magenta')}   min {min(values):.1f} · max {max(values):.1f}")
    keys = {s.get("comparability_key") for s in snaps}
    if len(keys) > 1:
        print(
            c(
                f"  ! {len(keys)} different comparability keys — query set, sampling config or model versions "
                "changed between runs; only snapshots sharing a key are directly comparable.",
                "yellow",
            )
        )


def show_all() -> int:
    keys = sorted(store.brand_keys_with_data())
    if not keys:
        print(f"No snapshots under {store.DATA_DIR / 'tracking'} — run scripts/run_tracking_loop.py first.")
        return 1
    rule("All brands (latest snapshot)")
    rows = []
    for key in keys:
        snaps = store.load_snapshots(key)
        if not snaps:
            continue
        s = snaps[-1]
        r = s.get("analysis_result") or {}
        origin = s.get("data_origin", "live")
        adm = s.get("admission") or {}
        rows.append(
            [
                c(s.get("brand", key), "bold"),
                when(s.get("collection_started_at") or s.get("collected_at")),
                c(origin, "yellow" if origin == "synthetic" else "green" if origin == "live" else "cyan"),
                c(f"{r.get('composite_score', 0.0):.1f}", "bold"),
                f"[{r.get('ci_low', 0.0):.1f}, {r.get('ci_high', 0.0):.1f}]",
                pct(r.get("coverage")),
                str(len(s.get("gaps") or [])),
                str(len(s.get("recommendations") or [])),
                c("yes" if adm.get("admissible", True) else "no", "green" if adm.get("admissible", True) else "red"),
                f"{len(snaps)} {c(sparkline([(x.get('analysis_result') or {}).get('composite_score', 0.0) for x in snaps]), 'magenta')}",
            ]
        )
    table(
        ["brand", "latest (UTC)", "origin", "composite", "95% CI", "coverage", "gaps", "recs", "admit", "runs"],
        rows,
        "<<<>><>>><",
    )
    if any("synthetic" in row[2] for row in rows):
        print(c("\n  'synthetic' rows are SYNTHETIC DEMO DATA — not a real measurement.", "yellow"))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Show tracking snapshots in the terminal.")
    parser.add_argument("brand", nargs="?", default="all", help="brand key, or 'all' (default)")
    parser.add_argument("--evidence", nargs="?", type=int, const=5, default=None, metavar="N",
                        help="show N observations with mentions highlighted (default 5)")
    parser.add_argument("--history", action="store_true", help="table of every snapshot for the brand")
    parser.add_argument("--run", metavar="RUN_ID", help="show this run instead of the latest (prefix ok)")
    args = parser.parse_args()

    if args.brand == "all":
        return show_all()

    snaps = store.load_snapshots(args.brand)
    if not snaps:
        known = ", ".join(sorted(store.brand_keys_with_data())) or "none"
        print(f"No snapshots for {args.brand!r} (brands with data: {known}).")
        return 1

    if args.history:
        show_history(args.brand, snaps)
        return 0

    if args.run:
        matches = [s for s in snaps if (s.get("run_id") or "").startswith(args.run)]
        if len(matches) != 1:
            print(f"{'No' if not matches else 'Ambiguous'} run matching {args.run!r} for {args.brand}.")
            return 1
        snapshot = matches[0]
    else:
        snapshot = snaps[-1]

    show_header(snapshot)
    show_metrics(snapshot)
    show_gaps(snapshot)
    show_recommendations(snapshot)
    if args.evidence is not None:
        show_evidence(snapshot, max(1, args.evidence))
    if len(snaps) > 1 and not args.run:
        print(c(f"  {len(snaps)} snapshots on file — see --history", "grey"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
