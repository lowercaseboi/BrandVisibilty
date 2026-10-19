"""Impact ledger — an append-only record of completed actions and how visibility moved after.

`DATA_DIR/impact/<brand_key>.jsonl`, one event per line:

    {"type": "action_done", "ledger_id", "suggestion_key", "action", "competitor_id",
     "gap_ids", "recommendation_ids", "scopes", "done_at", "source", "campaign_id",
     "pre_run_id", "prediction": {expected_gain_vi, opportunity_vi, confidence,
     uptake_prior, mde, metric_config_hash}}
    {"type": "action_reopened", "ledger_id", "at"}
    {"type": "evaluation", "ledger_id", "as_of_run_id", "at", "status", "delta", "ci95", "mde"}

An entry opens when a board card enters "done" (moved by hand, or by Campaign Studio's
first publish — both go through `board.save_board`) and closes if the card leaves "done".
The prediction is frozen at that moment, so a later check compares against what was
expected *before* the result was known. Evaluations are recomputed on demand by the pure
`app.analysis.impact.evaluate` (deterministic), and appended after every new run as an
audit trail of what the app said when.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from datetime import UTC, datetime
from pathlib import Path

from app import paths
from app.analysis.impact import evaluate
from app.analysis.types import Gap
from app.recommendation.opportunity import calibrated_priors, scope_of

log = logging.getLogger(__name__)

_LOCK = threading.RLock()
VERDICTS = frozenset({"rose_after", "leaning_up", "no_detectable_change", "leaning_down", "fell_after"})


def _now() -> str:
    return datetime.now(UTC).isoformat()


def ledger_path(brand_key: str) -> Path:
    if not brand_key or "/" in brand_key or "\\" in brand_key or brand_key.startswith("."):
        raise ValueError(f"Invalid brand_key {brand_key!r}")
    return paths.DATA_DIR / "impact" / f"{brand_key}.jsonl"


def _append(brand_key: str, event: dict) -> None:
    path = ledger_path(brand_key)
    with _LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")


def load_events(brand_key: str) -> list[dict]:
    path = ledger_path(brand_key)
    if not path.exists():
        return []
    events = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return events


def entries(brand_key: str) -> list[dict]:
    """Ledger entries folded from the events: each action_done with `closed_at` when it was
    reopened, and its latest stored `evaluation` event."""
    out: dict[str, dict] = {}
    for event in load_events(brand_key):
        lid = event.get("ledger_id")
        if event.get("type") == "action_done" and lid:
            out[lid] = {**event, "closed_at": None, "last_evaluation": None}
        elif event.get("type") == "action_reopened" and lid in out:
            out[lid]["closed_at"] = event.get("at")
        elif event.get("type") == "evaluation" and lid in out:
            out[lid]["last_evaluation"] = event
    return list(out.values())


def _parse_key(key: str) -> tuple[str, str]:
    action, _, competitor = key.partition("|")
    return action, competitor


def _latest_snapshot(brand_key: str) -> tuple[dict | None, dict | None]:
    """(newest snapshot, newest admissible snapshot), light records."""
    from app.tracking import store

    records = store.load_snapshots(brand_key)
    admissible = [r for r in records if (r.get("admission") or {}).get("admissible", True)]
    return (records[-1] if records else None), (admissible[-1] if admissible else None)


def _new_entry(brand_key: str, key: str, context: dict) -> dict | None:
    action, competitor = _parse_key(key)
    latest, baseline = _latest_snapshot(brand_key)
    if latest is None:
        return None
    gaps = {g.get("gap_id"): g for g in latest.get("gaps") or [] if isinstance(g, dict)}
    recs = [
        r for r in latest.get("recommendations") or []
        if isinstance(r, dict) and r.get("action") == action
        and str((gaps.get(r.get("gap_id")) or {}).get("detail", {}).get("competitor_id") or "") == competitor
    ]
    if not recs:
        return None
    lead = max(recs, key=lambda r: (r.get("expected_gain_vi") or 0.0, r.get("priority") or 0.0))
    scopes = []
    for gap_id in sorted({r["gap_id"] for r in recs}):
        g = gaps.get(gap_id) or {}
        scope = scope_of(Gap(g.get("gap_type", ""), tuple(g.get("evidence_refs") or ()), dict(g.get("detail") or {}),
                             gap_id=gap_id))
        if scope not in scopes:
            scopes.append(scope)
    done_at = _now()
    metrics = latest.get("metrics_v2") or {}
    return {
        "type": "action_done",
        "ledger_id": "imp-" + hashlib.sha1(f"{brand_key}|{key}|{done_at}".encode()).hexdigest()[:10],
        "suggestion_key": key,
        "action": action,
        "competitor_id": competitor or None,
        "gap_ids": sorted({r["gap_id"] for r in recs}),
        "recommendation_ids": sorted({r["recommendation_id"] for r in recs if r.get("recommendation_id")}),
        "scopes": scopes,
        "done_at": done_at,
        "source": context.get("source", "board"),
        "campaign_id": context.get("campaign_id"),
        "pre_run_id": baseline.get("run_id") if baseline else None,
        "prediction": {
            "expected_gain_vi": lead.get("expected_gain_vi"),
            "opportunity_vi": lead.get("opportunity_vi"),
            "confidence": lead.get("confidence"),
            "uptake_prior": lead.get("uptake_prior"),
            "mde": (latest.get("mde_reference") or {}).get("value"),
            "metric_config_hash": metrics.get("metric_config_hash"),
        },
    }


def on_board_change(brand_key: str, before: dict, after: dict, context: dict | None = None) -> None:
    """Open an entry for every card that entered "done", close the open one of every card that
    left it. Called by `board.save_board`; never raises into the caller."""
    context = context or {}

    def column(cards: dict, key: str) -> str | None:
        card = cards.get(key)
        return card.get("column") if isinstance(card, dict) else None

    with _LOCK:
        open_by_key = {e["suggestion_key"]: e for e in entries(brand_key) if not e.get("closed_at")}
        for key in sorted(set(before) | set(after)):
            was, now = column(before, key) == "done", column(after, key) == "done"
            if now and not was and key not in open_by_key:
                entry = _new_entry(brand_key, key, context)
                if entry is not None:
                    _append(brand_key, entry)
            elif was and not now and key in open_by_key:
                _append(brand_key, {"type": "action_reopened", "ledger_id": open_by_key[key]["ledger_id"], "at": _now()})


def _runs(brand_key: str) -> list[dict]:
    from app.brands.registry import get_brand
    from app.tracking import rescore, store

    try:
        brand = get_brand(brand_key)
    except KeyError:
        return []
    runs = []
    for light in store.load_snapshots(brand_key):
        m = rescore.metrics_for(brand_key, light, brand=brand)
        if not m:
            continue
        runs.append({
            "run_id": light.get("run_id"),
            "completed_at": light.get("collection_completed_at"),
            "admissible": (light.get("admission") or {}).get("admissible", True),
            "cells": m["cells"],
        })
    return runs


def evaluate_all(brand_key: str) -> list[dict]:
    """Every entry with its current evaluation (deterministic, recomputed from the runs)."""
    from app.brands.registry import get_brand

    try:
        competitors = get_brand(brand_key).competitor_ids()
    except KeyError:
        competitors = frozenset()
    all_entries = entries(brand_key)
    if not all_entries:
        return []
    runs = _runs(brand_key)
    return [
        {**e, "evaluation": evaluate(e, runs, competitors, other_entries=all_entries)}
        for e in all_entries
    ]


def record_evaluations(brand_key: str, run_id: str) -> None:
    """Append one evaluation event per entry as of `run_id` (called after each new run)."""
    for item in evaluate_all(brand_key):
        ev = item["evaluation"]
        primary = ev.get("primary") or {}
        _append(brand_key, {
            "type": "evaluation",
            "ledger_id": item["ledger_id"],
            "as_of_run_id": run_id,
            "at": _now(),
            "status": ev.get("status"),
            "delta": primary.get("delta"),
            "ci95": primary.get("ci95"),
            "mde": primary.get("mde"),
        })


def outcomes(evaluated: list[dict]) -> list[dict]:
    """Settled outcomes (a clear verdict, not confounded) for prior calibration."""
    out = []
    for item in evaluated:
        ev = item.get("evaluation") or {}
        if ev.get("status") not in VERDICTS:
            continue
        out.append({
            "action": item.get("action"),
            "opportunity_vi": (item.get("prediction") or {}).get("opportunity_vi"),
            "measured_delta": ev.get("measured_overall"),
        })
    return out


def current_priors(brand_key: str) -> dict[str, float]:
    """Uptake priors recalibrated from this brand's settled outcomes (= the defaults when none)."""
    try:
        return calibrated_priors(outcomes(evaluate_all(brand_key)))
    except (OSError, ValueError) as exc:
        log.warning("Could not recalibrate priors for %s: %s", brand_key, exc)
        return calibrated_priors([])


def delete_brand(brand_key: str) -> None:
    ledger_path(brand_key).unlink(missing_ok=True)
