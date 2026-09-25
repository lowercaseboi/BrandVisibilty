"""Per-entity mention counts for a snapshot (CONTRACT §5 `mention_summary`).

Pure: no I/O, no LLM calls (CLAUDE.md). The caller passes only scored (unprompted)
observations (PRD §10.1) and the brand's tracked entity ids ("self" + competitors);
entities outside that list (e.g. "discovered") are ignored.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any


def _mentioned(observation: Any) -> tuple[set[str], set[str]]:
    """(entity ids mentioned, entity ids ranked 1) in one observation. Accepts an
    `Observation` (mentions are `EntityMention`s) or a raw-observation dict (mention dicts)."""
    mentions = observation.get("mentions") if isinstance(observation, Mapping) else observation.mentions
    mentioned: set[str] = set()
    first: set[str] = set()
    for m in mentions or ():
        entity_id = m.get("entity_id") if isinstance(m, Mapping) else m.entity_id
        rank = m.get("rank") if isinstance(m, Mapping) else m.rank
        if entity_id is None:
            continue
        mentioned.add(entity_id)
        if rank == 1:
            first.add(entity_id)
    return mentioned, first


def mention_summary(observations: Iterable[Any], entity_ids: Iterable[str]) -> dict[str, Any]:
    """{"total_answers": n, "entities": {entity_id: {"answers_mentioning", "answers_ranked_first"}}}.

    Every id in `entity_ids` is present, with zeros when never mentioned. An answer counts
    once per entity however often it names it; "ranked first" means rank 1 (named before
    every other tracked entity)."""
    entities = {eid: {"answers_mentioning": 0, "answers_ranked_first": 0} for eid in entity_ids}
    total = 0
    for observation in observations:
        total += 1
        mentioned, first = _mentioned(observation)
        for entity_id in mentioned & entities.keys():
            entities[entity_id]["answers_mentioning"] += 1
            if entity_id in first:
                entities[entity_id]["answers_ranked_first"] += 1
    return {"total_answers": total, "entities": entities}
