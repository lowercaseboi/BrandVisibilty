from app.collection.types import CollectionResult, QuotaState, SamplingParams
from app.querysets.generator import freeze, generate_draft
from app.querysets.templates import BrandParams

PARAMS = BrandParams(
    brand="Acme Perfume",
    category="perfume brand",
    audiences=("young professionals",),
    competitors=("Rival Scents",),
    jobs_to_be_done=("find a signature scent",),
    cities=("Mumbai",),
    tasks=("choose a wedding fragrance",),
    use_cases=("everyday wear",),
)


class StubLLMProvider:
    """Deterministic stand-in for GeminiAdapter — no network."""

    def __init__(self):
        self.calls: list[str] = []

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        self.calls.append(prompt)
        original = prompt.split("Query: ", 1)[1]
        return CollectionResult(
            source_id="stub",
            source_kind="llm",
            model_version="stub-1",
            payload=f"[rephrased] {original}",
            latency_ms=1,
        )

    def quota_state(self) -> QuotaState:
        return QuotaState(remaining_today=None, daily_limit=None)


def test_generate_draft_without_llm_uses_canonical_text():
    draft = generate_draft(PARAMS)
    assert len(draft.queries) == 30  # 20 unprompted + 10 prompted (§3.4 sizing)
    assert any(q.text == "best perfume brand for young professionals" for q in draft.queries)


def test_generate_draft_with_llm_expands_every_query():
    stub = StubLLMProvider()
    draft = generate_draft(PARAMS, llm_provider=stub)
    assert len(stub.calls) == len(draft.queries)
    assert all(q.text.startswith("[rephrased] ") for q in draft.queries)


def test_generate_draft_splits_unprompted_and_prompted_correctly():
    draft = generate_draft(PARAMS)
    unprompted = [q for q in draft.queries if not q.is_brand_named]
    prompted = [q for q in draft.queries if q.is_brand_named]
    assert len(unprompted) == 20
    assert all(PARAMS.brand not in q.text for q in unprompted)
    assert all(PARAMS.brand in q.text for q in prompted)


def test_freeze_is_deterministic_for_identical_drafts():
    draft_a = generate_draft(PARAMS)
    draft_b = generate_draft(PARAMS)
    frozen_a = freeze(draft_a)
    frozen_b = freeze(draft_b)
    assert frozen_a.content_hash == frozen_b.content_hash


def test_freeze_hash_changes_when_brand_params_change():
    draft_a = generate_draft(PARAMS)
    other_params = BrandParams(brand="Acme Perfume", category="fragrance boutique")
    draft_b = generate_draft(other_params)
    frozen_a = freeze(draft_a)
    frozen_b = freeze(draft_b)
    assert frozen_a.content_hash != frozen_b.content_hash


def test_freeze_records_template_set_version_and_timestamp():
    draft = generate_draft(PARAMS)
    frozen = freeze(draft)
    assert frozen.template_set_version == "v1"
    assert frozen.frozen_at is not None
