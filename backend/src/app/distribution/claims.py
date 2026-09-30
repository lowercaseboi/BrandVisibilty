"""Profile-aware claim check (pure — no I/O, no LLM calls; CLAUDE.md / DESIGN §1.6, §4).

`copywriter.py` already keeps an *unconditional* regex list (`_CLAIM_PATTERNS`) for claims that can
never be backed by any brand profile — prices, discounts, awards, guarantees. This module handles
the harder rule: "nothing numeric, temporal or superlative that isn't backed by the brand profile".
Some of these tokens legitimately CAN come from the profile (a jobs line "open 24 hours" backs the
number "24"; a brand name that happens to contain a digit backs that digit), so each token found in
a piece of copy is checked against the brand's own facts before it is called unsupported.

Two pure steps:
  1. `extract_tokens` finds every numeric / temporal / superlative token in a string (ASCII and
     Devanagari digits, English and Hindi/Marathi words).
  2. `is_backed` / `unsupported_claims` check each token against `profile_corpus` — the brand's
     name, aliases, category, cities, audiences, jobs_to_be_done and competitors, folded into one
     comparable string.

`facts` is accepted duck-typed (an object with those attributes, e.g. `copywriter.BrandFacts`, or a
plain dict) so this module never has to import from `copywriter`.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

# --------------------------------------------------------------------------- normalisation

# Devanagari digits ०-९ -> ASCII 0-9. A straight character-for-character translation, so spans
# computed on the original text stay valid (used only for the *backing comparison*, never to alter
# what is shown back to the user).
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def normalize_digits(text: str) -> str:
    return text.translate(_DEVANAGARI_DIGITS)


def _fold(text: str) -> str:
    """Digit-normalised, casefolded — the form all backing comparisons happen in."""
    return normalize_digits(text).casefold()


@dataclass(frozen=True)
class ClaimToken:
    kind: str  # number | price | percentage | time | date | duration | founding | ordinal | superlative
    text: str  # exact substring matched in the original (un-normalised) input
    start: int
    end: int


# --------------------------------------------------------------------------- token extraction

# Devanagari has no ASCII-style \b: combining marks (matras, anusvara, virama…) sit right after the
# base letter, so e.g. "मे" ("May") is a prefix of "में" ("in") with no non-word character between
# them. `_dev_word` treats the whole Devanagari block as "word" for boundary purposes instead of
# relying on \b/\w, so a bare Devanagari literal only matches when it is not glued to more script.
_DEV_BLOCK = "ऀ-ॿ"


def _dev_word(words: list[str]) -> str:
    alt = "|".join(re.escape(w) for w in sorted(set(words), key=len, reverse=True))
    return rf"(?<![{_DEV_BLOCK}])(?:{alt})(?![{_DEV_BLOCK}])"


_PRICE_RE = re.compile(
    r"₹\s?\d[\d,]*(?:\.\d+)?"
    r"|\b(?:rs\.?|inr)\s?\d[\d,]*(?:\.\d+)?\b"
    r"|\d[\d,]*(?:\.\d+)?\s?(?:rupees?|रुपये)",
    re.IGNORECASE,
)
_PERCENT_RE = re.compile(r"\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s?(?:percent|टक्के|प्रतिशत)", re.IGNORECASE)
_FOUNDING_RE = re.compile(
    r"\b(?:since|est\.?|established)\s+\d{4}\b"
    r"|" + _dev_word(["स्थापना"]) + r"[^0-9\n]{0,12}\d{4}"
    r"|\b\d{4}\s*(?:से|पासून)",
    re.IGNORECASE,
)
_TIME_RE = re.compile(
    r"\b\d{1,2}:\d{2}\s?(?:am|pm)?\b|\b\d{1,2}\s?(?:am|pm)\b|\b24\s?[x×/]\s?7\b",
    re.IGNORECASE,
)
_DURATION_RE = re.compile(
    r"\b(?:in|within)\s+(?:an?|\d+)\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?)\b",
    re.IGNORECASE,
)
_DATE_DEV_WORDS = [
    "सोमवार", "मंगळवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार",
    "जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर",
    "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर",
]  # fmt: skip
_DATE_RE = re.compile(
    r"\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b"
    r"|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b"
    r"|" + _dev_word(_DATE_DEV_WORDS) +
    r"|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b",
    re.IGNORECASE,
)
_ORDINAL_RE = re.compile(
    r"#\s?\d+|\bno\.?\s?\d+\b|\bnumber\s+(?:one|two|three|1|2|3)\b|\btop\s?\d+\b|\b\d+(?:st|nd|rd|th)\b"
    r"|\bfirst\b"
    r"|" + _dev_word(["नंबर"]) + r"(?:\s?\d+|\s?वन)"
    r"|" + _dev_word(["पहिला", "पहला"]),
    re.IGNORECASE,
)
_SUPERLATIVE_RE = re.compile(
    r"\b(?:best|cheapest|fastest|oldest|newest|largest|biggest|greatest|finest|guaranteed|famous|"
    r"legendary|premier|foremost|unbeatable|unmatched|only|most)\b"
    r"|" + _dev_word(["सबसे", "सर्वोत्तम", "सर्वात", "एकमेव", "सर्वश्रेष्ठ"]),
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)*")  # lowest priority: whatever digits nothing else claimed

# Priority order: more specific numeric categories first, so e.g. "50%" is one "percentage" token,
# not a "percentage" plus a leftover "number". Superlatives run alongside (disjoint alphabet mostly);
# the bare number catch-all runs last and only picks up digits nothing else consumed.
_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("price", _PRICE_RE),
    ("percentage", _PERCENT_RE),
    ("founding", _FOUNDING_RE),
    ("time", _TIME_RE),
    ("duration", _DURATION_RE),
    ("date", _DATE_RE),
    ("ordinal", _ORDINAL_RE),
    ("superlative", _SUPERLATIVE_RE),
    ("number", _NUMBER_RE),
)


def extract_tokens(text: str) -> list[ClaimToken]:
    """Every numeric / temporal / superlative token in `text`, left to right, each character used
    by at most one token (a higher-priority category wins the overlap)."""
    if not text:
        return []
    consumed: list[tuple[int, int]] = []

    def overlaps(s: int, e: int) -> bool:
        return any(s < ce and e > cs for cs, ce in consumed)

    tokens: list[ClaimToken] = []
    for kind, pattern in _PATTERNS:
        for m in pattern.finditer(text):
            s, e = m.start(), m.end()
            if s == e or overlaps(s, e):
                continue
            consumed.append((s, e))
            tokens.append(ClaimToken(kind=kind, text=m.group(0), start=s, end=e))
    tokens.sort(key=lambda t: t.start)
    return tokens


# --------------------------------------------------------------------------- profile backing

# Brand-profile fields a token may be "backed" by (PRD §13.2 brand facts; kept in sync with
# copywriter.BrandFacts — deliberately not the wider use_cases/tasks fields, so a claim has to be
# traceable to something the brand actually told us about itself, not an inferred occasion).
_PROFILE_FIELDS = ("name", "aliases", "category", "cities", "audiences", "jobs_to_be_done", "competitors")


def profile_corpus(facts: Any) -> str:
    """Everything a claim token is allowed to repeat, folded into one comparable string. Fields are
    newline-joined so a number at the end of one field can never combine with the next one's start."""
    parts: list[str] = []
    for name in _PROFILE_FIELDS:
        value = facts.get(name) if isinstance(facts, Mapping) else getattr(facts, name, None)
        if not value:
            continue
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, Iterable):
            parts.extend(str(v) for v in value if v)
    return _fold("\n".join(parts))


