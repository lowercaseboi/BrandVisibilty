"""RecommendationDrafter (DESIGN_v1 §5.1, Stage B): rules detect, LLM narrates.

`draft_recommendations` always computes diagnosis, action, priority, gap_id, and
evidence_refs deterministically first — exactly mirroring the existing
`generate_draft(..., llm_provider=None)` fallback pattern in
`app.querysets.generator`. An optional `llm_provider` is only ever used to rephrase the
`reasoning` prose; it can never supply `gap_id`, `evidence_refs`, or `action` — those are
set from code-computed values before any LLM call happens, so a fabricated id from the
model has no path into the result.
"""

from __future__ import annotations

from app.analysis.types import Gap, Observation
from app.collection.types import LLMProvider, SamplingParams
from app.recommendation.action_vocabulary import effort_for
from app.recommendation.counterfactual import simulate_closure
from app.recommendation.diagnostics import diagnose
from app.recommendation.identity import gap_id as compute_gap_id
from app.recommendation.identity import recommendation_id
from app.recommendation.types import ClosureAssumption, ObservedOnly, Recommendation
from app.recommendation.validation import RecommendationValidationError, validate_recommendation

_NARRATION_PROMPT_TEMPLATE = (
    "You are writing a one-paragraph explanation of a marketing gap finding for a brand "
    "owner. Rephrase the following facts clearly and concisely. Do NOT invent any facts, "
    "numbers, ids, or evidence not given below. Do NOT propose a different action than the "
    "one given. Return only the rewritten paragraph.\n\n"
    "Diagnosis: {diagnosis}\n"
    "Gap type: {gap_type}\n"
    "Evidence count: {evidence_count}\n"
    "Recommended action: {action}\n"
    "Assumed impact if closed: composite score change of {delta_composite:+.1f} points "
    "(confidence {confidence:.2f})."
)


def _template_reasoning(diagnosis_text: str, gap: Gap, action: str, delta: float, confidence: float) -> str:
    return (
        f"{diagnosis_text}. Based on {len(gap.evidence_refs)} evidence observation(s), "
        f"closing this gap is estimated to move the composite score by {delta:+.1f} points "
        f"(confidence {confidence:.2f}). Suggested action: {action}."
    )


def _narrate(
    llm_provider: LLMProvider,
    sampling_params: SamplingParams,
    *,
    diagnosis_text: str,
    gap: Gap,
    action: str,
    delta: float,
    confidence: float,
) -> str:
    prompt = _NARRATION_PROMPT_TEMPLATE.format(
        diagnosis=diagnosis_text,
        gap_type=gap.gap_type,
        evidence_count=len(gap.evidence_refs),
        action=action,
        delta_composite=delta,
        confidence=confidence,
    )
    result = llm_provider.query(prompt, sampling_params)
    return result.payload.strip()


def draft_recommendations(
    gaps: list[Gap],
    observations: list[Observation],
    self_entity_id: str,
    competitor_entity_ids: frozenset[str],
    *,
    llm_provider: LLMProvider | None = None,
    sampling_params: SamplingParams | None = None,
) -> list[Recommendation | ObservedOnly]:
    sampling_params = sampling_params or SamplingParams()
    known_evidence_refs = frozenset(obs.observation_id for obs in observations)
    known_gap_ids = frozenset(compute_gap_id(gap) for gap in gaps)

    results: list[Recommendation | ObservedOnly] = []
    for gap in gaps:
        this_gap_id = compute_gap_id(gap)
        diagnosis = diagnose(gap)
        cf = simulate_closure(gap, observations, self_entity_id, competitor_entity_ids)
        effort = effort_for(diagnosis.action)
        priority = cf.delta_composite * cf.confidence * (1 / effort) if effort else 0.0

        # Always the gap's own evidence_refs — never anything the LLM produced.
        evidence_refs = gap.evidence_refs

        reasoning = _template_reasoning(diagnosis.text, gap, diagnosis.action, cf.delta_composite, cf.confidence)
        narrated = False
        if llm_provider is not None:
            reasoning = _narrate(
                llm_provider,
                sampling_params,
                diagnosis_text=diagnosis.text,
                gap=gap,
                action=diagnosis.action,
                delta=cf.delta_composite,
                confidence=cf.confidence,
            )
            narrated = True

        rec = Recommendation(
            id=recommendation_id(this_gap_id, diagnosis.action, evidence_refs),
            gap_id=this_gap_id,
            gap_type=gap.gap_type,
            diagnosis=diagnosis.text,
            action_class=diagnosis.action_class,
            action=diagnosis.action,
            reasoning=reasoning,
            priority=priority,
            delta_composite=cf.delta_composite,
            confidence=cf.confidence,
            effort_constant=effort,
            closure_assumption=ClosureAssumption(
                description=f"{cf.closure_field} {cf.closure_before:.2f} -> {cf.closure_after:.2f}",
                field_changed=cf.closure_field,
                before=cf.closure_before,
                after=cf.closure_after,
            ),
            evidence_refs=evidence_refs,
            narrated_by_llm=narrated,
        )

        try:
            validate_recommendation(rec, known_gap_ids, known_evidence_refs)
            results.append(rec)
        except RecommendationValidationError as exc:
            results.append(
                ObservedOnly(
                    gap_id=this_gap_id,
                    gap_type=gap.gap_type,
                    reason=str(exc),
                    evidence_refs=gap.evidence_refs,
                )
            )

    return results
