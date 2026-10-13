"""List placement — where a business sits in an AI answer's list of options (metrics v2).

Pure and deterministic: no I/O, no LLM calls (same requirement as Scorer, CLAUDE.md).

Why: v1 ranked an entity only among the *tracked* entities an answer named, so a shop
listed sixth behind five untracked shops counted as the "sole top pick". Assistants answer
in markdown — numbered headings, bullet lists with bold leads, tables — and a reader meets
the options in that order. This module reads that structure.

Rules (docs/METRICS_v2.md §3):

- An *item* is a heading, a numbered or bulleted list item, a table data row, or a table
  header cell after the first column (comparison tables put the options in the columns).
- Each item has a *lead*, the part that names the option:
    heading      the heading text;
    list item    a leading **bold** / *italic* label, extended over an emphasised name
                 right after a "Label:" ("**Thane:** *Gajanan Vada Pav*"); otherwise the
                 first line up to ":" or a spaced dash;
    table row    the first cell plus every emphasised span in the row;
    header cell  the cell.
- An item's *kind* is its type and level (h3 numbered, h3, ol@0, ul@1, row, col). Its
  *slot* is its 1-based position among items of the same kind in reading order: how many
  options of that kind a reader passes before reaching it. Explicit numbers are ignored,
  so restarted or lazy ("1. 1. 1.") numbering can't create ties.
- An answer is *structured* when it has at least `MIN_OPTION_ITEMS` option items (list
  items, table rows or numbered headings). Then an entity is *listed* at the best slot of
  the items whose lead contains one of its mentions, or *unlisted* when it is only named
  in an intro, a description or a tip. An unstructured answer is *prose*: the entity's
  slot is its order among the tracked entities by first mention (the v1 rank).
- A mention inside parentheses is *passing* (MentionDetector's rule); a non-passing
  listed mention always wins over a passing one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import pairwise
from typing import Literal

from app.analysis.mention_detector import is_passing_mention

PlacementMode = Literal["listed", "unlisted", "prose"]

MIN_OPTION_ITEMS = 2

_HEADING = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$")
_NUMBERED_TEXT = re.compile(r"^[*_]{0,2}\s*\d{1,3}[.)][ \t]")
_OL = re.compile(r"^([ \t]*)\d{1,3}[.)][ \t]+(\S.*)$")
_UL = re.compile(r"^([ \t]*)[-*+•][ \t]+(\S.*)$")
_HR = re.compile(r"^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$")
_FENCE = re.compile(r"^[ \t]*(```|~~~)")
_LEADING_EMPH = re.compile(r"(\*\*|__)(?!\s)(.+?)(?<!\s)\1|(\*|_)(?!\s)([^*_\n]+?)(?<!\s)\3")
_EMPH = re.compile(
    r"\*\*(?!\s)(.+?)(?<!\s)\*\*|__(?!\s)(.+?)(?<!\s)__"
    r"|(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])|(?<![_\w])_(?!\s)([^_\n]+?)(?<!\s)_(?![_\w])"
)
_PLAIN_LEAD_END = re.compile(r":|\s[–—-]\s")
_LABEL_COLON = re.compile(r"[ \t]*:")


@dataclass(frozen=True)
class OptionItem:
    """One item of an answer's structure: its kind, its slot among items of that kind, and
    the character spans of its lead."""

    kind: str
    slot: int
    leads: tuple[tuple[int, int], ...]

    @property
    def is_option(self) -> bool:
        """Counts towards "structured": list items, table rows/columns, numbered headings."""
        return self.kind.startswith(("ol", "ul", "row", "col")) or self.kind.endswith("n")


@dataclass(frozen=True)
class Placement:
    """Where one entity sits in one answer."""

    mode: PlacementMode
    slot: int | None  # None when unlisted
    passing: bool


def _depth(indent: str) -> int:
    width = len(indent.expandtabs(4))
    return 0 if width < 2 else 1 if width < 6 else 2


def _list_lead(line: str, content_at: int) -> tuple[int, int]:
    """Lead span (relative to the line) of a list item whose content starts at `content_at`."""
    content = line[content_at:]
    emph = _LEADING_EMPH.match(content)
    if emph:
        end = emph.end()
        label = emph.group(2) or emph.group(4) or ""
        colon = _LABEL_COLON.match(content, end)
        if label.rstrip().endswith(":") or colon:
            after = colon.end() if colon else end
            gap = len(content[after:]) - len(content[after:].lstrip())
            following = _LEADING_EMPH.match(content, after + gap)
            if following:
                end = following.end()
        return content_at, content_at + end
    sep = _PLAIN_LEAD_END.search(content)
    end = sep.start() if sep else len(content.rstrip())
    return content_at, content_at + end


def _cells(line: str) -> list[tuple[int, int]]:
    """(start, end) of each table cell's trimmed text, relative to the line."""
    pipes = [i for i, ch in enumerate(line) if ch == "|" and (i == 0 or line[i - 1] != "\\")]
    if not pipes:
        return []
    bounds = []
    first, last = pipes[0], pipes[-1]
    edges = list(pipes)
    if line[:first].strip():
        edges.insert(0, -1)
    if line[last + 1 :].strip():
        edges.append(len(line))
    for a, b in pairwise(edges):
        raw = line[a + 1 : b]
        if not raw.strip():
            bounds.append((a + 1, a + 1))
            continue
        lead_ws = len(raw) - len(raw.lstrip())
        bounds.append((a + 1 + lead_ws, a + 1 + len(raw.rstrip())))
    return bounds


