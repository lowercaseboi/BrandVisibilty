"""Live smoke test against Gemini — skipped unless GEMINI_API_KEY is set (§3.4 dev guidance:
run against cached fixtures, not live providers, during routine development)."""

import os

import pytest

from app.collection.providers.gemini import GeminiAdapter
from app.collection.types import SamplingParams
from app.config.settings import Settings
from app.querysets.generator import freeze, generate_draft
from app.querysets.templates import BrandParams

# Falls back to Settings (which reads .env.local/.env) so this test exercises the same
# config path real callers will use, not just an explicitly-exported shell var.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or Settings().gemini_api_key

PARAMS = BrandParams(
    brand="Gajanan Vada Pav",
    category="vada pav outlet",
    audiences=("street food lovers",),
    cities=("Mumbai",),
)


@pytest.mark.skipif(not GEMINI_API_KEY, reason="GEMINI_API_KEY not set")
def test_gemini_expands_one_canonical_query_into_natural_phrasing():
    adapter = GeminiAdapter(api_key=GEMINI_API_KEY)
    result = adapter.query(
        "Rephrase this search query in a natural, conversational way a real person "
        "would type, preserving its meaning exactly. Return only the rephrased query, "
        "nothing else.\n\nQuery: best vada pav outlet for street food lovers",
        SamplingParams(),
    )
    assert result.payload.strip()
    assert result.model_version


@pytest.mark.skipif(not GEMINI_API_KEY, reason="GEMINI_API_KEY not set")
def test_generate_draft_end_to_end_with_real_gemini():
    adapter = GeminiAdapter(api_key=GEMINI_API_KEY)
    draft = generate_draft(PARAMS, llm_provider=adapter)
    assert len(draft.queries) == len(generate_draft(PARAMS).queries)  # expansion rephrases, never adds/drops
    frozen = freeze(draft)
    assert frozen.content_hash
