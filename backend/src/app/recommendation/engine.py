"""Recommendation engine — gap -> bounded action, ranked by counterfactual score delta.

Pure: no I/O, no LLM calls (CLAUDE.md, DESIGN_v1 §5.1). Every recommendation is
derived from a `Gap` the deterministic GapDetector already found, so it always
carries that gap's `gap_id` (PRD AC-7).

Pipeline per gap:
  1. Diagnostic matrix (DESIGN §5.3) -> one or two actions from the closed vocabulary (§5.5).
  2. Counterfactual (§5.4): apply the gap's hypothetical closure to a copy of the
     observations, re-run the pure Scorer, delta = new composite - base composite.
  3. priority = delta x confidence / effort.
  4. Validation gate (§5.6): gap_id exists, action in vocabulary, evidence resolves,
     one recommendation per id, capped at `max_recommendations` — and the gate reports how
     many valid ones the cap cut, so the UI can say "top 10 of 14".

Reasoning is a plain-English template here (`drafted_by="template"`), also emitted as a
translatable key + params (`reasoning.py`, `REASONING_KEYS.md`). An LLM drafter can
optionally rewrite the prose later (see `drafter.py`) without changing what was found or
how it was ranked.
"""

from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass, field, replace
from typing import NamedTuple

from app.analysis.scorer import score
from app.analysis.types import EntityMention, Gap, Observation
from app.recommendation import reasoning

# ---------------------------------------------------------------------------
# Closed action vocabulary (DESIGN §5.5) and effort constants (§5.4)
# ---------------------------------------------------------------------------

ACTION_CLASS: dict[str, str] = {
    # Content
    "comparison_page": "content",
    "use_case_page": "content",
    "faq_page": "content",
    "video": "content",
    # Messaging
    "clarify_category_descriptor": "messaging",
    "add_attribute_claim": "messaging",
    "correct_outdated_description": "messaging",
    # Distribution
    "submit_to_directory": "distribution",
    "pitch_listicle": "distribution",
    "seek_review_coverage": "distribution",
    "community_answer": "distribution",
}
ACTION_VOCABULARY: frozenset[str] = frozenset(ACTION_CLASS)
ACTION_CLASSES: frozenset[str] = frozenset({"content", "messaging", "distribution"})

EFFORT_LISTING = 1
EFFORT_CONTENT = 3
EFFORT_POSITIONING = 5
EFFORT_PRODUCT = 8  # no action in the current vocabulary needs a product change

ACTION_EFFORT: dict[str, int] = {
    "submit_to_directory": EFFORT_LISTING,
    "community_answer": EFFORT_LISTING,
    "comparison_page": EFFORT_CONTENT,
    "use_case_page": EFFORT_CONTENT,
    "faq_page": EFFORT_CONTENT,
    "video": EFFORT_CONTENT,
    "pitch_listicle": EFFORT_CONTENT,
    "seek_review_coverage": EFFORT_CONTENT,
    "clarify_category_descriptor": EFFORT_POSITIONING,
    "add_attribute_claim": EFFORT_POSITIONING,
    "correct_outdated_description": EFFORT_POSITIONING,
}

ACTION_LABEL: dict[str, str] = {
    "comparison_page": "Publish a comparison page",
    "use_case_page": "Publish a use-case page",
    "faq_page": "Publish an FAQ page",
    "video": "Produce a video targeting this query cluster",
    "clarify_category_descriptor": "Clarify the category descriptor",
    "add_attribute_claim": "Add a distinctive attribute claim",
    "correct_outdated_description": "Correct the outdated description",
    "submit_to_directory": "Submit to directories and local listings",
    "pitch_listicle": "Pitch inclusion in 'best of' listicles",
    "seek_review_coverage": "Seek review coverage",
    "community_answer": "Answer community questions",
}

# ---------------------------------------------------------------------------
# Diagnostic matrix (DESIGN §5.3): gap -> actions (max two per gap)
# ---------------------------------------------------------------------------