def _digit_backed(digits: str, corpus_folded: str) -> bool:
    """`digits` appears in the corpus as its own number, not merely inside a bigger one (so a
    profile containing "1000" does not back a claimed "100")."""
    return re.search(r"(?<!\d)" + re.escape(digits) + r"(?!\d)", corpus_folded) is not None


def _word_backed(word_folded: str, corpus_folded: str) -> bool:
    return re.search(r"(?<!\w)" + re.escape(word_folded) + r"(?!\w)", corpus_folded, re.UNICODE) is not None


def is_backed(token_text: str, corpus_folded: str) -> bool:
    """A token is backed when every digit run inside it appears in the profile corpus as its own
    number (so a brand name like "Store24" backs a later mention of "24"), or — for a token with no
    digits (a superlative, a weekday/month name) — the whole word appears there."""
    folded = _fold(token_text)
    digits = re.findall(r"\d+", folded)
    if digits:
        return all(_digit_backed(d, corpus_folded) for d in digits)
    return _word_backed(folded, corpus_folded)


def unsupported_claims(text: str, facts: Any) -> list[ClaimToken]:
    """Tokens in `text` that are NOT backed by `facts`' profile text."""
    if not text or not text.strip():
        return []
    corpus = profile_corpus(facts)
    return [t for t in extract_tokens(text) if not is_backed(t.text, corpus)]


_WHY: dict[str, str] = {
    "number": "numbers aren't in your brand profile",
    "price": "prices aren't in your brand profile",
    "percentage": "percentages aren't in your brand profile",
    "time": "times aren't in your brand profile",
    "date": "dates aren't in your brand profile",
    "duration": "durations aren't in your brand profile",
    "founding": "founding dates aren't in your brand profile",
    "ordinal": "rankings aren't in your brand profile",
    "superlative": "superlatives aren't in your brand profile",
}


def issue_message(token: ClaimToken) -> str:
    why = _WHY.get(token.kind, "this isn't in your brand profile")
    return f"Unsupported claim — “{token.text}” — {why}; add it to the profile or remove it"
