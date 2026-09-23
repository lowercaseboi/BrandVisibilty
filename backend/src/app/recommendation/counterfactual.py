"""Counterfactual score-impact prioritization (DESIGN_v1 §5.4).

Simulates a gap's hypothetical closure over a COPY of the real observation set, re-runs
the existing pure `Scorer` on both the real and the simulated set, and diffs
`composite_score`. Never mutates the input observations (all dataclasses here are frozen;
copies are built with `dataclasses.replace`) and never calls an LLM — this module stays
just as pure as `Scorer`/`GapDetector` itself.

`representation` and `source` gaps act on `PromptedObservation`/`SourceLandscapeEntry`,
not `Observation`, so they have no direct Scorer-level closure to simulate; those get
`delta_composite = 0.0` with `confidence` still computed from evidence volume alone.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, replace

from app.analysis.scorer import score
from app.analysis.types import AnalysisResult, EntityMention, Gap, Observation

_ASSUMED_COVERAGE_GAIN = 0.5


@dataclass(frozen=True)
class CounterfactualResult:
    delta_composite: float
    confidence: float
    closure_field: str
    closure_before: float
    closure_after: float


def _scoped_ids(observations: list[Observation], gap: Gap) -> frozenset[str]:
    scope = gap.detail.get("scope", "overall")
    if scope == "provider":
        provider_id = gap.detail["provider_id"]
        return frozenset(obs.observation_id for obs in observations if obs.provider_id == provider_id)
    if scope == "intent":
        intent_type = gap.detail["intent_type"]
        return frozenset(obs.observation_id for obs in observations if obs.intent_type == intent_type)
    return frozenset(obs.observation_id for obs in observations)


def _close_presence_gap(
    observations: list[Observation], self_entity_id: str, gap: Gap
) -> tuple[list[Observation], str, float, float]:
    scoped_ids = _scoped_ids(observations, gap)
    scoped = [obs for obs in observations if obs.observation_id in scoped_ids]
    before = gap.detail.get("coverage", 0.0)
    if not scoped:
        return list(observations), "coverage", before, before

    target = min(1.0, before + _ASSUMED_COVERAGE_GAIN)
    currently_mentioning = sum(1 for obs in scoped if obs.mention_of(self_entity_id) is not None)
    target_mentioning = round(target * len(scoped))
    to_flip = max(0, target_mentioning - currently_mentioning)

    flip_ids: set[str] = set()
    for obs in scoped:
        if to_flip <= 0:
            break
        if obs.mention_of(self_entity_id) is None:
            flip_ids.add(obs.observation_id)
            to_flip -= 1

    modified = []
    for obs in observations:
        if obs.observation_id in flip_ids:
            new_mention = EntityMention(entity_id=self_entity_id, entity_kind="self", rank=1)
            modified.append(replace(obs, mentions=obs.mentions + (new_mention,)))
        else:
            modified.append(obs)

    after = (currently_mentioning + len(flip_ids)) / len(scoped)
    return modified, "coverage", before, after


def _close_prominence_gap(
    observations: list[Observation], self_entity_id: str, gap: Gap
) -> tuple[list[Observation], str, float, float]:
    before = gap.detail.get("mean_rank", 0.0)
    modified = []
    changed = False
    for obs in observations:
        mention = obs.mention_of(self_entity_id)
        if mention is not None and mention.rank > 1:
            new_mention = replace(mention, rank=1)
            new_mentions = tuple(
                new_mention if m.entity_id == self_entity_id else m for m in obs.mentions
            )
            modified.append(replace(obs, mentions=new_mentions))
            changed = True
        else:
            modified.append(obs)
    after = 1.0 if changed else before
    return modified, "mean_rank", before, after


def _close_competitive_gap(
    observations: list[Observation], self_entity_id: str, gap: Gap
) -> tuple[list[Observation], str, float, float]:
    competitor_id = gap.detail["competitor_id"]
    before = gap.detail.get("beat_rate", 0.0)
    modified = []
    flipped = False
    for obs in observations:
        self_mention = obs.mention_of(self_entity_id)
        competitor_mention = obs.mention_of(competitor_id)
        if (
            self_mention is not None
            and competitor_mention is not None
            and competitor_mention.rank < self_mention.rank
        ):
            new_self = replace(self_mention, rank=competitor_mention.rank)
            new_competitor = replace(competitor_mention, rank=self_mention.rank)
            new_mentions = tuple(
                new_self
                if m.entity_id == self_entity_id
                else (new_competitor if m.entity_id == competitor_id else m)
                for m in obs.mentions
            )
            modified.append(replace(obs, mentions=new_mentions))
            flipped = True
        else:
            modified.append(obs)
    after = 0.0 if flipped else before
    return modified, "beat_rate", before, after


_CLOSERS = {
    "presence": _close_presence_gap,
    "prominence": _close_prominence_gap,
    "competitive": _close_competitive_gap,
}


def _confidence(gap: Gap, baseline: AnalysisResult) -> float:
    volume_term = min(1.0, len(gap.evidence_refs) / 10)

    coverages = [pb.coverage for pb in baseline.per_provider_coverage]
    if len(coverages) < 2:
        agreement_term = 1.0
    else:
        mean_coverage = statistics.mean(coverages)
        if mean_coverage == 0:
            agreement_term = 1.0
        else:
            spread = statistics.pstdev(coverages) / mean_coverage
            agreement_term = max(0.0, min(1.0, 1 - spread))

    return (volume_term + agreement_term) / 2


def simulate_closure(
    gap: Gap,
    observations: list[Observation],
    self_entity_id: str,
    competitor_entity_ids: frozenset[str],
) -> CounterfactualResult:
    baseline = score(observations, self_entity_id, competitor_entity_ids)

    closer = _CLOSERS.get(gap.gap_type)
    if closer is None:
        confidence = _confidence(gap, baseline)
        return CounterfactualResult(0.0, confidence, "n/a", 0.0, 0.0)

    modified, closure_field, before, after = closer(observations, self_entity_id, gap)
    modified_result = score(modified, self_entity_id, competitor_entity_ids)
    delta = modified_result.composite_score - baseline.composite_score
    confidence = _confidence(gap, baseline)
    return CounterfactualResult(delta, confidence, closure_field, before, after)
