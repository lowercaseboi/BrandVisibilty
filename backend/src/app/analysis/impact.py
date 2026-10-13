"""Impact evaluation: did visibility change after an action was done? — pure, deterministic.

"Proof of working" without causal overclaiming (PRD §4, §11.6). For one completed action
(an impact-ledger entry), comparing the last admissible run *before* it was done with the
latest admissible run *after*:

- **Primary estimate**: the matched paired change in the brand's VI on the cells the
  action's gaps are about (the gaps' scope), with its interval, MDE and verdict
  (`matching.match`). When that scope has too few questions for a verdict (a question type
  often has 3), the overall index is used instead and `basis` says so — a diluted but
  testable read rather than a guaranteed "insufficient data".
- **Robustness checks**, reported next to it, never folded into it:
    - *untargeted*: the same comparison on the brand's other cells; when they moved just as
      much, the change is probably not about this action (a difference-in-differences read);
    - *market drift*: the mean change in competitors' VI on the same cells — a model update
      that reshuffles everyone shows up here;
    - *placebo rate*: how often the same comparison fired ("rose"/"fell") between earlier
      consecutive runs when nothing was done — the empirical false-alarm rate for this brand.
- **Confounded**: another action was completed inside the same window with an overlapping
  scope; the change can't be attributed to either one.
- **Prediction check**: the expected gain recorded when the action was marked done vs the
  measured change converted to overall-index points (scoped change × the scope's share of
  answers), which is what `opportunity.calibrated_priors` learns from.

Wording stays "measured change after …": a verdict says the index rose after the action,
not that the action raised it.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, datetime
from itertools import pairwise

from app.analysis.matching import in_scope, market_drift, match
from app.analysis.stats import MIN_MATCHED_QUESTIONS, r6

WAITING = "waiting"
CONFOUNDED = "confounded"
NO_BASELINE = "no_baseline"


def parse_time(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value:
        return None
    try:
        at = datetime.fromisoformat(value)
    except ValueError:
        return None
    return at if at.tzinfo else at.replace(tzinfo=UTC)


def _scoped(cells: Iterable[Mapping], scopes: Sequence[Mapping]) -> list[Mapping]:
    """Cells in any of the scopes (an empty scope = every cell)."""
    if not scopes or any(not s for s in scopes):
        return list(cells)
    return [c for c in cells if any(in_scope(c, s) for s in scopes)]


def _outside(cells: Iterable[Mapping], scopes: Sequence[Mapping]) -> list[Mapping]:
    if not scopes or any(not s for s in scopes):
        return []
    return [c for c in cells if not any(in_scope(c, s) for s in scopes)]


def scopes_overlap(a: Sequence[Mapping], b: Sequence[Mapping]) -> bool:
    """Whether two actions' scopes can touch the same cells (conservative: provider vs intent
    scopes always overlap, since a provider answers every intent)."""
    if not a or not b or any(not s for s in a) or any(not s for s in b):
        return True
    for sa in a:
        for sb in b:
            if sa.get("provider_id") and sb.get("provider_id") and sa["provider_id"] != sb["provider_id"]:
                continue
            if sa.get("intent_type") and sb.get("intent_type") and sa["intent_type"] != sb["intent_type"]:
                continue
            return True
    return False


def _usable(runs: Sequence[Mapping]) -> list[Mapping]:
    return [r for r in runs if r.get("admissible", True) and r.get("cells") and parse_time(r.get("completed_at"))]


def evaluate(
    entry: Mapping,
    runs: Sequence[Mapping],
    competitor_ids: Iterable[str],
    *,
    other_entries: Sequence[Mapping] = (),
    self_id: str = "self",
    n_bootstrap: int = 1000,
) -> dict:
    """Evaluate one ledger entry against the brand's runs (oldest first).

    entry: {"ledger_id", "done_at", "closed_at"?, "scopes": [scope, ...], "prediction"?: {...}}
    runs:  [{"run_id", "completed_at", "admissible", "cells"}, ...]
    other_entries: the brand's other entries (for the confounding check).
    """
    competitor_ids = sorted(competitor_ids)
    done_at = parse_time(entry.get("done_at"))
    closed_at = parse_time(entry.get("closed_at"))
    scopes = list(entry.get("scopes") or [])
    usable = _usable(runs)
    base: dict = {"ledger_id": entry.get("ledger_id"), "pre_run_id": None, "post_run_id": None}
    if done_at is None:
        return {**base, "status": NO_BASELINE}

    before = [r for r in usable if parse_time(r["completed_at"]) <= done_at]
    after = [
        r for r in usable
        if parse_time(r["completed_at"]) > done_at and (closed_at is None or parse_time(r["completed_at"]) <= closed_at)
    ]
    pre_id = entry.get("pre_run_id")
    pre = next((r for r in before if r["run_id"] == pre_id), before[-1] if before else None)
    if pre is None:
        return {**base, "status": NO_BASELINE}
    if not after:
        return {**base, "pre_run_id": pre["run_id"], "status": WAITING}
    post = after[-1]
    seed_basis = f"{entry.get('ledger_id')}|{post['run_id']}"

    pre_cells, post_cells = _scoped(pre["cells"], scopes), _scoped(post["cells"], scopes)
    targeted = match(pre_cells, post_cells, self_id, seed_basis=seed_basis, n_bootstrap=n_bootstrap)
    basis, primary = "targeted", targeted
    if targeted["questions"] < MIN_MATCHED_QUESTIONS and len(pre_cells) < len(pre["cells"]):
        basis = "overall"
        pre_cells, post_cells = list(pre["cells"]), list(post["cells"])
        primary = match(pre_cells, post_cells, self_id, seed_basis=seed_basis + "|overall", n_bootstrap=n_bootstrap)
    total_pre = sum(c["n"] for c in pre["cells"])
    scope_share = sum(c["n"] for c in pre_cells) / total_pre if total_pre else 0.0

    untargeted = None
    outside_pre, outside_post = _outside(pre["cells"], scopes), _outside(post["cells"], scopes)
    if basis == "targeted" and outside_pre and outside_post:
        u = match(outside_pre, outside_post, self_id, seed_basis=seed_basis + "|untargeted", n_bootstrap=n_bootstrap)
        untargeted = {k: u[k] for k in ("questions", "delta", "ci95", "verdict")}
        if primary["delta"] is not None and u["delta"] is not None:
            untargeted["difference_in_differences"] = r6(primary["delta"] - u["delta"])

    # Placebo: consecutive earlier runs with no action in between.
    fired = pairs = 0
    placebo_scopes = scopes if basis == "targeted" else [{}]
    for a, b in pairwise(before):
        p = match(_scoped(a["cells"], placebo_scopes), _scoped(b["cells"], placebo_scopes), self_id,
                  seed_basis=f"placebo|{a['run_id']}|{b['run_id']}", n_bootstrap=n_bootstrap)
        if p["verdict"] == "insufficient_data":
            continue
        pairs += 1
        fired += p["verdict"] in ("rose_after", "fell_after")

    window_start, window_end = parse_time(pre["completed_at"]), parse_time(post["completed_at"])
    confounders = [
        o.get("ledger_id") for o in other_entries
        if o.get("ledger_id") != entry.get("ledger_id")
        and (t := parse_time(o.get("done_at"))) is not None and window_start < t <= window_end
        and scopes_overlap(scopes, list(o.get("scopes") or []))
    ]

    measured_overall = r6(primary["delta"] * scope_share) if primary["delta"] is not None else None
    prediction = dict(entry.get("prediction") or {})
    status = CONFOUNDED if confounders and primary["verdict"] != "insufficient_data" else primary["verdict"]
    return {
        **base,
        "pre_run_id": pre["run_id"],
        "post_run_id": post["run_id"],
        "status": status,
        "basis": basis,
        "primary": {k: v for k, v in primary.items() if k != "per_question"},
        "targeted": {k: targeted[k] for k in ("questions", "delta", "ci95", "mde", "verdict")},
        "scope_share": r6(scope_share),
        "measured_overall": measured_overall,
        "untargeted": untargeted,
        "market_drift": market_drift(pre_cells, post_cells, competitor_ids),
        "placebo": {"pairs": pairs, "fired": fired, "rate": r6(fired / pairs) if pairs else None},
        "confounded_by": confounders,
        "prediction_check": {
            "expected_gain_vi": prediction.get("expected_gain_vi"),
            "measured_overall": measured_overall,
            "error": r6(measured_overall - prediction["expected_gain_vi"])
            if measured_overall is not None and prediction.get("expected_gain_vi") is not None else None,
        },
    }
