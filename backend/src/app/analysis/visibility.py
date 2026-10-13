"""Visibility metrics v2 — pure functions over a run's scored (unprompted) answers.

No I/O, no LLM calls (CLAUDE.md). Replaces the v1 composite as the headline; v1 stays
computed for continuity. Definitions and the reasons for each choice: docs/METRICS_v2.md.

Per answer and tracked entity, a *weight* from where the answer puts it
(`list_parser.place`):

    listed at slot s   SLOT_WEIGHTS[min(s, 10)]   1/log2(1+s), frozen to 6 decimals
    unlisted           0.2                         named in an intro / description / tip
    prose              SLOT_WEIGHTS[order]         no list structure: order of first mention
    passing            × 0.25                      inside parentheses
    absent             0

**Visibility Index** VI(e) = 100 × mean weight over the answers. It is unconditional (an
absent answer counts as 0, so a few lucky mentions can't inflate it), monotone (being
named more often or higher never lowers it) and decomposes as
VI = 100 × presence × mean weight when present.

An entity named *in the question* ("alternatives to Ashok") is left out of that
question's answers for that entity: the assistant was told about it, it didn't pick it.

Everything is aggregated into *cells* — one per (question, provider, model) — holding
per-entity sums. Cells are stored with the snapshot, so comparisons between runs
(`matching.py`), trends and the impact ledger work from the light snapshot records and
never need the raw answers again. Uncertainty is a seeded cluster bootstrap over
questions (answers to the same question are correlated, DESIGN §6.1).
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, field

from app.analysis.list_parser import Placement, is_structured, parse_option_items, place
from app.analysis.mention_detector import find_spans
from app.analysis.stats import percentile, r6, rng_for
from app.analysis.types import EntityAlias

METRIC_VERSION = "v2.0"

# 1/log2(1+slot) for slots 1..10, rounded to 6 decimals and frozen as data so every
# platform computes identical weights (libm log2 may differ in the last bit).
SLOT_WEIGHTS: tuple[float, ...] = (
    1.0, 0.63093, 0.5, 0.430677, 0.386853, 0.356207, 0.333333, 0.315465, 0.30103, 0.289065,
)

_WS = re.compile(r"\s+")


@dataclass(frozen=True)
class MetricConfig:
    """Every knob of the v2 metrics. Stored (with its hash) in each snapshot, so a number can
    always be traced to the exact rules that produced it."""

    version: str = METRIC_VERSION
    slot_weights: tuple[float, ...] = SLOT_WEIGHTS
    unlisted_weight: float = 0.2
    passing_factor: float = 0.25
    reliable_share: float = 0.5  # a question is "reliably" reached when named in >= this share
    low_information_questions: int = 3  # fewer questions with a mention than this -> flagged
    n_bootstrap: int = 1000
    base_seed: int = 20261013

    def as_dict(self) -> dict:
        d = asdict(self)
        d["slot_weights"] = list(self.slot_weights)
        return d

    def config_hash(self) -> str:
        return hashlib.sha256(json.dumps(self.as_dict(), sort_keys=True).encode()).hexdigest()[:16]


def weight(placement: Placement, cfg: MetricConfig) -> float:
    if placement.mode == "unlisted" or placement.slot is None:
        base = cfg.unlisted_weight
    else:
        base = cfg.slot_weights[min(placement.slot, len(cfg.slot_weights)) - 1]
    return round(base * (cfg.passing_factor if placement.passing else 1.0), 6)


def question_key(text: str) -> str:
    """Stable id of a question across runs: case/whitespace/trailing-punctuation-insensitive."""
    norm = _WS.sub(" ", text.casefold()).strip().rstrip("?.! ")
    return hashlib.sha1(norm.encode()).hexdigest()[:12]


@dataclass(frozen=True)
class PlacedAnswer:
    observation_id: str
    question: str  # question_key
    query_text: str
    provider_id: str
    model_version: str
    intent_type: str
    structured: bool
    answered: bool  # named a tracked entity or gave a list (not a clarifying question / refusal)
    placements: dict[str, Placement] = field(default_factory=dict)
    weights: dict[str, float] = field(default_factory=dict)
    excluded: frozenset[str] = frozenset()  # entities named in the question itself


def place_answer(answer: Mapping, alias_table: tuple[EntityAlias, ...], cfg: MetricConfig) -> PlacedAnswer:
    """Place every tracked entity in one stored answer (a raw observation dict)."""
    text = str(answer.get("response_text") or "")
    query_text = str(answer.get("query_text") or "")
    items = parse_option_items(text)
    structured = is_structured(items)
    placements = place(text, find_spans(text, alias_table), items)
    excluded = frozenset(find_spans(query_text, alias_table))
    weights = {eid: weight(p, cfg) for eid, p in placements.items() if eid not in excluded}
    return PlacedAnswer(
        observation_id=str(answer.get("observation_id") or ""),
        question=question_key(query_text),
        query_text=query_text,
        provider_id=str(answer.get("provider_id") or ""),
        model_version=str(answer.get("model_version") or answer.get("provider_id") or ""),
        intent_type=str(answer.get("intent_type") or ""),
        structured=structured,
        answered=structured or bool(placements),
        placements={eid: p for eid, p in placements.items() if eid not in excluded},
        weights=weights,
        excluded=excluded,
    )


def _is_first(p: Placement | None) -> bool:
    return p is not None and p.mode != "unlisted" and p.slot == 1 and not p.passing


def build_cells(placed: Sequence[PlacedAnswer], self_id: str, competitor_ids: frozenset[str]) -> list[dict]:
    """Aggregate answers into (question, provider, model) cells, sorted by key.

    Cell: {"q", "provider", "model", "intent", "n", "answered", "excluded": [ids],
           "e": {id: [sum_w, sum_w2, n_named, n_first]}, "h2h": {competitor: [wins, losses]}}
    Head-to-head per answer: self wins when its weight is higher (an absent competitor
    counts as 0), loses when lower; ties (both absent, equal weight) are not counted.
    """
    entity_ids = [self_id, *sorted(competitor_ids)]
    groups: dict[tuple[str, str, str], list[PlacedAnswer]] = defaultdict(list)
    for a in sorted(placed, key=lambda a: a.observation_id):
        groups[(a.question, a.provider_id, a.model_version)].append(a)

    cells: list[dict] = []
    for (q, provider, model), answers in sorted(groups.items()):
        excluded = sorted(set().union(*(a.excluded for a in answers)) & set(entity_ids))
        e: dict[str, list[float]] = {}
        for eid in entity_ids:
            if eid in excluded:
                continue
            ws = [a.weights.get(eid, 0.0) for a in answers]
            e[eid] = [
                r6(math.fsum(ws)),
                r6(math.fsum(w * w for w in ws)),
                sum(1 for w in ws if w > 0),
                sum(1 for a in answers if _is_first(a.placements.get(eid))),
            ]
        h2h: dict[str, list[int]] = {}
        if self_id not in excluded:
            for cid in sorted(competitor_ids):
                if cid in excluded:
                    continue
                wins = losses = 0
                for a in answers:
                    sw, cw = a.weights.get(self_id, 0.0), a.weights.get(cid, 0.0)
                    wins += sw > cw
                    losses += cw > sw
                h2h[cid] = [wins, losses]
        cells.append({
            "q": q,
            "provider": provider,
            "model": model,
            "intent": answers[0].intent_type,
            "n": len(answers),
            "answered": sum(1 for a in answers if a.answered),
            "excluded": excluded,
            "e": e,
            "h2h": h2h,
        })
    return cells


def _vi(cells: Sequence[dict], eid: str) -> tuple[float, int]:
    """(VI 0-100, answers counted) for one entity over cells, skipping excluded cells."""
    total = n = 0.0
    for c in cells:
        stats = c["e"].get(eid)
        if stats is None:
            continue
        total += stats[0]
        n += c["n"]
    return (100 * total / n if n else 0.0), int(n)


def _rank(vis: dict[str, float], eid: str) -> int:
    """1-based position by VI; ties share the better position."""
    return 1 + sum(1 for other, v in vis.items() if other != eid and v > vis[eid] + 1e-12)


def _h2h_rate(cells: Sequence[dict], cid: str) -> tuple[int, int, float | None]:
    wins = sum(c["h2h"][cid][0] for c in cells if cid in c["h2h"])
    losses = sum(c["h2h"][cid][1] for c in cells if cid in c["h2h"])
    return wins, losses, (wins / (wins + losses) if wins + losses else None)


def _ci(values: list[float]) -> list[float] | None:
    if not values:
        return None
    values = sorted(values)
    return [r6(percentile(values, 2.5)), r6(percentile(values, 97.5))]


def _group_vi(cells: Sequence[dict], self_id: str, key: str) -> dict[str, dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for c in cells:
        groups[c[key]].append(c)
    out = {}
    for name, group in sorted(groups.items()):
        vi, n = _vi(group, self_id)
        named = sum(c["e"][self_id][2] for c in group if self_id in c["e"])
        out[name] = {
            "vi": r6(vi),
            "answers": n,
            "named": int(named),
            "answered": sum(c["answered"] for c in group),
            "questions": len({c["q"] for c in group}),
        }
    return out


def mde_design(cells: Sequence[dict], eid: str) -> float | None:
    """Optimistic MDE for a rerun with the same questions and models: only the answer-to-answer
    randomness inside each cell (ignores model drift between runs). VI points."""
    var_sum = 0.0
    n_total = 0
    for c in cells:
        stats = c["e"].get(eid)
        if stats is None:
            continue
        n = c["n"]
        n_total += n
        if n >= 2:
            s, s2 = stats[0], stats[1]
            var_c = max(0.0, (s2 - s * s / n) / (n - 1))
            var_sum += n * var_c
    if not n_total:
        return None
    se_diff = math.sqrt(2 * var_sum) / n_total
    return r6(100 * 2.801585 * se_diff)


def visibility_metrics(
    cells: Sequence[dict],
    questions: Mapping[str, Mapping],
    self_id: str,
    competitor_ids: frozenset[str],
    cfg: MetricConfig,
    seed_basis: str,
) -> dict:
    """All v2 run metrics from cells (see module docstring)."""
    entity_ids = [self_id, *sorted(competitor_ids)]
    by_q: dict[str, list[dict]] = defaultdict(list)
    for c in cells:
        by_q[c["q"]].append(c)
    qkeys = sorted(by_q)
    n_answers = sum(c["n"] for c in cells)

    entities: dict[str, dict] = {}
    point_vi: dict[str, float] = {}
    for eid in entity_ids:
        vi, n = _vi(cells, eid)
        point_vi[eid] = vi
        named = sum(c["e"][eid][2] for c in cells if eid in c["e"])
        first = sum(c["e"][eid][3] for c in cells if eid in c["e"])
        sum_w = math.fsum(c["e"][eid][0] for c in cells if eid in c["e"])
        entities[eid] = {
            "vi": r6(vi),
            "answers": n,
            "named": int(named),
            "first": int(first),
            "presence": r6(named / n if n else 0.0),
            "mean_weight_named": r6(sum_w / named) if named else None,
        }

    # Seeded cluster bootstrap over questions: every resample recomputes all entities, the
    # share of recommendations, self's position and the head-to-head rates.
    rng = rng_for(cfg.base_seed, seed_basis, "run")
    boot_vi: dict[str, list[float]] = {eid: [] for eid in entity_ids}
    boot_sor: list[float] = []
    boot_rank: list[int] = []
    boot_h2h: dict[str, list[float]] = {cid: [] for cid in sorted(competitor_ids)}
    if qkeys:
        for _ in range(cfg.n_bootstrap):
            sample = [c for q in rng.choices(qkeys, k=len(qkeys)) for c in by_q[q]]
            vis = {eid: _vi(sample, eid)[0] for eid in entity_ids}
            for eid, v in vis.items():
                boot_vi[eid].append(v)
            total = math.fsum(vis.values())
            if total > 0:
                boot_sor.append(vis[self_id] / total)
            boot_rank.append(_rank(vis, self_id))
            for cid, rates in boot_h2h.items():
                rate = _h2h_rate(sample, cid)[2]
                if rate is not None:
                    rates.append(rate)
    for eid in entity_ids:
        entities[eid]["ci"] = _ci(boot_vi[eid])

    self_q_named = {q for q in qkeys if any(c["e"].get(self_id, [0, 0, 0])[2] for c in by_q[q])}
    low_information = len(self_q_named) < cfg.low_information_questions
    if not self_q_named and qkeys:
        # Never named: the bootstrap collapses to [0, 0]. Rule of three: with zero hits in Q
        # questions, the 95% upper bound on the share of questions that would name it is 3/Q.
        entities[self_id]["ci"] = [0.0, r6(min(100.0, 300.0 / len(qkeys)))]

    total_vi = math.fsum(point_vi.values())
    sor = {"value": r6(point_vi[self_id] / total_vi), "ci": _ci(boot_sor)} if total_vi > 0 else None

    rank = _rank(point_vi, self_id)
    ranks = sorted(boot_rank)
    position = {
        "rank": rank,
        "of": len(entity_ids),
        "rank_low": round(percentile(ranks, 2.5)) if ranks else rank,
        "rank_high": round(percentile(ranks, 97.5)) if ranks else rank,
        "agreement": r6(sum(1 for r in boot_rank if r == rank) / len(boot_rank)) if boot_rank else None,
    }

    head_to_head = {}
    for cid in sorted(competitor_ids):
        wins, losses, rate = _h2h_rate(cells, cid)
        head_to_head[cid] = {"wins": wins, "losses": losses, "win_rate": r6(rate), "ci": _ci(boot_h2h[cid])}

    per_question = {}
    for q in qkeys:
        group = by_q[q]
        vi, n = _vi(group, self_id)
        best_other = max((_vi(group, cid)[0] for cid in competitor_ids), default=0.0)
        per_question[q] = {
            "text": str((questions.get(q) or {}).get("text", "")),
            "intent": str((questions.get(q) or {}).get("intent", group[0]["intent"])),
            "answers": n,
            "named": int(sum(c["e"][self_id][2] for c in group if self_id in c["e"])),
            "vi": r6(vi),
            "best_competitor_vi": r6(best_other),
        }
    reliable = sum(
        1 for q in qkeys if per_question[q]["answers"]
        and per_question[q]["named"] / per_question[q]["answers"] >= cfg.reliable_share
    )

    answered = sum(c["answered"] for c in cells)
    return {
        "metric_version": cfg.version,
        "metric_config_hash": cfg.config_hash(),
        "seed_basis": seed_basis,
        "answers": n_answers,
        "questions": len(qkeys),
        "answer_rate": r6(answered / n_answers if n_answers else 0.0),
        "self_id": self_id,
        "entities": entities,
        "low_information": low_information,
        "market_position": position,
        "share_of_recommendations": sor,
        "head_to_head": head_to_head,
        "question_reach": {"named": len(self_q_named), "reliable": reliable, "of": len(qkeys)},
        "per_question": per_question,
        "per_provider": _group_vi(cells, self_id, "provider"),
        "per_intent": _group_vi(cells, self_id, "intent"),
        "mde_design": mde_design(cells, self_id),
    }


def parse_stats(placed: Sequence[PlacedAnswer]) -> dict[str, dict]:
    """Per provider: how answers were structured and how mentions were placed — the parser's
    behaviour is format-dependent, so it is reported, not hidden."""
    out: dict[str, dict] = {}
    for a in placed:
        s = out.setdefault(a.provider_id, {
            "answers": 0, "structured": 0, "answered": 0, "listed": 0, "unlisted": 0, "prose": 0, "passing": 0,
        })
        s["answers"] += 1
        s["structured"] += a.structured
        s["answered"] += a.answered
        for p in a.placements.values():
            s[p.mode] += 1
            s["passing"] += p.passing
    return dict(sorted(out.items()))


def compute_visibility(
    answers: Sequence[Mapping],
    alias_table: tuple[EntityAlias, ...],
    self_id: str,
    competitor_ids: frozenset[str],
    *,
    cfg: MetricConfig | None = None,
    seed_basis: str = "",
) -> dict:
    """The full `metrics_v2` block for one run's scored answers: metrics, cells, question
    texts, parse statistics and the config that produced them."""
    cfg = cfg or MetricConfig()
    placed = [place_answer(a, alias_table, cfg) for a in answers]
    cells = build_cells(placed, self_id, competitor_ids)
    questions: dict[str, dict] = {}
    for a in sorted(placed, key=lambda a: a.observation_id):
        questions.setdefault(a.question, {"text": a.query_text, "intent": a.intent_type})
    metrics = visibility_metrics(cells, questions, self_id, competitor_ids, cfg, seed_basis)
    metrics["metric_config"] = cfg.as_dict()
    metrics["parse_stats"] = parse_stats(placed)
    metrics["cells"] = cells
    return metrics
