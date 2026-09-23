"""SyntheticProvider — SYNTHETIC, OFFLINE demo data. NOT a real LLM. NO network calls.

Generates plausible, list-style "assistant" answers to category questions so the whole
pipeline (mention detection -> scoring -> gaps -> recommendations -> dashboard) can be
demonstrated without any API key. Every result is labelled: `source_id="synthetic"`,
`model_version="synthetic-v1"`, `raw_meta={"synthetic": True}` — snapshots built from it
must be reported as `data_origin="synthetic"` and never presented as real LLM visibility.

Deterministic: the RNG seed is sha256(brand_key | prompt | per-prompt call counter | round),
so the same brand/query-set/sample count/round always reproduces the same answers.

Brand presence probability comes from a per-brand demo profile (so each pilot shows a
different gap picture) and rises by +0.07 per `round` after the first, so repeated demo
runs show a visible trend.
"""

from __future__ import annotations

import hashlib
import random
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from app.collection.types import CollectionResult, LLMProvider, QuotaState, SamplingParams

MODEL_VERSION = "synthetic-v1"
ROUND_PRESENCE_STEP = 0.07
_MAX_PRESENCE = 0.95


@dataclass(frozen=True)
class _Profile:
    presence: float  # P(brand appears at all) in round 1
    rank_range: tuple[int, int]  # 1-based list positions the brand tends to land in
    passing_share: float  # of appearances, fraction that are only a passing "(also ...)" mention


_PROFILES: dict[str, _Profile] = {
    "gajanan_vada_pav": _Profile(presence=0.35, rank_range=(3, 5), passing_share=0.25),
    "va_mayekar_opticians": _Profile(presence=0.20, rank_range=(2, 6), passing_share=0.35),
    "perfume_pilot": _Profile(presence=0.05, rank_range=(4, 6), passing_share=0.5),
}
_DEFAULT_PROFILE = _Profile(presence=0.15, rank_range=(2, 6), passing_share=0.3)

_EXPANSION_MARKER = "rephrase this search query"

_INTROS = (
    "Here are some well-regarded options for {topic}:",
    "Great question! When it comes to {topic}, a few names come up again and again:",
    "There are quite a few choices for {topic}. Based on popularity and reviews, consider:",
    "If you're looking into {topic}, these are worth checking out:",
    "Sure — here's a quick rundown for {topic}:",
)
_ALT_INTROS = (
    "If you're looking for alternatives to {target}, here are some options people often suggest:",
    "Good alternatives to {target} include:",
    "Not sold on {target}? You could try these instead:",
)
_HOWTO_INTROS = (
    "Here's how you could approach that. A few places people usually recommend:",
    "The easiest way is to start with well-reviewed local names. For example:",
    "A good approach is to shortlist a few trusted options, such as:",
)
_DESCRIPTIONS = (
    "known for consistent quality and friendly service.",
    "a long-standing favourite with locals.",
    "good value for money, with reasonable prices.",
    "frequently recommended in online reviews and food/lifestyle blogs.",
    "well-rated on Google Maps with a loyal customer base.",
    "offers a wide range of options at different price points.",
    "praised for quick service, even during peak hours.",
    "a reliable choice if you want something tried and tested.",
    "popular with {audience}.",
    "has several branches, so it's easy to find one nearby.",
    "stands out for its attention to detail.",
    "a newer name that has been getting a lot of buzz lately.",
)
_CLOSINGS = (
    "Availability and prices can vary, so it's worth checking recent reviews before you go.",
    "Your best pick depends on your budget and location — try a couple and see what you like.",
    "Local recommendations change often, so ask around as well.",
    "Hope this helps! Let me know if you'd like options for a specific area.",
    "Check opening hours and recent ratings on Google Maps before visiting.",
)
_PASSING = (
    "(Also worth a mention: {name}, which some people swear by.)",
    "(Some locals also suggest {name}.)",
    "(You may also come across {name}, though reviews are more mixed.)",
)
_FILLER_PREFIXES = ("Shree Sai", "Royal", "New Classic", "Heritage", "Urban", "Sunrise", "Evergreen", "Metro")
_FILLER_GENERIC = (
    "A small {category} near the railway station",
    "Your neighbourhood {category}",
    "Well-reviewed independent {category}s in {city}",
    "Chain outlets in malls around {city}",
)
_REPHRASINGS = (
    "Can you recommend {q}?",
    "What are some good options for {q}?",
    "I'm looking for {q} — any suggestions?",
    "{Q}?",
    "Which are the top picks for {q}?",
)


def _seed(*parts: Any) -> int:
    return int(hashlib.sha256("|".join(map(str, parts)).encode("utf-8")).hexdigest()[:16], 16)


def _attr(obj: Any, name: str, default: Any = None) -> Any:
    return getattr(obj, name, default) if obj is not None else default


_GENERIC_TAIL = {"outlet", "outlets", "brand", "brands", "store", "stores", "shop", "shops", "company"}


def _title(text: str) -> str:
    words = text.split()
    if len(words) > 1 and words[-1].lower() in _GENERIC_TAIL:
        words = words[:-1]  # "vada pav outlet" -> "Vada Pav", so fillers read like shop names
    return " ".join(w[:1].upper() + w[1:] for w in words)


