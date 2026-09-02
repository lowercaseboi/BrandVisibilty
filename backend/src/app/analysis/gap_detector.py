"""GapDetector — deterministic rules over aggregated observation data (DESIGN_v1 §5.1-5.2).

Gap detection is a set of pure functions, same purity requirement as Scorer
(CLAUDE.md, DESIGN §1.6): no I/O, no LLM calls. An LLM never introduces a
gap — it only drafts the recommendation prose for a gap this module already
found (§5.1). Each rule below produces zero or more typed `Gap` records with
`evidence_refs` resolving to real observation/source IDs.
"""

from __future__ import annotations

import statistics
from collections import defaultdict

from app.analysis.types import (
    DetectionConfig,
    Gap,
    Observation,
    PromptedObservation,
    SourceLandscapeEntry,
)


def _coverage(observations: list[Observation], self_entity_id: str) -> float:
    if not observations:
        return 0.0
    mentioned = sum(1 for obs in observations if obs.mention_of(self_entity_id) is not None)
    return mentioned / len(observations)


def _presence_gaps(
    observations: list[Observation], self_entity_id: str, config: DetectionConfig
) -> list[Gap]:
    """PRESENCE — Coverage <= theta_presence, overall, per provider, or per intent cluster."""
    gaps: list[Gap] = []

    overall_coverage = _coverage(observations, self_entity_id)
    if overall_coverage <= config.presence_threshold:
        gaps.append(
            Gap(
                gap_type="presence",
                evidence_refs=tuple(obs.observation_id for obs in observations),
                detail={"scope": "overall", "coverage": overall_coverage},
            )
        )

    by_provider: dict[str, list[Observation]] = defaultdict(list)
    for obs in observations:
        by_provider[obs.provider_id].append(obs)
    for provider_id, obs_list in sorted(by_provider.items()):
        coverage = _coverage(obs_list, self_entity_id)
        if coverage <= config.presence_threshold:
            gaps.append(
                Gap(
                    gap_type="presence",
                    evidence_refs=tuple(obs.observation_id for obs in obs_list),
                    detail={"scope": "provider", "provider_id": provider_id, "coverage": coverage},
                )
            )

    by_intent: dict[str, list[Observation]] = defaultdict(list)
    for obs in observations:
        if obs.intent_type:
            by_intent[obs.intent_type].append(obs)
    for intent_type, obs_list in sorted(by_intent.items()):
        coverage = _coverage(obs_list, self_entity_id)
        if coverage <= config.presence_threshold:
            gaps.append(
                Gap(
                    gap_type="presence",
                    evidence_refs=tuple(obs.observation_id for obs in obs_list),
                    detail={"scope": "intent", "intent_type": intent_type, "coverage": coverage},
                )
            )

    return gaps


def _prominence_gap(
    observations: list[Observation], self_entity_id: str, config: DetectionConfig
) -> Gap | None:
    """PROMINENCE — coverage adequate but mean rank is poor."""
    coverage = _coverage(observations, self_entity_id)
    if coverage < config.prominence_coverage_threshold:
        return None

    mentioned = [obs for obs in observations if obs.mention_of(self_entity_id) is not None]
    if not mentioned:
        return None

    ranks = [obs.mention_of(self_entity_id).rank for obs in mentioned]
    mean_rank = statistics.mean(ranks)
    if mean_rank < config.prominence_rank_threshold:
        return None

    return Gap(
        gap_type="prominence",
        evidence_refs=tuple(obs.observation_id for obs in mentioned),
        detail={"coverage": coverage, "mean_rank": mean_rank},
    )


