"""Scorer — a pure function over unprompted-subset observations.

No I/O, no LLM calls (CLAUDE.md constraint; DESIGN_v1 §1.6). Computes Coverage,
conditional Prominence, per-response Share of Voice, and the locked composite
(DESIGN §4.4, §10.6 in PRD_v3), each with a cluster-bootstrap confidence
interval (DESIGN §6.2) that resamples queries — not individual calls — to
respect the correlation between samples of the same query (§6.1).
"""

from __future__ import annotations

import random
import statistics
from collections import defaultdict

from app.analysis.types import (
    AnalysisResult,
    Observation,
    ProviderBreakdown,
)

COVERAGE_WEIGHT = 0.4
PROMINENCE_WEIGHT = 0.3
SOV_WEIGHT = 0.3

_BOOTSTRAP_ITERATIONS = 1000
_CI_LOW_PERCENTILE = 2.5
_CI_HIGH_PERCENTILE = 97.5


def _prominence_band(mention, total_distinct: int) -> float:
    """Bands from DESIGN §4.2."""
    if mention.is_passing_mention:
        return 0.1
    if mention.rank == 1:
        return 1.0 if total_distinct == 1 else 0.9
    if mention.rank in (2, 3):
        return 0.6
    return 0.3  # rank 4+ / buried in list body


def _score_components(
    observations: list[Observation],
    self_entity_id: str,
    competitor_entity_ids: frozenset[str],
) -> tuple[float, float | None, float | None, int, int]:
    """Coverage, Prominence, SoV over one observation set. No CI here — that's the bootstrap's job."""
    total = len(observations)
    if total == 0:
        return 0.0, None, None, 0, 0

    mentioned = [obs for obs in observations if obs.mention_of(self_entity_id) is not None]
    coverage = len(mentioned) / total

    if mentioned:
        bands = []
        for obs in mentioned:
            m = obs.mention_of(self_entity_id)
            total_distinct = len({mn.entity_id for mn in obs.mentions})
            bands.append(_prominence_band(m, total_distinct))
        prominence = statistics.mean(bands)
    else:
        prominence = None

    contested_entities = competitor_entity_ids | {self_entity_id}
    contested = [obs for obs in observations if obs.mentions_any(frozenset(contested_entities))]
    if contested:
        share_of_voice = len(mentioned) / len(contested)
    else:
        share_of_voice = None

    return coverage, prominence, share_of_voice, total, len(mentioned)


def _composite(coverage: float, prominence: float | None, share_of_voice: float | None) -> float:
    """Weighted composite, renormalized over whichever components are defined (§4.2, §10.6)."""
    components = [(coverage, COVERAGE_WEIGHT)]
    if prominence is not None:
        components.append((prominence, PROMINENCE_WEIGHT))
    if share_of_voice is not None:
        components.append((share_of_voice, SOV_WEIGHT))

    weight_total = sum(w for _, w in components)
    normalized = sum(value * (w / weight_total) for value, w in components)
    return normalized * 100


def _per_provider_breakdown(
    observations: list[Observation], self_entity_id: str
) -> tuple[ProviderBreakdown, ...]:
    by_provider: dict[str, list[Observation]] = defaultdict(list)
    for obs in observations:
        by_provider[obs.provider_id].append(obs)

    breakdown = []
    for provider_id, obs_list in sorted(by_provider.items()):
        mentioned_count = sum(1 for obs in obs_list if obs.mention_of(self_entity_id) is not None)
        breakdown.append(
            ProviderBreakdown(
                provider_id=provider_id,
                coverage=mentioned_count / len(obs_list),
                observation_count=len(obs_list),
                mentioned_count=mentioned_count,
            )
        )
    return tuple(breakdown)


def score(
    observations: list[Observation],
    self_entity_id: str,
    competitor_entity_ids: frozenset[str],
    *,
    n_bootstrap: int = _BOOTSTRAP_ITERATIONS,
    rng: random.Random | None = None,
) -> AnalysisResult:
    """Compute the v1 AnalysisResult for one job's unprompted-subset observations.

    `observations` must already be filtered to the unprompted subset (PRD §10.1) —
    Scorer has no way to distinguish prompted from unprompted on its own by design,
    since that distinction belongs to the query, not to anything Scorer sees.
    """
    coverage, prominence, share_of_voice, total, mentioned_count = _score_components(
        observations, self_entity_id, competitor_entity_ids
    )
    composite = _composite(coverage, prominence, share_of_voice)

    by_query: dict[str, list[Observation]] = defaultdict(list)
    for obs in observations:
        by_query[obs.query_id].append(obs)
    query_ids = list(by_query.keys())

    if query_ids:
        rng = rng or random.Random()
        bootstrap_composites = []
        for _ in range(n_bootstrap):
            resampled_query_ids = rng.choices(query_ids, k=len(query_ids))
            resampled_obs = [obs for qid in resampled_query_ids for obs in by_query[qid]]
            r_coverage, r_prominence, r_sov, _, _ = _score_components(
                resampled_obs, self_entity_id, competitor_entity_ids
            )
            bootstrap_composites.append(_composite(r_coverage, r_prominence, r_sov))
        bootstrap_composites.sort()
        ci_low = _percentile(bootstrap_composites, _CI_LOW_PERCENTILE)
        ci_high = _percentile(bootstrap_composites, _CI_HIGH_PERCENTILE)
    else:
        ci_low = ci_high = composite

    return AnalysisResult(
        coverage=coverage,
        prominence=prominence,
        share_of_voice=share_of_voice,
        composite_score=composite,
        ci_low=ci_low,
        ci_high=ci_high,
        per_provider_coverage=_per_provider_breakdown(observations, self_entity_id),
        observation_count=total,
        mentioned_count=mentioned_count,
        participating_providers=tuple(sorted({obs.provider_id for obs in observations})),
    )


def _percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (pct / 100) * (len(sorted_values) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(sorted_values) - 1)
    frac = rank - lower
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * frac