class SyntheticProvider(LLMProvider):
    """SYNTHETIC offline demo generator — see module docstring. Never a real model."""

    def __init__(self, brand: Any = None, round: int = 1):  # noqa: A002 - contract name
        self._brand = brand
        self._round = max(1, int(round))
        self._calls: dict[str, int] = defaultdict(int)

        params = _attr(brand, "params")
        self._brand_key: str = _attr(brand, "brand_key", "") or ""
        self._brand_name: str | None = None
        if brand is not None:
            aliases = tuple(_attr(brand, "self_aliases", ()) or ())
            self._brand_name = _attr(params, "brand") or (aliases[0] if aliases else None)
        self._category: str = _attr(params, "category") or "option"
        cities = tuple(_attr(params, "cities", ()) or ())
        self._city: str = cities[0] if cities else "your city"
        audiences = tuple(_attr(params, "audiences", ()) or ())
        self._audience: str = audiences[0] if audiences else "regular customers"
        competitors: dict = _attr(brand, "competitors", {}) or {}
        # Display name = first alias; skip competitors with no aliases.
        self._competitors: list[tuple[str, str]] = [
            (cid, aliases[0]) for cid, aliases in sorted(competitors.items()) if aliases
        ]

        profile = _PROFILES.get(self._brand_key, _DEFAULT_PROFILE)
        presence = profile.presence + ROUND_PRESENCE_STEP * (self._round - 1)
        self._profile = _Profile(min(_MAX_PRESENCE, presence), profile.rank_range, profile.passing_share)

    @property
    def model(self) -> str:
        return MODEL_VERSION

    # -- LLMProvider --------------------------------------------------------------------

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        call_index = self._calls[prompt]
        self._calls[prompt] += 1
        rng = random.Random(_seed(self._brand_key, prompt, call_index, self._round))

        if _EXPANSION_MARKER in prompt.lower():
            text = self._rephrase(prompt, rng)
        else:
            text = self._answer(prompt, rng)

        return CollectionResult(
            source_id="synthetic",
            source_kind="llm",
            model_version=MODEL_VERSION,
            payload=text,
            latency_ms=0,
            token_usage=None,
            raw_meta={"synthetic": True},
        )

    def quota_state(self) -> QuotaState:
        return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)

    # -- generation ---------------------------------------------------------------------

    def _rephrase(self, prompt: str, rng: random.Random) -> str:
        match = re.search(r"Query:\s*(.+)", prompt, re.DOTALL)
        query = (match.group(1) if match else prompt).strip().rstrip("?.")
        if query.lower().startswith(("how ", "who ", "what ", "where ", "which ", "is ", "can ")):
            return query[:1].upper() + query[1:] + "?"
        template = rng.choice(_REPHRASINGS)
        return template.format(q=query, Q=query[:1].upper() + query[1:])

    def _intro(self, prompt: str, rng: random.Random) -> str:
        lowered = prompt.lower().strip().rstrip("?.")
        alt = re.match(r".*alternatives? to (.+)", lowered)
        if alt:
            target = prompt.strip().rstrip("?.")[alt.start(1):]
            return rng.choice(_ALT_INTROS).format(target=target)
        if lowered.startswith(("how do i", "how can i", "who should i")):
            return rng.choice(_HOWTO_INTROS)
        topic = prompt.strip().rstrip("?.")
        topic = re.sub(r"^(what are|which are|can you recommend|what is|tell me)\s+(the\s+)?", "", topic, flags=re.I)
        topic = re.sub(r"^(the\s+)?(best|top)\s+", "", topic, flags=re.I)
        return rng.choice(_INTROS).format(topic=topic[:1].lower() + topic[1:] if topic else f"{self._category}s")

    def _fillers(self, rng: random.Random) -> list[str]:
        cat_title = _title(self._category)
        names = [f"{p} {cat_title}" for p in rng.sample(_FILLER_PREFIXES, 3)]
        names += [
            g.format(category=self._category, city=self._city) for g in rng.sample(_FILLER_GENERIC, 2)
        ]
        return names

    def _answer(self, prompt: str, rng: random.Random) -> str:
        lowered = prompt.lower()
        n_entries = rng.randint(3, 6)

        # Competitors: each has a stable per-brand "strength" so some competitors dominate
        # (realistic share-of-voice spread), but which ones appear still varies per sample.
        competitors = [
            name for _cid, name in self._competitors if name.lower() not in lowered
        ]
        weighted = sorted(
            competitors,
            key=lambda name: rng.random() * (0.5 + (_seed(self._brand_key, name) % 1000) / 1000),
            reverse=True,
        )
        n_comp = min(len(weighted), max(1, n_entries - rng.randint(0, 2))) if weighted else 0
        entries = weighted[:n_comp]
        fillers = self._fillers(rng)
        while len(entries) < n_entries and fillers:
            entries.insert(rng.randint(0, len(entries)), fillers.pop(0))

        # Brand presence (only when a brand is known and the prompt doesn't already name it).
        passing_name: str | None = None
        brand = self._brand_name
        if brand and brand.lower() not in lowered and rng.random() < self._profile.presence:
            if rng.random() < self._profile.passing_share:
                passing_name = brand
            else:
                lo, hi = self._profile.rank_range
                pos = min(len(entries), rng.randint(lo, hi) - 1)
                entries.insert(pos, brand)
                entries = entries[: max(n_entries, pos + 1)]
        if passing_name is None and len(weighted) > n_comp and rng.random() < 0.3:
            passing_name = weighted[n_comp]  # an extra competitor, only in passing

        lines = [self._intro(prompt, rng), ""]
        descriptions = list(_DESCRIPTIONS)
        rng.shuffle(descriptions)
        for i, name in enumerate(entries, start=1):
            desc = descriptions[(i - 1) % len(descriptions)].format(audience=self._audience)
            lines.append(f"{i}. **{name}** – {desc[:1].upper() + desc[1:]}")
        lines.append("")
        if passing_name:
            lines.append(rng.choice(_PASSING).format(name=passing_name))
            lines.append("")
        lines.append(rng.choice(_CLOSINGS))
        return "\n".join(lines)
