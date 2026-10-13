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
from functools import lru_cache

from app.analysis.types import EntityAlias, EntityMention

_POSSESSIVE_OR_PLURAL_SUFFIX = r"(?:'s|s)?"


@lru_cache(maxsize=None)
def _alias_pattern(alias: str) -> re.Pattern[str]:
    # Lookaround boundaries, not \b: \b requires a word/non-word transition, which never
    # matches when the alias itself starts or ends in a non-word character (e.g. "Yahoo!")
    # — (?<!\w)/(?!\w) only require the adjacent character not be a word character, which
    # is what "word boundary" actually needs to mean here. Cached per alias since the same
    # fixed alias table is matched against every observation in a job.
    return re.compile(
        r"(?<!\w)" + re.escape(alias) + _POSSESSIVE_OR_PLURAL_SUFFIX + r"(?!\w)",
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


def is_passing_mention(text: str, start: int, end: int) -> bool:
    """Public name for the parenthetical-mention rule (used by the v2 list placement)."""
    return _is_passing_mention(text, start, end)


def _matches(text: str, alias_table: tuple[EntityAlias, ...]) -> list[tuple[int, int, str, str]]:
    """Every non-shadowed alias match as (start, end, entity_id, entity_kind), in alias-table
    order so ties stay deterministic.

    Overlapping aliases of different entities follow the longest-match rule: a match whose
    span lies inside a strictly longer match of a *different* entity is dropped, so a brand
    aliased "Nova" is not credited for "Nova Cafe" when "Nova Cafe" is a tracked competitor.
    """
    matches: list[tuple[int, int, str, str]] = []
    for entry in alias_table:
        for alias in entry.aliases:
            if not alias:
                continue
            for match in _alias_pattern(alias).finditer(text):
                matches.append((match.start(), match.end(), entry.entity_id, entry.entity_kind))

    def _shadowed(m: tuple[int, int, str, str]) -> bool:
        start, end, entity_id, _ = m
        return any(
            o_id != entity_id and o_start <= start and end <= o_end and (o_end - o_start) > (end - start)
            for o_start, o_end, o_id, _ in matches
        )

    return [m for m in matches if not _shadowed(m)]


def find_spans(text: str, alias_table: tuple[EntityAlias, ...]) -> dict[str, list[tuple[int, int]]]:
    """Every occurrence of every tracked entity: {entity_id: [(start, end), ...]} sorted by
    start, same matching and longest-match rule as `detect_mentions`. The v2 list placement
    needs all occurrences, not only the earliest, to find an entity's best list slot."""
    # Aliases of one entity can match at the same start ("Gajanan Vada Pav" / "Gajanan"):
    # keep the longest, so each occurrence is one span.
    longest: dict[str, dict[int, int]] = {}
    for start, end, entity_id, _ in _matches(text, alias_table):
        ends = longest.setdefault(entity_id, {})
        ends[start] = max(end, ends.get(start, end))
    return {eid: sorted(ends.items()) for eid, ends in longest.items()}


def detect_mentions(text: str, alias_table: tuple[EntityAlias, ...]) -> tuple[EntityMention, ...]:
    """Find every tracked entity's earliest mention in `text`, ranked by first-mention
    position. One `EntityMention` per entity — matching what Scorer/GapDetector already
    assume via `Observation.mention_of` — even if an entity has multiple aliases or
    multiple occurrences. Overlaps follow the longest-match rule (see `_matches`); overlaps
    within one entity are harmless (it still yields one mention).
    """
    earliest: dict[str, tuple[int, int]] = {}
    kind_of: dict[str, str] = {}
    for start, end, entity_id, entity_kind in _matches(text, alias_table):
        current = earliest.get(entity_id)
        if current is None or start < current[0]:
            earliest[entity_id] = (start, end)
            kind_of[entity_id] = entity_kind

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
