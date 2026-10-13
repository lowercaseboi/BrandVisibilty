"""Measured opportunity per gap (metrics v2) — pure: no I/O, no LLM calls.

v1 estimated a recommendation's value by *simulating* a fix ("insert the brand at rank 3
in half the answers that omit it") and re-scoring the inflated composite, which produced
gains like "+44 points" for a directory listing. v2 measures instead:

- **Opportunity** (VI points): what the gap's answers give the typical competitor that they
  don't give you. Per (question, provider, model) cell in the gap's scope:
  `max(0, target − you)`, weighted by the cell's share of all answers, so it is on the
  headline VI scale ("matching the typical competitor here would add this much to your
  overall index"). Target = the median VI of the competitors named in that cell; for a
  competitive gap, that competitor's VI.
- **Expected gain** = opportunity × `UPTAKE_PRIOR[action]`: the share of the opportunity an
  action is *assumed* to capture. These priors are documented assumptions, not
  measurements; the impact ledger records predicted vs measured gains so they can be
  recalibrated (`calibrated_priors`).
- **Confidence** = probability that the gap is real: the share of a seeded bootstrap over
  the scope's questions in which the gap's condition still holds (v2 analogue of the
  GapDetector rule). Replaces v1's `min(1, n_evidence / 10)`, which grew with sample size
  whether or not the gap was clear-cut.
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence

from app.analysis.matching import in_scope
from app.analysis.stats import r6, rng_for
from app.analysis.types import DetectionConfig, Gap
from app.analysis.visibility import SLOT_WEIGHTS

# Share of a gap's opportunity each action is assumed to capture (documented assumptions,
# docs/METRICS_v2.md §6). Listings and third-party coverage feed the sources assistants
# learn from; own-site content helps less while the assistants answer from training data.
UPTAKE_PRIOR: dict[str, float] = {
    "submit_to_directory": 0.25,
    "pitch_listicle": 0.30,
    "seek_review_coverage": 0.30,
    "community_answer": 0.10,
    "comparison_page": 0.20,
    "use_case_page": 0.15,
    "faq_page": 0.15,
    "video": 0.10,
    "add_attribute_claim": 0.15,
    "clarify_category_descriptor": 0.0,
    "correct_outdated_description": 0.0,
}

SCORED_GAP_TYPES = frozenset({"presence", "prominence", "competitive"})
DEFAULT_N_BOOTSTRAP = 500
DEFAULT_BASE_SEED = 20261013


def scope_of(gap: Gap) -> dict:
    """The cells a gap is about, in `matching.in_scope` form."""
    d = gap.detail
    if gap.gap_type == "presence" and d.get("scope") == "provider":
        return {"provider_id": d.get("provider_id")}
    if gap.gap_type == "presence" and d.get("scope") == "intent":
        return {"intent_type": d.get("intent_type")}
    return {}


def _cell_vi(cell: Mapping, eid: str) -> float | None:
    stats = cell["e"].get(eid)
    return None if stats is None or not cell["n"] else 100 * stats[0] / cell["n"]


def _target(cell: Mapping, gap: Gap, competitor_ids: Iterable[str]) -> float | None:
    if gap.gap_type == "competitive":
        return _cell_vi(cell, str(gap.detail.get("competitor_id", "")))
    named = [
        v for cid in sorted(competitor_ids)
        if (v := _cell_vi(cell, cid)) is not None and cell["e"][cid][2] > 0
    ]
    return statistics.median(named) if named else None


def _scope_cells(cells: Sequence[Mapping], gap: Gap, self_id: str) -> list[Mapping]:
    scoped = [c for c in cells if in_scope(c, scope_of(gap)) and self_id in c["e"]]
    if gap.gap_type == "prominence":
        scoped = [c for c in scoped if c["e"][self_id][2] > 0]  # where it is named, but low
    return scoped


def opportunity(
    cells: Sequence[Mapping], gap: Gap, self_id: str, competitor_ids: Iterable[str]
) -> dict:
    """{opportunity_vi, target_vi, self_vi_scope, scope_share} for one gap (VI points)."""
    competitor_ids = sorted(competitor_ids)
    total_answers = sum(c["n"] for c in cells)
    scoped = _scope_cells(cells, gap, self_id)
    scope_answers = sum(c["n"] for c in scoped)
    if gap.gap_type not in SCORED_GAP_TYPES or not total_answers or not scope_answers:
        return {"opportunity_vi": 0.0, "target_vi": None, "self_vi_scope": None, "scope_share": r6(
            scope_answers / total_answers if total_answers else 0.0)}

    gain = 0.0
    targets: list[tuple[float, int]] = []
    for c in scoped:
        own = _cell_vi(c, self_id) or 0.0
        target = _target(c, gap, competitor_ids)
        if target is None:
            continue
        targets.append((target, c["n"]))
        gain += (c["n"] / total_answers) * max(0.0, target - own)
    self_scope = 100 * math.fsum(c["e"][self_id][0] for c in scoped) / scope_answers
    target_scope = (
        math.fsum(t * n for t, n in targets) / sum(n for _, n in targets) if targets else None
    )
    return {
        "opportunity_vi": r6(gain),
        "target_vi": r6(target_scope),
        "self_vi_scope": r6(self_scope),
        "scope_share": r6(scope_answers / total_answers),
    }


def _condition(cells: Sequence[Mapping], gap: Gap, self_id: str, config: DetectionConfig) -> bool:
    """The v2 analogue of the GapDetector rule, evaluated on (resampled) cells."""
    n = sum(c["n"] for c in cells if self_id in c["e"])
    if not n:
        return False
    named = sum(c["e"][self_id][2] for c in cells if self_id in c["e"])
    presence = named / n
    if gap.gap_type == "presence":
        return presence <= config.presence_threshold
    if gap.gap_type == "prominence":
        if presence < config.prominence_coverage_threshold or not named:
            return False
        mean_weight = math.fsum(c["e"][self_id][0] for c in cells if self_id in c["e"]) / named
        slot = min(config.prominence_rank_threshold, len(SLOT_WEIGHTS))
        return mean_weight <= SLOT_WEIGHTS[slot - 1]
    if gap.gap_type == "competitive":
        cid = str(gap.detail.get("competitor_id", ""))
        wins = sum(c["h2h"].get(cid, [0, 0])[0] for c in cells)
        losses = sum(c["h2h"].get(cid, [0, 0])[1] for c in cells)
        return wins + losses > 0 and losses / (wins + losses) >= config.competitive_beat_threshold
    return False


def gap_probability(
    cells: Sequence[Mapping],
    gap: Gap,
    self_id: str,
    config: DetectionConfig | None = None,
    *,
    n_bootstrap: int = DEFAULT_N_BOOTSTRAP,
    base_seed: int = DEFAULT_BASE_SEED,
) -> float | None:
    """Share of bootstrap resamples (over the scope's questions) where the gap still holds.
    None for gap types the visibility cells don't measure (representation, source)."""
    if gap.gap_type not in SCORED_GAP_TYPES:
        return None
    config = config or DetectionConfig()
    scoped = [c for c in cells if in_scope(c, scope_of(gap))]
    by_q: dict[str, list[Mapping]] = defaultdict(list)
    for c in scoped:
        by_q[c["q"]].append(c)
    qkeys = sorted(by_q)
    if not qkeys:
        return None
    rng = rng_for(base_seed, gap.gap_id, "gap")
    holds = 0
    for _ in range(n_bootstrap):
        sample = [c for q in rng.choices(qkeys, k=len(qkeys)) for c in by_q[q]]
        holds += _condition(sample, gap, self_id, config)
    return r6(holds / n_bootstrap)


def calibrated_priors(
    outcomes: Iterable[Mapping], priors: Mapping[str, float] = UPTAKE_PRIOR, *, strength: float = 3.0
) -> dict[str, float]:
    """Update each action's uptake prior from measured outcomes in the impact ledger.

    Each outcome: {"action", "opportunity_vi", "measured_delta"}. The observed uptake of one
    outcome is measured_delta / opportunity_vi, clipped to [0, 1]; the prior is shrunk towards
    the mean observed uptake with `strength` pseudo-observations of the prior, so one noisy
    result can't swing it. Deterministic: same ledger, same priors.
    """
    observed: dict[str, list[float]] = defaultdict(list)
    for o in outcomes:
        opp = float(o.get("opportunity_vi") or 0.0)
        action = str(o.get("action") or "")
        if opp <= 0 or action not in priors or o.get("measured_delta") is None:
            continue
        observed[action].append(min(1.0, max(0.0, float(o["measured_delta"]) / opp)))
    out = dict(priors)
    for action, values in observed.items():
        out[action] = r6((strength * priors[action] + math.fsum(values)) / (strength + len(values)))
    return out
