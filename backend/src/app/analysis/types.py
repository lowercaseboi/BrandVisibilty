"""Data shapes consumed/produced by the analysis layer's pure functions.

Deliberately independent of the DB/ORM models: Scorer and GapDetector
(DESIGN_v1 §1.6) take and return plain, hashable-free-of-I/O structures so
they stay unit-testable without a database.
"""

from __future__ import annotations

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
