"""End-to-end replay test against a curated fixture set (DESIGN_v1 §3.4's "run against a
cached-response fixture set rather than live providers" made real).

Not skipif-gated — this runs in CI forever with no API key and no network, exercising the
collection runner, the response store, normalization, Scorer, and the admissibility gate
together. It is the permanent regression test the project's live-only smoke tests
(test_gemini_smoke.py / test_groq_smoke.py) can't provide on their own, since those are
skipped whenever no key is configured.

Fixtures live under tests/fixtures/responses/fixture_brand/ — 2 queries x 2 samples x 2
providers, written directly via FileResponseStore/StoredResponse rather than through the
real template generator, so the fixture's content is independent of any future change to
the query-template taxonomy.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.analysis.scorer import score
from app.analysis.types import EntityAlias
from app.collection.limits import ProviderLimits
from app.collection.store import FileResponseStore
from app.collection.types import QuotaState, SamplingParams
from app.normalization.observations import to_observations
from app.orchestration.collection_runner import CollectionPlan, ProviderHandle, collect
from app.querysets.generator import Query, QuerySet
from app.tracking.snapshot import AdmissibilityPolicy, evaluate_admission

FIXTURES_ROOT = Path(__file__).resolve().parent.parent / "fixtures" / "responses"

QUERY_SET_HASH = "fixturequerysethash1234567890ab"
RUN_ID = "fixture-run"

QUERIES = (
    Query(text="best widget maker for households", intent_type="category_discovery", is_brand_named=False),
    Query(text="widget maker in Springfield", intent_type="local_contextual", is_brand_named=False),
)

ALIASES = (
    EntityAlias("self", "self", ("Acme Widgets",)),
    EntityAlias("competitor_bolt", "competitor", ("Bolt & Co",)),
)


class NeverCalledProvider:
    """Fails the test loudly if `collect(..., replay_only=True)` ever reaches a provider."""

    def query(self, prompt, params):
        raise AssertionError("replay_only=True must never call a provider")

    def quota_state(self):
        return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)


def _fixture_query_set() -> QuerySet:
    return QuerySet(
        template_set_version="v1",
        brand="Fixture Brand",
        queries=QUERIES,
        sampling_config={"temperature": None, "system_prompt": None},
        content_hash=QUERY_SET_HASH,
        frozen_at=datetime(2026, 9, 2, 12, tzinfo=UTC),
    )


def test_replay_only_run_reproduces_the_fixture_set_with_zero_network_calls():
    query_set = _fixture_query_set()
    providers = (
        ProviderHandle(
            limits=ProviderLimits(provider_id="gemini", model_id="gemini-3.6-flash", rpm=10, rpd=1500),
            provider=NeverCalledProvider(),
        ),
        ProviderHandle(
            limits=ProviderLimits(provider_id="groq", model_id="openai/gpt-oss-20b", rpm=30, rpd=1000),
            provider=NeverCalledProvider(),
        ),
    )
    plan = CollectionPlan(
        brand_key="fixture_brand",
        run_id=RUN_ID,
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=providers,
        samples_per_query=2,
        include_prompted=False,
    )
    store = FileResponseStore(FIXTURES_ROOT / "fixture_brand")

    report = collect(plan, store, replay_only=True)

    assert report.newly_collected == 0
    assert report.from_cache == 8  # 2 queries x 2 samples x 2 providers
    assert report.failed == 0
    assert report.skipped == 0
    assert len(report.collected_query_ids) == 2


def test_replayed_fixtures_score_as_expected_through_the_full_pipeline():
    """Confirms the fixture data is wired correctly end to end: replay -> normalize ->
    score. Every fixture response mentions "Acme Widgets" at least once, so coverage
    must be 1.0 — this is the "expected coverage figure" the fixture set is designed to
    make obvious to a reader, not an arbitrary regression number."""
    query_set = _fixture_query_set()
    providers = (
        ProviderHandle(
            limits=ProviderLimits(provider_id="gemini", model_id="gemini-3.6-flash", rpm=10, rpd=1500),
            provider=NeverCalledProvider(),
        ),
        ProviderHandle(
            limits=ProviderLimits(provider_id="groq", model_id="openai/gpt-oss-20b", rpm=30, rpd=1000),
            provider=NeverCalledProvider(),
        ),
    )
    plan = CollectionPlan(
        brand_key="fixture_brand",
        run_id=RUN_ID,
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=providers,
        samples_per_query=2,
        include_prompted=False,
    )
    store = FileResponseStore(FIXTURES_ROOT / "fixture_brand")
    report = collect(plan, store, replay_only=True)

    records = list(store.iter_run(run_id=RUN_ID, query_set_hash=QUERY_SET_HASH))
    observations = to_observations(records, ALIASES)
    result = score(list(observations), "self", frozenset({"competitor_bolt"}))

    assert result.observation_count == 8
    assert result.coverage == 1.0  # every fixture response mentions Acme Widgets
    assert 0.0 < result.share_of_voice <= 1.0  # Bolt & Co appears in some responses too

    # Only 2 clusters in this tiny fixture — deliberately below the default min_clusters
    # (10), so admission is evaluated against a relaxed policy scoped to this test rather
    # than asserting COMPLETE against production thresholds a 2-query fixture can't meet.
    admission = evaluate_admission(report, AdmissibilityPolicy(min_clusters=2))
    assert admission.admissible
    assert admission.status == "COMPLETE"
    assert admission.query_coverage == 1.0