def _is_separator_row(line: str) -> bool:
    body = line.replace("|", "").replace(":", "").replace("-", "").strip()
    return not body and "-" in line


def parse_option_items(text: str) -> tuple[OptionItem, ...]:
    """Every item of the answer's markdown structure, in reading order."""
    counters: dict[str, int] = {}
    items: list[OptionItem] = []

    def add(kind: str, leads: list[tuple[int, int]]) -> None:
        counters[kind] = counters.get(kind, 0) + 1
        items.append(OptionItem(kind=kind, slot=counters[kind], leads=tuple(leads)))

    table: list[tuple[int, str]] = []

    def flush_table() -> None:
        if not table:
            return
        rows = list(table)
        table.clear()
        header = None
        if len(rows) >= 2 and _is_separator_row(rows[1][1]):
            header, rows = rows[0], rows[2:]
        if header is not None:
            h_at, h_line = header
            for cell in _cells(h_line)[1:]:
                if cell[1] > cell[0]:
                    add("col", [(h_at + cell[0], h_at + cell[1])])
        for at, line in rows:
            if _is_separator_row(line):
                continue
            cells = _cells(line)
            if not cells:
                continue
            leads = []
            if cells[0][1] > cells[0][0]:
                leads.append((at + cells[0][0], at + cells[0][1]))
            leads.extend((at + m.start(), at + m.end()) for m in _EMPH.finditer(line))
            add("row", leads)

    offset = 0
    in_fence = False
    for raw_line in text.splitlines(keepends=True):
        at = offset
        offset += len(raw_line)
        line = raw_line.rstrip("\r\n")
        if _FENCE.match(line):
            flush_table()
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if line.lstrip().startswith("|"):
            table.append((at, line))
            continue
        flush_table()
        if not line.strip() or _HR.match(line):
            continue
        heading = _HEADING.match(line)
        if heading:
            numbered = bool(_NUMBERED_TEXT.match(heading.group(2)))
            kind = f"h{len(heading.group(1))}{'n' if numbered else ''}"
            add(kind, [(at + heading.start(2), at + heading.end(2))])
            continue
        ordered = _OL.match(line)
        if ordered:
            start, end = _list_lead(line, ordered.start(2))
            add(f"ol{_depth(ordered.group(1))}", [(at + start, at + end)])
            continue
        bullet = _UL.match(line)
        if bullet:
            start, end = _list_lead(line, bullet.start(2))
            add(f"ul{_depth(bullet.group(1))}", [(at + start, at + end)])
    flush_table()
    return tuple(items)


def is_structured(items: tuple[OptionItem, ...]) -> bool:
    return sum(1 for item in items if item.is_option) >= MIN_OPTION_ITEMS


def place(
    text: str,
    spans: dict[str, list[tuple[int, int]]],
    items: tuple[OptionItem, ...] | None = None,
) -> dict[str, Placement]:
    """Placement of every entity in `spans` (MentionDetector.find_spans output)."""
    if items is None:
        items = parse_option_items(text)
    found = {eid: s for eid, s in spans.items() if s}
    if not is_structured(items):
        ordered = sorted(found, key=lambda eid: (found[eid][0][0], eid))
        return {
            eid: Placement(mode="prose", slot=rank, passing=is_passing_mention(text, *found[eid][0]))
            for rank, eid in enumerate(ordered, start=1)
        }

    out: dict[str, Placement] = {}
    for eid, entity_spans in found.items():
        best: tuple[bool, int] | None = None
        for start, end in entity_spans:
            slots = [
                item.slot
                for item in items
                if any(lead_start <= start and end <= lead_end for lead_start, lead_end in item.leads)
            ]
            if not slots:
                continue
            candidate = (is_passing_mention(text, start, end), min(slots))
            if best is None or candidate < best:
                best = candidate
        if best is None:
            passing = all(is_passing_mention(text, s, e) for s, e in entity_spans)
            out[eid] = Placement(mode="unlisted", slot=None, passing=passing)
        else:
            out[eid] = Placement(mode="listed", slot=best[1], passing=best[0])
    return out