PRESENCE_INTENT_ACTIONS: dict[str, tuple[str, ...]] = {
    "category_discovery": ("pitch_listicle", "use_case_page"),
    # "how do I ..." questions: a how-to video is the natural answer format next to an FAQ.
    "problem_first": ("faq_page", "video"),
    "alternative_seeking": ("comparison_page",),
    "attribute_constrained": ("add_attribute_claim", "use_case_page"),
    "local_contextual": ("submit_to_directory", "seek_review_coverage"),
    "recommendation_seeking": ("community_answer", "seek_review_coverage"),
}
_DEFAULT_INTENT_ACTIONS: tuple[str, ...] = ("use_case_page", "faq_page")


def actions_for_gap(gap: Gap) -> tuple[str, ...]:
    """The diagnostic-matrix lookup. Always returns actions from ACTION_VOCABULARY."""
    detail = gap.detail
    if gap.gap_type == "presence":
        scope = detail.get("scope")
        if scope == "overall":
            return ("submit_to_directory", "pitch_listicle")
        if scope == "provider":
            return ("seek_review_coverage", "submit_to_directory")
        if scope == "intent":
            return PRESENCE_INTENT_ACTIONS.get(detail.get("intent_type", ""), _DEFAULT_INTENT_ACTIONS)
        return ("submit_to_directory",)
    if gap.gap_type == "prominence":
        return ("add_attribute_claim", "comparison_page")
    if gap.gap_type == "competitive":
        return ("comparison_page",)
    if gap.gap_type == "representation":
        actions = []
        if detail.get("disagreement_rate", 0) > 0:
            actions.append("correct_outdated_description")
        if detail.get("disagree_with_each_other") or not actions:
            actions.append("clarify_category_descriptor")
        return tuple(actions)
    if gap.gap_type == "source":
        return ("pitch_listicle", "seek_review_coverage")
    return ()


# ---------------------------------------------------------------------------
# Public data shape (docs/CONTRACT.md §6)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Recommendation:
    recommendation_id: str
    gap_id: str
    action: str
    action_class: str
    priority: float
    delta_composite: float
    confidence: float
    effort: int
    reasoning: str
    evidence_refs: tuple[str, ...]
    drafted_by: str = "template"
    # n behind `confidence` (= max(0.2, min(1, n/10))): how many AI answers back the gap.
    evidence_count: int = 0
    # Translatable form of `reasoning` (see REASONING_KEYS.md): the finding's template key, and
    # the params for it plus `action_key` / `assumption_key` naming the other two sentences.
    reasoning_key: str = ""
    reasoning_params: dict[str, str | int | float] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Counterfactual closures (DESIGN §5.4)
# ---------------------------------------------------------------------------

PRESENCE_CLOSURE_FRACTION = 0.5  # half the gap-scoped answers that omit the brand start naming it
PRESENCE_CLOSURE_RANK = 3  # ...as a non-passing rank-3 mention
PROMINENCE_CLOSURE_RANK = 2  # brand moves up to rank 2 where it is already mentioned


def _insert_mention(obs: Observation, self_entity_id: str, rank: int) -> Observation:
    """Add a non-passing self mention at `rank`, shifting later-ranked entities down."""
    rank = min(rank, len(obs.mentions) + 1)
    shifted = tuple(replace(m, rank=m.rank + 1) if m.rank >= rank else m for m in obs.mentions)
    new = EntityMention(entity_id=self_entity_id, entity_kind="self", rank=rank)
    return replace(obs, mentions=shifted + (new,))


def _promote_mention(obs: Observation, self_entity_id: str, target_rank: int) -> Observation:
    """Move the self mention up to `target_rank` (never down), shifting the others."""
    own = obs.mention_of(self_entity_id)
    if own is None:
        return obs
    new_rank = min(own.rank, target_rank)
    mentions = []
    for m in obs.mentions:
        if m.entity_id == self_entity_id:
            mentions.append(replace(m, rank=new_rank, is_passing_mention=False))
        elif new_rank <= m.rank < own.rank:
            mentions.append(replace(m, rank=m.rank + 1))
        else:
            mentions.append(m)
    return replace(obs, mentions=tuple(mentions))


def _swap_ahead(obs: Observation, self_entity_id: str, competitor_id: str) -> Observation:
    """Brand takes the competitor's position where the competitor out-ranked it."""
    own, comp = obs.mention_of(self_entity_id), obs.mention_of(competitor_id)
    if own is None or comp is None or own.rank < comp.rank:
        return obs
    mentions = []
    for m in obs.mentions:
        if m.entity_id == self_entity_id:
            mentions.append(replace(m, rank=comp.rank, is_passing_mention=False))
        elif m.entity_id == competitor_id:
            mentions.append(replace(m, rank=own.rank))
        else:
            mentions.append(m)
    return replace(obs, mentions=tuple(mentions))


