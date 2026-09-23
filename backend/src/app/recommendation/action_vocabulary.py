"""Bounded action vocabulary (DESIGN_v1 §5.5) and per-action effort constants (§5.4).

Free-text actions are rejected at validation (`validation.py`) — every recommendation's
`action` must be one of the keys below.

Effort-constant interpretation note: §5.4 specifies four effort buckets by example
("directory listing=1, content piece=3, positioning change=5, product change=8"), but
none of §5.5's eleven actions is a "product change" — that bucket has no corresponding
action in the current vocabulary. This module maps: distribution actions ~ "directory
listing" effort (1), content actions ~ "content piece" effort (3), messaging actions ~
"positioning change" effort (5). Documented here so a reviewer can override it without
archaeology, rather than picked silently.
"""

from __future__ import annotations

from typing import Literal

ActionClass = Literal["content", "messaging", "distribution"]

ACTION_VOCABULARY: dict[str, ActionClass] = {
    "Publish comparison page": "content",
    "Publish use-case page": "content",
    "Publish FAQ": "content",
    "Produce video targeting query cluster": "content",
    "Clarify category descriptor": "messaging",
    "Add attribute claim": "messaging",
    "Correct outdated description": "messaging",
    "Submit to directory": "distribution",
    "Pitch inclusion in listicle": "distribution",
    "Seek review coverage": "distribution",
    "Community answer": "distribution",
}

EFFORT_CONSTANTS: dict[str, float] = {
    "Submit to directory": 1,
    "Pitch inclusion in listicle": 1,
    "Seek review coverage": 1,
    "Community answer": 1,
    "Publish comparison page": 3,
    "Publish use-case page": 3,
    "Publish FAQ": 3,
    "Produce video targeting query cluster": 3,
    "Clarify category descriptor": 5,
    "Add attribute claim": 5,
    "Correct outdated description": 5,
}

assert ACTION_VOCABULARY.keys() == EFFORT_CONSTANTS.keys(), (
    "every action must have exactly one effort constant"
)


def is_valid_action(action: str) -> bool:
    return action in ACTION_VOCABULARY


def effort_for(action: str) -> float:
    return EFFORT_CONSTANTS[action]
