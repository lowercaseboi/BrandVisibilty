"""Data shapes consumed/produced by the analysis layer's pure functions.

Deliberately independent of the DB/ORM models: Scorer and GapDetector
(DESIGN_v1 §1.6) take and return plain, hashable-free-of-I/O structures so
they stay unit-testable without a database.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Literal

EntityKind = Literal["self", "competitor", "discovered"]


@dataclass(frozen=True)
class EntityMention:
    """One entity's mention within a single observation (DESIGN §2.1 EntityMention row)."""

    entity_id: str
    entity_kind: EntityKind
    rank: int  # 1-based position among distinct entities, ordered by first mention
    is_passing_mention: bool = False  # parenthetical/incidental mention — forces the 0.1 band (§4.2)
    char_start: int = -1  # evidence span of the earliest match; -1 when not produced by MentionDetector
    char_end: int = -1


@dataclass(frozen=True)
class EntityAlias:
    """One tracked entity's alias set — MentionDetector's input vocabulary (DESIGN §1.6).
    `aliases` should include the canonical name and any known variants; matching handles
    casefolding and possessive/plural suffixes on top of these, so aliases don't need to
    enumerate those forms themselves."""

    entity_id: str
    entity_kind: EntityKind
    aliases: tuple[str, ...]


@dataclass(frozen=True)
class Observation:
    """One unprompted (query, provider, sample) triple, aggregated with its entity mentions.

    Only unprompted-subset observations are passed to Scorer (PRD §10.1, DESIGN §4.1) —
    the caller is responsible for filtering by `is_brand_named` before calling.
    """

    observation_id: str
    query_id: str
    provider_id: str
    mentions: tuple[EntityMention, ...] = field(default_factory=tuple)
    intent_type: str = ""  # e.g. "category_discovery", "local" (§3.3) — used for per-intent PRESENCE gaps

    def mention_of(self, entity_id: str) -> EntityMention | None:
        return next((m for m in self.mentions if m.entity_id == entity_id), None)

    def mentions_any(self, entity_ids: frozenset[str]) -> bool:
        return any(m.entity_id in entity_ids for m in self.mentions)


@dataclass(frozen=True)
class ProviderBreakdown:
    provider_id: str
    coverage: float
    observation_count: int
    mentioned_count: int


@dataclass(frozen=True)
class AnalysisResult:
    """Output of Scorer — DESIGN §4, ER model `AnalysisResult`."""

    coverage: float
    prominence: float | None  # undefined (None) when coverage == 0 (§4.2, C-2)
    share_of_voice: float | None  # undefined (None) when no response names brand or a competitor
    composite_score: float  # 0-100, renormalized over defined components (§10.6, §4.2)
    ci_low: float
    ci_high: float
    per_provider_coverage: tuple[ProviderBreakdown, ...]
    observation_count: int
    mentioned_count: int
    participating_providers: tuple[str, ...]


GapType = Literal["presence", "prominence", "representation", "competitive", "source"]


@dataclass(frozen=True)
class PromptedObservation:
    """One prompted-subset (brand-named) observation, reduced to its deterministically
    alias-matched attribute/category claims — the REPRESENTATION gap's input (DESIGN §5.2).

    `claimed_attributes` is produced the same way EntityMention is: alias-table lookup
    against a fixed attribute vocabulary (e.g. category descriptors), not an LLM judgment —
    keeping gap detection deterministic per PRD §11.2.
    """

    observation_id: str
    query_id: str
    provider_id: str
    intent_type: str
    claimed_attributes: frozenset[str] = frozenset()


@dataclass(frozen=True)
class SourceLandscapeEntry:
    """One dominant web/social source for the brand's category (DESIGN §1.8, §5.2 SOURCE gap).

    Produced by the (not-yet-built) collection/normalization layers from YouTube + web
    scrape + Google CSE + Brave Search results — GapDetector only consumes the aggregate.
    """

    source_id: str
    mentions_brand: bool


@dataclass(frozen=True)
class Gap:
    """A detected gap — DESIGN §5.2, ER model `Gap`. `evidence_refs` must resolve to real
    observation/source IDs; `is_inferred` marks a claim that isn't a direct data readout
    (kept False by every detector below since all five rules here compute directly from
    aggregated data, not inference)."""

    gap_type: GapType
    evidence_refs: tuple[str, ...]
    detail: dict
    is_inferred: bool = False
    gap_id: str = ""  # derived deterministically in __post_init__ when left empty (AC-7 traceability)

    def __post_init__(self) -> None:
        if not self.gap_id:
            object.__setattr__(self, "gap_id", make_gap_id(self.gap_type, self.detail))


# Detail keys that identify WHICH gap this is (its scope), as opposed to the measured
# rates. The gap_id hashes only these, so the same gap keeps the same id across runs
# even as its coverage/beat-rate numbers move.
GAP_SCOPE_KEYS: tuple[str, ...] = ("scope", "provider_id", "intent_type", "competitor_id")


def make_gap_id(gap_type: str, detail: dict) -> str:
    """Deterministic gap id: "gap-" + sha1(gap_type + scope-identifying detail)[:10]."""
    scope = {k: detail[k] for k in GAP_SCOPE_KEYS if k in detail}
    digest = hashlib.sha1((gap_type + json.dumps(scope, sort_keys=True)).encode("utf-8")).hexdigest()
    return "gap-" + digest[:10]


@dataclass(frozen=True)
class DetectionConfig:
    """Versioned detection thresholds (DESIGN §5.2, Decisions Log #5). Initial values are
    the ones set from the first real analysis run per the decisions log; anything not yet
    given a value there (representation disagreement) is a documented starting assumption,
    frozen the same way once real data exists."""

    presence_threshold: float = 0.10  # θ_presence
    prominence_coverage_threshold: float = 0.20  # θ_present
    prominence_rank_threshold: int = 4  # "mean rank >= 4"
    competitive_co_occurrence_threshold: float = 0.30  # θ_co
    competitive_beat_threshold: float = 0.60  # θ_beat
    representation_disagreement_threshold: float = 0.5  # not in Decisions Log — starting assumption
