"""MentionDetector — deterministic alias-table matching over response text (DESIGN_v1 §1.6).

"Alias-table lookup with casefolding, punctuation stripping, and possessive/plural
handling, matched on word boundaries. Records character offsets so every mention has
an evidence span." Not an LLM classifier — reproducible and independently testable,
per PRD §11.2. No I/O, same purity requirement as Scorer and GapDetector.

Entity *ordering* for Prominence needs no LLM call: the offsets this module records are
exactly what Scorer's `rank` field consumes (§1.6). Discovery of entities *not* already
in the alias table is a separate, LLM-based, sampled step (`EntityExtractor`) — out of
scope here; MentionDetector only detects mentions of entities it's told to look for.
"""

from __future__ import annotations

import re

from app.analysis.types import EntityAlias, EntityMention

_POSSESSIVE_OR_PLURAL_SUFFIX = r"(?:'s|s)?"


def _alias_pattern(alias: str) -> re.Pattern[str]:
    return re.compile(
        r"\b" + re.escape(alias) + _POSSESSIVE_OR_PLURAL_SUFFIX + r"\b",
        re.IGNORECASE,
    )


def _is_passing_mention(text: str, start: int, end: int) -> bool:
    """A mention is "passing" when it sits inside an enclosing, unmatched `(...)` pair —
    e.g. "several brands (including Acme) offer this." DESIGN §4.2 names this band but
    doesn't specify a detection rule; this is a documented starting heuristic, the same
    kind of assumption GapDetector's representation_disagreement_threshold flags.
    """
    before, after = text[:start], text[end:]

    last_open = before.rfind("(")
    if last_open == -1:
        return False
    last_close_before_open = before.rfind(")")
    if last_close_before_open > last_open:
        return False  # the nearest '(' before us was already closed — not enclosing

    first_close = after.find(")")
    if first_close == -1:
        return False
    first_open_after = after.find("(")
    if first_open_after != -1 and first_open_after < first_close:
        return False  # a nested '(' opens before this one closes — not our enclosing pair

    return True


def detect_mentions(text: str, alias_table: tuple[EntityAlias, ...]) -> tuple[EntityMention, ...]:
    """Find every tracked entity's earliest mention in `text`, ranked by first-mention
    position. One `EntityMention` per entity — matching what Scorer/GapDetector already
    assume via `Observation.mention_of` — even if an entity has multiple aliases or
    multiple occurrences.
    """
    earliest: dict[str, tuple[int, int]] = {}
    kind_of: dict[str, str] = {}

    for entry in alias_table:
        for alias in entry.aliases:
            if not alias:
                continue
            for match in _alias_pattern(alias).finditer(text):
                start, end = match.start(), match.end()
                current = earliest.get(entry.entity_id)
                if current is None or start < current[0]:
                    earliest[entry.entity_id] = (start, end)
                    kind_of[entry.entity_id] = entry.entity_kind

    ordered = sorted(earliest.items(), key=lambda item: item[1][0])

    return tuple(
        EntityMention(
            entity_id=entity_id,
            entity_kind=kind_of[entity_id],
            rank=rank,
            is_passing_mention=_is_passing_mention(text, start, end),
            char_start=start,
            char_end=end,
        )
        for rank, (entity_id, (start, end)) in enumerate(ordered, start=1)
    )
