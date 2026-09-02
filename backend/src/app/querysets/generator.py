"""Query-set generation pipeline (DESIGN_v1 §3.1): brand params -> template instantiation
-> LLM expansion for natural phrasing -> [mandatory human review, outside this module] ->
freeze + SHA-256 hash.

`generate_draft` is safe to call freely. `freeze` must only be called on a draft that has
already been through the human review gate §3.1 requires — this module has no way to
enforce that from inside a pure function, so the caller (an API endpoint, in practice) is
responsible for the review step actually happening before it calls `freeze`.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime

from app.collection.types import LLMProvider, SamplingParams
from app.querysets.templates import ALL_TEMPLATES, TEMPLATE_SET_VERSION, BrandParams, instantiate

_EXPANSION_PROMPT_TEMPLATE = (
    "Rephrase this search query in a natural, conversational way a real person would "
    "type, preserving its meaning exactly. Return only the rephrased query, nothing else.\n\n"
    "Query: {text}"
)


@dataclass(frozen=True)
class Query:
    text: str
    intent_type: str
    is_brand_named: bool


@dataclass(frozen=True)
class QuerySetDraft:
    template_set_version: str
    brand: str
    queries: tuple[Query, ...]
    sampling_config: dict


@dataclass(frozen=True)
class QuerySet:
    template_set_version: str
    brand: str
    queries: tuple[Query, ...]
    sampling_config: dict
    content_hash: str
    frozen_at: datetime


def _expand_phrasing(llm_provider: LLMProvider, text: str, sampling_params: SamplingParams) -> str:
    prompt = _EXPANSION_PROMPT_TEMPLATE.format(text=text)
    result = llm_provider.query(prompt, sampling_params)
    return result.payload.strip()


def generate_draft(
    params: BrandParams,
    *,
    llm_provider: LLMProvider | None = None,
    sampling_params: SamplingParams | None = None,
) -> QuerySetDraft:
    """Instantiate every template against `params`, optionally expanding each into a more
    natural phrasing via `llm_provider`. Without a provider, canonical (template-filled)
    text is used as-is — a valid, reviewable draft, just without phrasing polish.
    """
    sampling_params = sampling_params or SamplingParams()
    queries: list[Query] = []
    for template in ALL_TEMPLATES:
        for canonical in instantiate(template, params):
            text = canonical.text
            if llm_provider is not None:
                text = _expand_phrasing(llm_provider, text, sampling_params)
            queries.append(Query(text=text, intent_type=canonical.intent_type, is_brand_named=canonical.is_brand_named))

    return QuerySetDraft(
        template_set_version=TEMPLATE_SET_VERSION,
        brand=params.brand,
        queries=tuple(queries),
        sampling_config={
            "temperature": sampling_params.temperature,
            "system_prompt": sampling_params.system_prompt,
        },
    )


def freeze(draft: QuerySetDraft) -> QuerySet:
    """Hash and timestamp a reviewed draft. Immutable from here — DESIGN §2.2: any edit
    must create a new version, never mutate a frozen QuerySet.
    """
    content = json.dumps(
        {
            "template_set_version": draft.template_set_version,
            "brand": draft.brand,
            "queries": [[q.text, q.intent_type, q.is_brand_named] for q in draft.queries],
            "sampling_config": draft.sampling_config,
        },
        sort_keys=True,
    )
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

    return QuerySet(
        template_set_version=draft.template_set_version,
        brand=draft.brand,
        queries=draft.queries,
        sampling_config=draft.sampling_config,
        content_hash=content_hash,
        frozen_at=datetime.now(UTC),
    )
