"""normalization.observations — StoredResponse -> Observation/PromptedObservation (L3 seam,
previously inlined in scripts/run_tracking_loop.py)."""

from __future__ import annotations

from app.analysis.types import EntityAlias
from app.collection.store import StoredResponse
from app.normalization.observations import to_observations, to_prompted_observations

ALIASES = (EntityAlias("self", "self", ("Acme",)),)


def _record(**overrides) -> StoredResponse:
    defaults = dict(
        schema_version=1,
        captured_at="2026-09-02T12:00:00+00:00",
        run_id="2026-W36",
        brand_key="acme",
        query_set_hash="hash",
        sampling_hash="samp",
        provider_id="gemini",
        model_id="m",
        model_version="m-001",
        query_id="q1",
        query_text="best widget maker",
        intent_type="category_discovery",
        is_brand_named=False,
        sample_index=0,
        status="ok",
        response_text="Acme is a great choice.",
    )
    defaults.update(overrides)
    return StoredResponse(**defaults)


def test_ok_unprompted_record_becomes_an_observation_with_mentions():
    observations = to_observations([_record()], ALIASES)
    assert len(observations) == 1
    obs = observations[0]
    assert obs.query_id == "q1"
    assert obs.provider_id == "gemini"
    assert obs.mention_of("self") is not None


def test_failed_records_are_skipped():
    observations = to_observations([_record(status="failed", response_text=None)], ALIASES)
    assert observations == ()


def test_prompted_records_excluded_by_default():
    observations = to_observations([_record(is_brand_named=True)], ALIASES)
    assert observations == ()


def test_include_prompted_when_requested():
    observations = to_observations([_record(is_brand_named=True)], ALIASES, unprompted_only=False)
    assert len(observations) == 1


def test_intent_type_propagates():
    observations = to_observations([_record(intent_type="local_contextual")], ALIASES)
    assert observations[0].intent_type == "local_contextual"


def test_prompted_observations_only_from_brand_named_ok_records():
    records = [
        _record(is_brand_named=True, response_text="Acme is affordable and fast."),
        _record(is_brand_named=False),  # unprompted, excluded
        _record(is_brand_named=True, status="failed", response_text=None),  # failed, excluded
    ]
    prompted = to_prompted_observations(records, claimed_attribute_vocabulary=("affordable", "fast", "slow"))
    assert len(prompted) == 1
    assert prompted[0].claimed_attributes == frozenset({"affordable", "fast"})
