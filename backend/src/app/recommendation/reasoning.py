"""Recommendation reasoning as translatable templates — pure, no I/O.

Each recommendation's English `reasoning` is three sentences: a finding (what the data
shows), the recommended action, and the simulated impact. Each sentence is a fixed template
from `TEMPLATES`, rendered with one shared params dict. The engine stores the finding's key
as `reasoning_key` and the params (which also name the other two sentences, `action_key` and
`assumption_key`) as `reasoning_params`, so a UI can render the same text in another
language. `REASONING_KEYS.md` next to this file documents every key for translators.
"""

from __future__ import annotations

import re

from app.analysis.types import Gap

ParamValue = str | int | float
Params = dict[str, ParamValue]

TEMPLATES: dict[str, str] = {
    # --- findings (reasoning_key) ---
    "finding.presence_overall_none": (
        "{brand} is not named in any of {evidence_count} AI answers about its category; "
        "assistants don't associate it with the category yet."
    ),
    "finding.presence_overall_partial": (
        "{brand} is named in only {coverage_pct}% of {evidence_count} AI answers about its category; "
        "assistants don't associate it with the category yet."
    ),
    "finding.presence_provider_none": (
        "{provider} never names {brand} in any of its {evidence_count} answers, "
        "so this assistant's sources don't know the brand yet."
    ),
    "finding.presence_provider_partial": (
        "{provider} names {brand} in only {coverage_pct}% of its {evidence_count} answers, "
        "so this assistant's sources don't know the brand yet."
    ),
    "finding.presence_intent_none": (
        "{brand} never appears in {intent_example}-type answers (intent: {intent_label}), "
        "across {evidence_count} AI responses."
    ),
    "finding.presence_intent_partial": (
        "{brand} appears in only {coverage_pct}% of {intent_example}-type answers (intent: {intent_label}), "
        "across {evidence_count} AI responses."
    ),
    "finding.presence_intent_none_generic": (
        "{brand} never appears in these answers (intent: {intent_label}), across {evidence_count} AI responses."
    ),
    "finding.presence_intent_partial_generic": (
        "{brand} appears in only {coverage_pct}% of answers (intent: {intent_label}), "
        "across {evidence_count} AI responses."
    ),
    "finding.prominence": (
        "{brand} is mentioned in {coverage_pct}% of answers, but usually as an afterthought "
        "(average position {mean_rank} in the list, across {evidence_count} responses)."
    ),
    "finding.competitive": (
        "{competitor} shows up alongside {brand} in {co_occurrence_pct}% of answers and is "
        "ranked ahead of it in {beat_pct}% of those ({evidence_count} responses)."
    ),
    "finding.representation": (
        "When asked about {brand} directly, {disagreement_pct}% of answers describe it "
        "inconsistently with its real profile."
    ),
    "finding.representation_conflicting": (
        "When asked about {brand} directly, {disagreement_pct}% of answers describe it "
        "inconsistently with its real profile, and the assistants disagree with each other."
    ),
    "finding.source": (
        "{non_mentioning_count} of the {dominant_source_count} web/video sources "
        "that dominate this category never mention {brand}."
    ),
    "finding.generic": "A {gap_type} gap was detected for {brand}.",
    # --- action sentences (reasoning_params["action_key"]) ---
    "action.comparison_page_vs": (
        "Recommended: publish a '{brand} vs {competitor}' comparison page that states where {brand} wins."
    ),
    "action.comparison_page": (
        "Recommended: publish a '{brand} vs its main competitors' comparison page that states where {brand} wins."
    ),
    "action.use_case_page_intent": (
        "Recommended: publish a use-case page for {intent_label} searches spelling out who {brand} is for "
        "and when to choose it."
    ),
    "action.use_case_page": (
        "Recommended: publish a use-case page spelling out who {brand} is for and when to choose it."
    ),
    "action.faq_page": (
        "Recommended: publish an FAQ answering the exact questions people ask, naming {brand} in each answer."
    ),
    "action.video": (
        "Recommended: produce a short video targeting these queries, with {brand} named in title and description."
    ),
    "action.clarify_category_descriptor": (
        "Recommended: use one consistent category description of {brand} everywhere it is listed."
    ),
    "action.add_attribute_claim": (
        "Recommended: claim one distinctive, checkable attribute (price, speed, speciality) for {brand} consistently."
    ),
    "action.correct_outdated_description": (
        "Recommended: correct outdated or wrong descriptions of {brand} on its own pages and listings."
    ),
    "action.submit_to_directory": (
        "Recommended: list {brand} on the directories and local listings AI assistants draw on "
        "(maps, review and category directories)."
    ),
    "action.pitch_listicle": (
        "Recommended: pitch {brand} for inclusion in 'best of' roundups and listicles for the category."
    ),
    "action.seek_review_coverage_provider": (
        "Recommended: get {brand} reviewed by bloggers, food/local guides or press "
        "in sources {provider} is likely to read."
    ),
    "action.seek_review_coverage": "Recommended: get {brand} reviewed by bloggers, food/local guides or press.",
    "action.community_answer": (
        "Recommended: answer real community questions (Reddit, Quora, local forums) where {brand} fits."
    ),
    # --- impact sentences (reasoning_params["assumption_key"]) ---
    "assumption.presence": (
        "If this lifted presence in half of the answers that currently omit it ({changed_count} answers, "
        "as a rank-{closure_rank} mention), the visibility score would rise by ~{delta} points (simulated)."
    ),
    "assumption.prominence": (
        "If this moved it up to position {closure_rank} in the {changed_count} answers where it ranks lower, "
        "the visibility score would rise by ~{delta} points (simulated)."
    ),
    "assumption.competitive": (
        "If it ranked ahead of {competitor} in the {changed_count} answers where it currently trails, "
        "the visibility score would rise by ~{delta} points (simulated)."
    ),
    "assumption.unscored": (
        "This gap isn't measured by the visibility score (it comes from brand-named questions or the "
        "web layer), so no score change is simulated; it is ranked on evidence alone."
    ),
}

