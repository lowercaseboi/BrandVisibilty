"""collection_runner.collect — fan-out, resume-from-cache, circuit-aware skipping, and
sample-major iteration order (DESIGN_v1 §1.4, §6.2/§6.3 balanced-coverage rationale)."""

from __future__ import annotations

from app.collection.errors import CircuitOpenError, ProviderErrorInfo, QuotaExhaustedError
from app.collection.limits import ProviderLimits
from app.collection.store import InMemoryResponseStore
from app.collection.types import CollectionResult, QuotaState, SamplingParams
from app.orchestration.collection_runner import CollectionPlan, ProviderHandle, collect
from app.querysets.generator import Query, QuerySet


def _query_set(n_unprompted=3, n_prompted=1) -> QuerySet:
    queries = tuple(
        Query(text=f"unprompted query {i}", intent_type="category_discovery", is_brand_named=False)
        for i in range(n_unprompted)
    ) + tuple(
        Query(text=f"prompted query {i}", intent_type="identity", is_brand_named=True)
        for i in range(n_prompted)
    )
    return QuerySet(
        template_set_version="v1",
        brand="Test Brand",
        queries=queries,
        sampling_config={"temperature": None},
        content_hash="deadbeefcafebabe0000",
        frozen_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )


class ScriptedProvider:
    """Returns a scripted CollectionResult (or raises a scripted exception) per call, in order."""

    def __init__(self, effects):
        self._effects = list(effects)
        self.calls: list[str] = []

    def query(self, prompt, params):
        self.calls.append(prompt)
        effect = self._effects.pop(0)
        if isinstance(effect, Exception):
            raise effect
        return effect

    def quota_state(self):
        return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)


def _result(text="response text", version="model-v1"):
    return CollectionResult(
        source_id="gemini", source_kind="llm", model_version=version, payload=text, latency_ms=5
    )


def _limits(provider_id="gemini", model_id="m") -> ProviderLimits:
    return ProviderLimits(provider_id=provider_id, model_id=model_id, rpm=100, rpd=1000)


def test_full_plan_collects_every_query_times_sample_times_provider():
    query_set = _query_set(n_unprompted=2, n_prompted=0)
    provider = ScriptedProvider([_result() for _ in range(4)])  # 2 queries x 2 samples
    plan = CollectionPlan(
        brand_key="b",
        run_id="2026-W36",
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=(ProviderHandle(limits=_limits(), provider=provider),),
        samples_per_query=2,
        include_prompted=False,
    )
    store = InMemoryResponseStore()
    report = collect(plan, store)
    assert report.newly_collected == 4
    assert report.from_cache == 0
    assert report.failed == 0
    assert len(provider.calls) == 4


def test_prepopulated_store_yields_zero_provider_calls():
    query_set = _query_set(n_unprompted=1, n_prompted=0)
    plan = CollectionPlan(
        brand_key="b",
        run_id="2026-W36",
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=(ProviderHandle(limits=_limits(), provider=ScriptedProvider([])),),
        samples_per_query=1,
        include_prompted=False,
    )
    store = InMemoryResponseStore()
    # First run populates the store.
    provider_first = ScriptedProvider([_result()])
    plan_first = CollectionPlan(
        brand_key="b",
        run_id="2026-W36",
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=(ProviderHandle(limits=_limits(), provider=provider_first),),
        samples_per_query=1,
        include_prompted=False,
    )
    collect(plan_first, store)

    # Second run against the same store must not call the provider at all.
    report = collect(plan, store)
    assert report.from_cache == 1
    assert report.newly_collected == 0


def test_quota_exhausted_opens_circuit_and_remaining_tuples_are_skipped():
    query_set = _query_set(n_unprompted=3, n_prompted=0)
    error = QuotaExhaustedError(
        ProviderErrorInfo(provider_id="gemini", model_id="m", quota_id="PerDay", quota_scope="day")
    )

    class OpensAfterFirstCall:
        def __init__(self):
            self.calls = 0
            self._open = False

        def query(self, prompt, params):
            self.calls += 1
            if self._open:
                raise CircuitOpenError(ProviderErrorInfo(provider_id="gemini", model_id="m"))
            self._open = True
            raise error

        def quota_state(self):
            return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)

    provider = OpensAfterFirstCall()
    plan = CollectionPlan(
        brand_key="b",
        run_id="2026-W36",
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=(ProviderHandle(limits=_limits(), provider=provider),),
        samples_per_query=1,
        include_prompted=False,
    )
    report = collect(plan, InMemoryResponseStore())
    assert report.failed == 1  # the QuotaExhaustedError itself
    assert report.skipped == 2  # remaining two queries hit the (now open) circuit
    assert report.stopped_early
    assert provider.calls == 3


def test_other_provider_keeps_going_when_one_providers_circuit_is_open():
    query_set = _query_set(n_unprompted=2, n_prompted=0)
    exhausted_provider = ScriptedProvider(
        [
            QuotaExhaustedError(
                ProviderErrorInfo(provider_id="gemini", model_id="m", quota_id="PerDay", quota_scope="day")
            ),
            CircuitOpenError(ProviderErrorInfo(provider_id="gemini", model_id="m")),
        ]
    )
    healthy_provider = ScriptedProvider([_result(), _result()])
    plan = CollectionPlan(
        brand_key="b",
        run_id="2026-W36",
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=(
            ProviderHandle(limits=_limits("gemini", "m"), provider=exhausted_provider),
            ProviderHandle(limits=_limits("groq", "m2"), provider=healthy_provider),
        ),
        samples_per_query=1,
        include_prompted=False,
    )
    report = collect(plan, InMemoryResponseStore())
    assert not report.stopped_early  # groq is still healthy
    assert report.per_provider["groq:m2"].ok >= 1


def test_replay_only_never_calls_the_provider():
    query_set = _query_set(n_unprompted=2, n_prompted=0)
    provider = ScriptedProvider([])  # would raise IndexError if ever called
    plan = CollectionPlan(
        brand_key="b",
        run_id="2026-W36",
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=(ProviderHandle(limits=_limits(), provider=provider),),
        samples_per_query=1,
        include_prompted=False,
    )
    report = collect(plan, InMemoryResponseStore(), replay_only=True)
    assert report.skipped == 2
    assert provider.calls == []


def test_iteration_order_is_sample_major_first_batch_covers_all_queries():
    query_set = _query_set(n_unprompted=4, n_prompted=0)
    provider = ScriptedProvider([_result() for _ in range(8)])  # 4 queries x 2 samples
    plan = CollectionPlan(
        brand_key="b",
        run_id="2026-W36",
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=(ProviderHandle(limits=_limits(), provider=provider),),
        samples_per_query=2,
        include_prompted=False,
    )
    seen_prompts_first_four = []

    def on_progress(outcome):
        pass

    # Confirm by construction: the first `len(queries)` calls are one per distinct query
    # (sample_index=0 for all), not multiple samples of the query at index 0.
    collect(plan, InMemoryResponseStore(), on_progress=on_progress)
    first_four_prompts = provider.calls[:4]
    assert len(set(first_four_prompts)) == 4  # four distinct queries, not one repeated