def _apply_closure(
    gap: Gap, observations: list[Observation], self_entity_id: str
) -> tuple[list[Observation], int]:
    """Return (modified observation list, number of observations changed)."""
    evidence = set(gap.evidence_refs)
    changed: dict[str, Observation] = {}

    if gap.gap_type == "presence":
        lacking = sorted(
            (o for o in observations if o.observation_id in evidence and o.mention_of(self_entity_id) is None),
            key=lambda o: (o.query_id, o.observation_id),
        )
        # Evenly spaced picks spread the closure across queries rather than front-loading one.
        n_close = math.ceil(len(lacking) * PRESENCE_CLOSURE_FRACTION)
        chosen = [lacking[int(i * len(lacking) / n_close)] for i in range(n_close)] if n_close else []
        for o in chosen:
            changed[o.observation_id] = _insert_mention(o, self_entity_id, PRESENCE_CLOSURE_RANK)
    elif gap.gap_type == "prominence":
        for o in observations:
            if o.observation_id in evidence:
                new = _promote_mention(o, self_entity_id, PROMINENCE_CLOSURE_RANK)
                if new != o:
                    changed[o.observation_id] = new
    elif gap.gap_type == "competitive":
        competitor_id = gap.detail.get("competitor_id", "")
        for o in observations:
            if o.observation_id in evidence:
                new = _swap_ahead(o, self_entity_id, competitor_id)
                if new != o:
                    changed[o.observation_id] = new
    # representation / source: not measured by the unprompted-subset composite -> no simulated change.

    return [changed.get(o.observation_id, o) for o in observations], len(changed)


def _composite(observations: list[Observation], self_entity_id: str, competitor_entity_ids: frozenset[str]) -> float:
    # n_bootstrap=0: only the point estimate is needed; the CI is irrelevant for a delta.
    return score(
        observations, self_entity_id, competitor_entity_ids, n_bootstrap=0, rng=random.Random(0)
    ).composite_score


# ---------------------------------------------------------------------------
# Validation gate (DESIGN §5.6)
# ---------------------------------------------------------------------------

# Gap types whose evidence isn't in the unprompted observation list (prompted-subset
# observations / web sources) — their refs are kept as-is instead of being resolved.
_EXTERNAL_EVIDENCE_TYPES = frozenset({"representation", "source"})


class GateResult(NamedTuple):
    """What the validation gate let through, and what it held back.

    `passed` — the valid recommendations, ranked, at most `max_recommendations` of them.
    `dropped` — valid recommendations cut only by the cap (disclosed: "top 10 of 14").
    `rejected` — candidates refused outright: no/unknown gap_id (AC-7), action outside the
    closed vocabulary or its class, no evidence that resolves, or a duplicate id.
    """

    passed: list[Recommendation]
    dropped: int
    rejected: int

    @property
    def total(self) -> int:
        """Valid recommendations before the cap (`len(passed) + dropped`)."""
        return len(self.passed) + self.dropped


def _rank_key(rec: Recommendation) -> tuple:
    # Priority first; ties (notably every zero-delta rec, whose priority is 0) fall back to
    # the evidence behind them and then the cheaper action, so "ranked on evidence alone"
    # holds for unscored gap types. The id makes the order deterministic; the last two keys
    # only order copies of one id (which the gate then collapses), independent of input order.
    return (
        -rec.priority, -rec.delta_composite, -rec.confidence, rec.effort, rec.recommendation_id,
        -rec.evidence_count, rec.reasoning,
    )