# English example phrase per intent type (the `{category} ` placeholder is dropped: the finding
# is about the answer type, not the category name).
INTENT_EXAMPLE: dict[str, str] = {
    "category_discovery": "'best for ...'",
    "problem_first": "'how do I ...'",
    "alternative_seeking": "'alternatives to ...'",
    "attribute_constrained": "'most affordable / fastest ...'",
    "local_contextual": "'... in <city>'",
    "recommendation_seeking": "'who should I go to for ...'",
}

_PLACEHOLDER = re.compile(r"\{([a-z_]+)\}")


def placeholders(key: str) -> set[str]:
    """The param names a template uses."""
    return set(_PLACEHOLDER.findall(TEMPLATES[key]))


def render(key: str, params: Params) -> str:
    """Plain `{name}` substitution — the same rule a UI's i18n uses. KeyError on a missing param."""
    return _PLACEHOLDER.sub(lambda m: str(params[m.group(1)]), TEMPLATES[key])


def render_reasoning(reasoning_key: str, params: Params) -> str:
    """The full English reasoning: finding + action sentence + impact sentence."""
    return " ".join(
        render(k, params) for k in (reasoning_key, str(params["action_key"]), str(params["assumption_key"]))
    )


def _pct(x: float) -> int:
    # Same rounding as the original f"{x * 100:.0f}%" (round-half-even on the float).
    return int(f"{x * 100:.0f}")


def _humanize(key: str) -> str:
    return key.replace("_", " ")


