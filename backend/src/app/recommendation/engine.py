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
     capped at `max_recommendations`.

Reasoning is a plain-English template here (`drafted_by="template"`). An LLM
drafter can optionally rewrite the prose later (see `drafter.py`) without
changing what was found or how it was ranked.
"""

from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass, replace

from app.analysis.scorer import score
from app.analysis.types import EntityMention, Gap, Observation

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
    "problem_first": ("faq_page", "community_answer"),
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
# Reasoning templates
# ---------------------------------------------------------------------------


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def _humanize(key: str) -> str:
    return key.replace("_", " ")


_INTENT_EXAMPLE = {
    "category_discovery": "'best {category} for ...'",
    "problem_first": "'how do I ...'",
    "alternative_seeking": "'alternatives to ...'",
    "attribute_constrained": "'most affordable / fastest ...'",
    "local_contextual": "'... in <city>'",
    "recommendation_seeking": "'who should I go to for ...'",
}


def _finding(gap: Gap, brand: str, names: dict[str, str], n_evidence: int) -> str:
    d = gap.detail
    if gap.gap_type == "presence":
        cov = _pct(d.get("coverage", 0.0))
        scope = d.get("scope")
        if scope == "intent":
            intent = d.get("intent_type", "")
            example = _INTENT_EXAMPLE.get(intent, "").replace("{category} ", "")
            example = f" {example}-type" if example else ""
            share = f"never appears in{example or ' these'}" if d.get("coverage", 0.0) == 0 else f"appears in only {cov} of{example}"
            return f"{brand} {share} answers (intent: {_humanize(intent)}), across {n_evidence} AI responses."
        if scope == "provider":
            named = "never names " + brand + " in any" if d.get("coverage", 0.0) == 0 else f"names {brand} in only {cov}"
            return (
                f"{d.get('provider_id', 'one provider')} {named} of its {n_evidence} answers, "
                f"so this assistant's sources don't know the brand yet."
            )
        named = "is not named in any" if d.get("coverage", 0.0) == 0 else f"is named in only {cov}"
        return (
            f"{brand} {named} of {n_evidence} AI answers about its category; "
            f"assistants don't associate it with the category yet."
        )
    if gap.gap_type == "prominence":
        return (
            f"{brand} is mentioned in {_pct(d.get('coverage', 0.0))} of answers, but usually as an afterthought "
            f"(average position {d.get('mean_rank', 0):.1f} in the list, across {n_evidence} responses)."
        )
    if gap.gap_type == "competitive":
        comp_id = d.get("competitor_id", "")
        comp = names.get(comp_id, comp_id)
        return (
            f"{comp} shows up alongside {brand} in {_pct(d.get('co_occurrence_rate', 0.0))} of answers and is "
            f"ranked ahead of it in {_pct(d.get('beat_rate', 0.0))} of those ({n_evidence} responses)."
        )
    if gap.gap_type == "representation":
        return (
            f"When asked about {brand} directly, {_pct(d.get('disagreement_rate', 0.0))} of answers describe it "
            f"inconsistently with its real profile"
            + (", and the assistants disagree with each other." if d.get("disagree_with_each_other") else ".")
        )
    if gap.gap_type == "source":
        return (
            f"{d.get('non_mentioning_count', 0)} of the {d.get('dominant_source_count', 0)} web/video sources "
            f"that dominate this category never mention {brand}."
        )
    return f"A {gap.gap_type} gap was detected for {brand}."


def _action_sentence(action: str, gap: Gap, brand: str, names: dict[str, str]) -> str:
    d = gap.detail
    comp_id = d.get("competitor_id")
    comp = names.get(comp_id, comp_id) if comp_id else None
    if action == "comparison_page":
        target = comp or "its main competitors"
        return f"Recommended: publish a '{brand} vs {target}' comparison page that states where {brand} wins."
    if action == "use_case_page":
        intent = d.get("intent_type")
        focus = f" for {_humanize(intent)} searches" if intent else ""
        return f"Recommended: publish a use-case page{focus} spelling out who {brand} is for and when to choose it."
    if action == "faq_page":
        return f"Recommended: publish an FAQ answering the exact questions people ask, naming {brand} in each answer."
    if action == "video":
        return f"Recommended: produce a short video targeting these queries, with {brand} named in title and description."
    if action == "clarify_category_descriptor":
        return f"Recommended: use one consistent category description of {brand} everywhere it is listed."
    if action == "add_attribute_claim":
        return f"Recommended: claim one distinctive, checkable attribute (price, speed, speciality) for {brand} consistently."
    if action == "correct_outdated_description":
        return f"Recommended: correct outdated or wrong descriptions of {brand} on its own pages and listings."
    if action == "submit_to_directory":
        return f"Recommended: list {brand} on the directories and local listings AI assistants draw on (maps, review and category directories)."
    if action == "pitch_listicle":
        return f"Recommended: pitch {brand} for inclusion in 'best of' roundups and listicles for the category."
    if action == "seek_review_coverage":
        where = f" in sources {d['provider_id']} is likely to read" if d.get("provider_id") else ""
        return f"Recommended: get {brand} reviewed by bloggers, food/local guides or press{where}."
    if action == "community_answer":
        return f"Recommended: answer real community questions (Reddit, Quora, local forums) where {brand} fits."
    return f"Recommended: {ACTION_LABEL.get(action, action)}."


def _assumption(gap: Gap, n_changed: int, delta: float, names: dict[str, str]) -> str:
    if gap.gap_type == "presence":
        what = (
            f"If this lifted presence in half of the answers that currently omit it ({n_changed} answers, "
            f"as a rank-{PRESENCE_CLOSURE_RANK} mention)"
        )
    elif gap.gap_type == "prominence":
        what = f"If this moved it up to position {PROMINENCE_CLOSURE_RANK} in the {n_changed} answers where it ranks lower"
    elif gap.gap_type == "competitive":
        comp_id = gap.detail.get("competitor_id", "")
        what = f"If it ranked ahead of {names.get(comp_id, comp_id)} in the {n_changed} answers where it currently trails"
    else:
        return (
            "This gap isn't measured by the visibility score (it comes from brand-named questions or the "
            "web layer), so no score change is simulated; it is ranked on evidence alone."
        )
    return f"{what}, the visibility score would rise by ~{delta:.1f} points (simulated)."


# ---------------------------------------------------------------------------
# Validation gate (DESIGN §5.6)
# ---------------------------------------------------------------------------

# Gap types whose evidence isn't in the unprompted observation list (prompted-subset
# observations / web sources) — their refs are kept as-is instead of being resolved.
_EXTERNAL_EVIDENCE_TYPES = frozenset({"representation", "source"})


def validation_gate(
    recs: list[Recommendation],
    gaps: list[Gap],
    observations: list[Observation],
    max_recommendations: int,
) -> list[Recommendation]:
    """Drop anything untraceable or outside the vocabulary; filter evidence to real ids; cap count."""
    gaps_by_id = {g.gap_id: g for g in gaps}
    obs_ids = {o.observation_id for o in observations}
    passed: list[Recommendation] = []
    for rec in recs:
        gap = gaps_by_id.get(rec.gap_id) if rec.gap_id else None
        if gap is None:  # AC-7: every recommendation must trace to an existing gap
            continue
        if rec.action not in ACTION_VOCABULARY or ACTION_CLASS[rec.action] != rec.action_class:
            continue
        allowed = obs_ids | (set(gap.evidence_refs) if gap.gap_type in _EXTERNAL_EVIDENCE_TYPES else set())
        refs = tuple(r for r in rec.evidence_refs if r in allowed)
        if not refs:
            continue
        passed.append(replace(rec, evidence_refs=refs) if refs != rec.evidence_refs else rec)
    passed.sort(key=lambda r: (-r.priority, -r.delta_composite, r.recommendation_id))
    return passed[: max(0, max_recommendations)]


# ---------------------------------------------------------------------------
# Entry point (docs/CONTRACT.md §6)
# ---------------------------------------------------------------------------


def _recommendation_id(gap_id: str, action: str) -> str:
    return "rec-" + hashlib.sha1((gap_id + action).encode("utf-8")).hexdigest()[:10]


def _confidence(n_evidence: int) -> float:
    return round(max(0.2, min(1.0, n_evidence / 10)), 3)


def recommend(
    gaps: list[Gap],
    observations: list[Observation],
    self_entity_id: str,
    competitor_entity_ids: frozenset[str],
    *,
    entity_names: dict[str, str] | None = None,
    max_recommendations: int = 10,
) -> list[Recommendation]:
    """Turn detected gaps into ranked, validated recommendations (sorted by priority desc)."""
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
        confidence = _confidence(len(gap.evidence_refs))
        finding = _finding(gap, brand, names, len(gap.evidence_refs))
        assumption = _assumption(gap, n_changed, delta, names)

        for action in actions_for_gap(gap)[:2]:
            effort = ACTION_EFFORT[action]
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
                    reasoning=" ".join((finding, _action_sentence(action, gap, brand, names), assumption)),
                    evidence_refs=tuple(gap.evidence_refs),
                )
            )

    return validation_gate(candidates, gaps, observations, max_recommendations)