def validation_gate(
    recs: list[Recommendation],
    gaps: list[Gap],
    observations: list[Observation],
    max_recommendations: int,
) -> GateResult:
    """Drop anything untraceable or outside the vocabulary; filter evidence to real ids; keep
    one recommendation per id; rank; cap — reporting how many the cap cut."""
    obs_ids = {o.observation_id for o in observations}
    # Evidence a gap may cite beyond the unprompted observations (prompted answers / web
    # sources), per gap id — unioned, so a repeated gap id can't make this order-dependent.
    external: dict[str, set[str]] = {}
    for g in gaps:
        refs = external.setdefault(g.gap_id, set())
        if g.gap_type in _EXTERNAL_EVIDENCE_TYPES:
            refs.update(g.evidence_refs)
    valid: list[Recommendation] = []
    rejected = 0
    for rec in recs:
        if not rec.gap_id or rec.gap_id not in external:  # AC-7: must trace to an existing gap
            rejected += 1
            continue
        if rec.action not in ACTION_VOCABULARY or ACTION_CLASS[rec.action] != rec.action_class:
            rejected += 1
            continue
        allowed = obs_ids | external[rec.gap_id]
        refs = tuple(r for r in rec.evidence_refs if r in allowed)
        if not refs:
            rejected += 1
            continue
        valid.append(replace(rec, evidence_refs=refs) if refs != rec.evidence_refs else rec)
    valid.sort(key=_rank_key)
    # One recommendation per id (the same gap + action twice, e.g. a gap list with a repeated
    # gap): keep the best-ranked copy so the board never shows two cards for one suggestion.
    seen: set[str] = set()
    unique: list[Recommendation] = []
    for rec in valid:
        if rec.recommendation_id in seen:
            rejected += 1
            continue
        seen.add(rec.recommendation_id)
        unique.append(rec)
    cap = max(0, max_recommendations)
    return GateResult(passed=unique[:cap], dropped=max(0, len(unique) - cap), rejected=rejected)


# ---------------------------------------------------------------------------
# Entry point (docs/CONTRACT.md §6)
# ---------------------------------------------------------------------------


def _recommendation_id(gap_id: str, action: str) -> str:
    return "rec-" + hashlib.sha1((gap_id + action).encode("utf-8")).hexdigest()[:10]


def _confidence(n_evidence: int) -> float:
    return round(max(0.2, min(1.0, n_evidence / 10)), 3)


def recommend_detailed(
    gaps: list[Gap],
    observations: list[Observation],
    self_entity_id: str,
    competitor_entity_ids: frozenset[str],
    *,
    entity_names: dict[str, str] | None = None,
    max_recommendations: int = 10,
) -> GateResult:
    """Turn detected gaps into ranked, validated recommendations, plus the gate's counts."""
    names = dict(entity_names or {})
    brand = names.get(self_entity_id, self_entity_id)
    base = _composite(observations, self_entity_id, competitor_entity_ids)

    candidates: list[Recommendation] = []
    for gap in gaps:
        modified, n_changed = _apply_closure(gap, observations, self_entity_id)
        delta = 0.0
        if n_changed:
            delta = max(0.0, _composite(modified, self_entity_id, competitor_entity_ids) - base)
        delta = round(delta, 2)
        n_evidence = len(gap.evidence_refs)
        confidence = _confidence(n_evidence)

        for action in actions_for_gap(gap)[:2]:
            effort = ACTION_EFFORT[action]
            text, key, params = reasoning.build(
                action, gap, brand, names, n_evidence, n_changed, delta,
                presence_rank=PRESENCE_CLOSURE_RANK, prominence_rank=PROMINENCE_CLOSURE_RANK,
            )
            candidates.append(
                Recommendation(
                    recommendation_id=_recommendation_id(gap.gap_id, action),
                    gap_id=gap.gap_id,
                    action=action,
                    action_class=ACTION_CLASS[action],
                    priority=round(delta * confidence / effort, 3),
                    delta_composite=delta,
                    confidence=confidence,
                    effort=effort,
                    reasoning=text,
                    evidence_refs=tuple(gap.evidence_refs),
                    evidence_count=n_evidence,
                    reasoning_key=key,
                    reasoning_params=params,
                )
            )

    return validation_gate(candidates, gaps, observations, max_recommendations)


def recommend(
    gaps: list[Gap],
    observations: list[Observation],
    self_entity_id: str,
    competitor_entity_ids: frozenset[str],
    *,
    entity_names: dict[str, str] | None = None,
    max_recommendations: int = 10,
) -> list[Recommendation]:
    """Turn detected gaps into ranked, validated recommendations (sorted by priority desc).
    `recommend_detailed` also returns how many the cap cut."""
    return recommend_detailed(
        gaps, observations, self_entity_id, competitor_entity_ids,
        entity_names=entity_names, max_recommendations=max_recommendations,
    ).passed
