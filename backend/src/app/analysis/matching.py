"""Matched comparison of two runs — pure, deterministic (metrics v2).

v1 compared two runs only when their whole comparability key matched (same questions,
providers, models and aliases). In practice almost every run differed in something (a
provider failed, a question was edited), so no two runs were ever comparable and "did it
change?" could never be answered.

v2 compares runs on what they have *in common*: cells with the same question (by
normalised text), provider and model version. Each matched question contributes one
paired difference, VI_after(q) − VI_before(q); the change is their mean (every question
counts equally, as in a paired test; `vi_before`/`vi_after` are averaged the same way), with the
interval and MDE from `stats.paired_summary`. The share of cells matched (`overlap`) is
reported, and a comparison with too few matched questions or too little overlap is
`insufficient_data` rather than a guess.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence

from app.analysis.stats import paired_summary, r6, rng_for, verdict

DEFAULT_N_BOOTSTRAP = 1000
DEFAULT_BASE_SEED = 20261013


def cell_key(cell: Mapping) -> tuple[str, str, str]:
    return (cell["q"], cell["provider"], cell["model"])


def in_scope(cell: Mapping, scope: Mapping | None) -> bool:
    """Scope keys (all optional): provider_id, intent_type, questions (iterable of keys)."""
    if not scope:
        return True
    if scope.get("provider_id") and cell["provider"] != scope["provider_id"]:
        return False
    if scope.get("intent_type") and cell["intent"] != scope["intent_type"]:
        return False
    questions = scope.get("questions")
    return not (questions is not None and cell["q"] not in set(questions))


def _scoped(cells: Iterable[Mapping], scope: Mapping | None) -> dict[tuple[str, str, str], Mapping]:
    return {cell_key(c): c for c in cells if in_scope(c, scope)}


def _pool(cells: Iterable[Mapping], eid: str) -> tuple[float, int, int]:
    """(sum of weights, answers, answers naming it) over cells where `eid` is not excluded."""
    total, n, named = 0.0, 0, 0
    for c in cells:
        stats = c["e"].get(eid)
        if stats is None:
            continue
        total += stats[0]
        n += c["n"]
        named += stats[2]
    return total, n, named


def overlap(before: Sequence[Mapping], after: Sequence[Mapping], scope: Mapping | None = None) -> float:
    a, b = _scoped(before, scope), _scoped(after, scope)
    union = set(a) | set(b)
    return len(set(a) & set(b)) / len(union) if union else 0.0


def match(
    before: Sequence[Mapping],
    after: Sequence[Mapping],
    entity_id: str,
    *,
    scope: Mapping | None = None,
    seed_basis: str = "",
    n_bootstrap: int = DEFAULT_N_BOOTSTRAP,
    base_seed: int = DEFAULT_BASE_SEED,
) -> dict:
    """Paired comparison of `entity_id`'s VI between two runs' cells (VI points, 0–100)."""
    a, b = _scoped(before, scope), _scoped(after, scope)
    union = set(a) | set(b)
    keys = sorted(
        k for k in set(a) & set(b) if entity_id in a[k]["e"] and entity_id in b[k]["e"]
    )
    share = len(keys) / len(union) if union else 0.0

    by_q: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    for k in keys:
        by_q[k[0]].append(k)
    diffs: list[float] = []
    per_question: dict[str, dict] = {}
    for q in sorted(by_q):
        sa, na, _ = _pool((a[k] for k in by_q[q]), entity_id)
        sb, nb, _ = _pool((b[k] for k in by_q[q]), entity_id)
        if not na or not nb:
            continue
        va, vb = 100 * sa / na, 100 * sb / nb
        diffs.append(vb - va)
        per_question[q] = {"before": r6(va), "after": r6(vb)}

    rng = rng_for(base_seed, seed_basis, f"match|{entity_id}")
    summary = paired_summary(diffs, rng, n_bootstrap)

    sa, na, named_a = _pool((a[k] for k in keys), entity_id)
    sb, nb, named_b = _pool((b[k] for k in keys), entity_id)
    providers: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    for k in keys:
        providers[k[1]].append(k)
    per_provider = {}
    for pid, pkeys in sorted(providers.items()):
        psa, pna, _ = _pool((a[k] for k in pkeys), entity_id)
        psb, pnb, _ = _pool((b[k] for k in pkeys), entity_id)
        per_provider[pid] = {
            "before": r6(100 * psa / pna if pna else 0.0),
            "after": r6(100 * psb / pnb if pnb else 0.0),
        }

    def decomposition(total: float, n: int, named: int) -> dict:
        return {
            "presence": r6(named / n if n else 0.0),
            "mean_weight_named": r6(total / named) if named else None,
        }

    return {
        "entity_id": entity_id,
        "matched_cells": len(keys),
        "overlap": r6(share),
        "questions": summary["n"],
        # Question-averaged, like the change itself, so vi_after - vi_before == delta.
        "vi_before": r6(math.fsum(v["before"] for v in per_question.values()) / len(per_question))
        if per_question else None,
        "vi_after": r6(math.fsum(v["after"] for v in per_question.values()) / len(per_question))
        if per_question else None,
        "delta": summary["mean"],
        "sd": summary["sd"],
        "ci95": summary["ci95"],
        "ci80": summary["ci80"],
        "mde": summary["mde"],
        "verdict": verdict(summary, overlap=share),
        "before": decomposition(sa, na, named_a),
        "after": decomposition(sb, nb, named_b),
        "per_provider": per_provider,
        "per_question": per_question,
    }


def market_drift(
    before: Sequence[Mapping],
    after: Sequence[Mapping],
    competitor_ids: Iterable[str],
    *,
    scope: Mapping | None = None,
) -> float | None:
    """Mean change in competitors' VI over the same matched cells (VI points). A large drift
    with no action of yours (e.g. a model update reshuffling everyone) is a warning that a
    change in your own VI may not be about you."""
    a, b = _scoped(before, scope), _scoped(after, scope)
    changes = []
    for cid in sorted(competitor_ids):
        keys = [k for k in set(a) & set(b) if cid in a[k]["e"] and cid in b[k]["e"]]
        sa, na, _ = _pool((a[k] for k in keys), cid)
        sb, nb, _ = _pool((b[k] for k in keys), cid)
        if na and nb:
            changes.append(100 * (sb / nb - sa / na))
    return r6(math.fsum(changes) / len(changes)) if changes else None
