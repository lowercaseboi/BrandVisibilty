"""L3 normalization seam: `StoredResponse` records -> `Observation` / `PromptedObservation`
(DESIGN_v1 §1.2 layer boundary).

Previously inlined directly in `scripts/run_tracking_loop.py`; pulled out so Scorer's
input construction is a pure, unit-testable function rather than something only exercised
by running the CLI script end to end.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.analysis.mention_detector import detect_mentions
from app.analysis.types import EntityAlias, Observation, PromptedObservation
from app.collection.store import StoredResponse


def to_observations(
    records: Iterable[StoredResponse],
    alias_table: tuple[EntityAlias, ...],
    *,
    unprompted_only: bool = True,
) -> tuple[Observation, ...]:
    """Build Scorer/GapDetector's `Observation` input from stored responses.

    Only `status == "ok"` records with actual `response_text` are usable — failed samples
    (whether never collected or errored) contribute no observation and are instead
    reflected in the run's `CollectionReport` completeness figures, not silently dropped.
    """
    observations = []
    for record in records:
        if record.status != "ok" or not record.response_text:
            continue
        if unprompted_only and record.is_brand_named:
            continue
        mentions = detect_mentions(record.response_text, alias_table)
        observations.append(
            Observation(
                observation_id=f"{record.query_id}-s{record.sample_index}",
                query_id=record.query_id,
                provider_id=record.provider_id,
                mentions=mentions,
                intent_type=record.intent_type,
            )
        )
    return tuple(observations)


def to_prompted_observations(
    records: Iterable[StoredResponse],
    *,
    claimed_attribute_vocabulary: tuple[str, ...] = (),
) -> tuple[PromptedObservation, ...]:
    """Build GapDetector's REPRESENTATION-gap input from the prompted (brand-named)
    subset. `claimed_attributes` uses the same deterministic alias-table approach as
    mention detection (DESIGN §5.2) rather than an LLM judgment — a simple case-insensitive
    substring check against a fixed vocabulary, since PRD §11.2 requires gap detection to
    stay deterministic.
    """
    observations = []
    for record in records:
        if record.status != "ok" or not record.response_text or not record.is_brand_named:
            continue
        text_lower = record.response_text.lower()
        claimed = frozenset(
            attribute for attribute in claimed_attribute_vocabulary if attribute.lower() in text_lower
        )
        observations.append(
            PromptedObservation(
                observation_id=f"{record.query_id}-s{record.sample_index}",
                query_id=record.query_id,
                provider_id=record.provider_id,
                intent_type=record.intent_type,
                claimed_attributes=claimed,
            )
        )
    return tuple(observations)