def finding(gap: Gap, brand: str, names: dict[str, str], n_evidence: int) -> tuple[str, Params]:
    """(finding key, its params) for a gap."""
    d = gap.detail
    params: Params = {"brand": brand, "evidence_count": n_evidence}
    if gap.gap_type == "presence":
        coverage = d.get("coverage", 0.0)
        params["coverage_pct"] = _pct(coverage)
        level = "none" if coverage == 0 else "partial"
        scope = d.get("scope")
        if scope == "intent":
            intent = d.get("intent_type", "")
            params["intent"] = intent
            params["intent_label"] = _humanize(intent)
            example = INTENT_EXAMPLE.get(intent)
            if example:
                params["intent_example"] = example
                return f"finding.presence_intent_{level}", params
            return f"finding.presence_intent_{level}_generic", params
        if scope == "provider":
            params["provider"] = d.get("provider_id", "one provider")
            return f"finding.presence_provider_{level}", params
        return f"finding.presence_overall_{level}", params
    if gap.gap_type == "prominence":
        params["coverage_pct"] = _pct(d.get("coverage", 0.0))
        params["mean_rank"] = f"{d.get('mean_rank', 0):.1f}"
        return "finding.prominence", params
    if gap.gap_type == "competitive":
        comp_id = d.get("competitor_id", "")
        params["competitor_id"] = comp_id
        params["competitor"] = names.get(comp_id, comp_id)
        params["co_occurrence_pct"] = _pct(d.get("co_occurrence_rate", 0.0))
        params["beat_pct"] = _pct(d.get("beat_rate", 0.0))
        return "finding.competitive", params
    if gap.gap_type == "representation":
        params["disagreement_pct"] = _pct(d.get("disagreement_rate", 0.0))
        conflicting = bool(d.get("disagree_with_each_other"))
        return ("finding.representation_conflicting" if conflicting else "finding.representation"), params
    if gap.gap_type == "source":
        params["non_mentioning_count"] = d.get("non_mentioning_count", 0)
        params["dominant_source_count"] = d.get("dominant_source_count", 0)
        return "finding.source", params
    params["gap_type"] = gap.gap_type
    return "finding.generic", params


def action_sentence(action: str, gap: Gap, brand: str, names: dict[str, str]) -> tuple[str, Params]:
    """(action-sentence key, its params). `action` must be in the closed vocabulary."""
    d = gap.detail
    params: Params = {"brand": brand, "action": action}
    if action == "comparison_page":
        comp_id = d.get("competitor_id")
        if comp_id:
            params["competitor_id"] = comp_id
            params["competitor"] = names.get(comp_id, comp_id)
            return "action.comparison_page_vs", params
        return "action.comparison_page", params
    if action == "use_case_page":
        intent = d.get("intent_type")
        if intent:
            params["intent"] = intent
            params["intent_label"] = _humanize(intent)
            return "action.use_case_page_intent", params
        return "action.use_case_page", params
    if action == "seek_review_coverage":
        if d.get("provider_id"):
            params["provider"] = d["provider_id"]
            return "action.seek_review_coverage_provider", params
        return "action.seek_review_coverage", params
    key = f"action.{action}"
    if key not in TEMPLATES:
        raise KeyError(f"No reasoning template for action {action!r}")
    return key, params


def assumption(
    gap: Gap,
    n_changed: int,
    delta: float,
    names: dict[str, str],
    *,
    presence_rank: int,
    prominence_rank: int,
) -> tuple[str, Params]:
    """(impact-sentence key, its params). Representation/source gaps aren't in the score model."""
    if gap.gap_type not in ("presence", "prominence", "competitive"):
        return "assumption.unscored", {}
    params: Params = {"changed_count": n_changed, "delta": f"{delta:.1f}"}
    if gap.gap_type == "presence":
        params["closure_rank"] = presence_rank
    elif gap.gap_type == "prominence":
        params["closure_rank"] = prominence_rank
    else:
        comp_id = gap.detail.get("competitor_id", "")
        params["competitor_id"] = comp_id
        params["competitor"] = names.get(comp_id, comp_id)
    return f"assumption.{gap.gap_type}", params


def build(
    action: str,
    gap: Gap,
    brand: str,
    names: dict[str, str],
    n_evidence: int,
    n_changed: int,
    delta: float,
    *,
    presence_rank: int,
    prominence_rank: int,
) -> tuple[str, str, Params]:
    """(English reasoning, reasoning_key, reasoning_params) for one recommendation."""
    finding_key, params = finding(gap, brand, names, n_evidence)
    action_key, action_params = action_sentence(action, gap, brand, names)
    assumption_key, assumption_params = assumption(
        gap, n_changed, delta, names, presence_rank=presence_rank, prominence_rank=prominence_rank
    )
    merged: Params = {**params, **action_params, **assumption_params}
    merged["action_key"] = action_key
    merged["assumption_key"] = assumption_key
    return render_reasoning(finding_key, merged), finding_key, merged