def _competitive_gaps(
    observations: list[Observation],
    self_entity_id: str,
    competitor_entity_ids: frozenset[str],
    config: DetectionConfig,
) -> list[Gap]:
    """COMPETITIVE — a competitor co-occurs frequently and out-ranks the brand within those co-occurrences."""
    gaps: list[Gap] = []
    total = len(observations)
    if total == 0:
        return gaps

    for competitor_id in sorted(competitor_entity_ids):
        co_occurring = [
            obs
            for obs in observations
            if obs.mention_of(self_entity_id) is not None and obs.mention_of(competitor_id) is not None
        ]
        co_occurrence_rate = len(co_occurring) / total
        if co_occurrence_rate < config.competitive_co_occurrence_threshold or not co_occurring:
            continue

        beats = [
            obs
            for obs in co_occurring
            if obs.mention_of(competitor_id).rank < obs.mention_of(self_entity_id).rank
        ]
        beat_rate = len(beats) / len(co_occurring)
        if beat_rate < config.competitive_beat_threshold:
            continue

        gaps.append(
            Gap(
                gap_type="competitive",
                evidence_refs=tuple(obs.observation_id for obs in co_occurring),
                detail={
                    "competitor_id": competitor_id,
                    "co_occurrence_rate": co_occurrence_rate,
                    "beat_rate": beat_rate,
                },
            )
        )

    return gaps


def _source_gap(landscape: list[SourceLandscapeEntry]) -> Gap | None:
    """SOURCE — dominant category sources that don't mention the brand."""
    non_mentioning = [entry for entry in landscape if not entry.mentions_brand]
    if not non_mentioning:
        return None

    return Gap(
        gap_type="source",
        evidence_refs=tuple(entry.source_id for entry in non_mentioning),
        detail={"dominant_source_count": len(landscape), "non_mentioning_count": len(non_mentioning)},
    )


def _representation_gap(
    prompted_observations: list[PromptedObservation],
    expected_attributes: frozenset[str],
    config: DetectionConfig,
) -> Gap | None:
    """REPRESENTATION — prompted responses disagree with the brand's actual profile, or with each other."""
    if not prompted_observations:
        return None

    disagree_with_profile = [
        obs
        for obs in prompted_observations
        if obs.claimed_attributes and expected_attributes and not (obs.claimed_attributes & expected_attributes)
    ]
    disagreement_rate = len(disagree_with_profile) / len(prompted_observations)

    distinct_claim_sets = {obs.claimed_attributes for obs in prompted_observations if obs.claimed_attributes}
    disagree_with_each_other = len(distinct_claim_sets) > 1

    if disagreement_rate < config.representation_disagreement_threshold and not disagree_with_each_other:
        return None

    evidence = disagree_with_profile if disagree_with_profile else prompted_observations
    return Gap(
        gap_type="representation",
        evidence_refs=tuple(obs.observation_id for obs in evidence),
        detail={
            "disagreement_rate": disagreement_rate,
            "disagree_with_each_other": disagree_with_each_other,
            "distinct_claim_sets": [sorted(s) for s in distinct_claim_sets],
        },
    )


def detect_gaps(
    observations: list[Observation],
    self_entity_id: str,
    competitor_entity_ids: frozenset[str],
    config: DetectionConfig | None = None,
    *,
    prompted_observations: list[PromptedObservation] | None = None,
    expected_attributes: frozenset[str] = frozenset(),
    category_source_landscape: list[SourceLandscapeEntry] | None = None,
) -> list[Gap]:
    """Run all five gap-type rules (DESIGN §5.2) and return every gap found.

    `observations` is the same unprompted-subset list passed to Scorer.
    `prompted_observations` and `category_source_landscape` are optional because
    the collection/normalization layers producing them don't exist yet — omitting
    them simply skips REPRESENTATION / SOURCE detection rather than failing.
    """
    config = config or DetectionConfig()
    gaps: list[Gap] = []

    gaps.extend(_presence_gaps(observations, self_entity_id, config))

    prominence_gap = _prominence_gap(observations, self_entity_id, config)
    if prominence_gap is not None:
        gaps.append(prominence_gap)

    gaps.extend(_competitive_gaps(observations, self_entity_id, competitor_entity_ids, config))

    if prompted_observations is not None:
        representation_gap = _representation_gap(prompted_observations, expected_attributes, config)
        if representation_gap is not None:
            gaps.append(representation_gap)

    if category_source_landscape is not None:
        source_gap = _source_gap(category_source_landscape)
        if source_gap is not None:
            gaps.append(source_gap)

    return gaps
