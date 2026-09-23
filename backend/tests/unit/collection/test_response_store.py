"""FileResponseStore / InMemoryResponseStore — the resumable per-sample cache
(DESIGN_v1 §3.4's fixture-set guidance, file-mode `raw_observation`)."""

from __future__ import annotations

from app.collection.store import (
    FileResponseStore,
    InMemoryResponseStore,
    SampleKey,
    StoredResponse,
    sanitize_path_segment,
)


def _key(**overrides) -> SampleKey:
    defaults = dict(
        run_id="2026-W36",
        query_set_hash="abc123def456abc123def456",
        sampling_hash="samp001",
        provider_id="gemini",
        model_id="gemini-3.6-flash",
        query_id="q0a1b2c3d4",
        sample_index=0,
    )
    defaults.update(overrides)
    return SampleKey(**defaults)


def _record(key: SampleKey, *, status="ok") -> StoredResponse:
    return StoredResponse(
        schema_version=1,
        captured_at="2026-09-02T12:00:00+00:00",
        run_id=key.run_id,
        brand_key="gajanan_vada_pav",
        query_set_hash=key.query_set_hash,
        sampling_hash=key.sampling_hash,
        provider_id=key.provider_id,
        model_id=key.model_id,
        model_version="gemini-3.6-flash-001",
        query_id=key.query_id,
        query_text="best vada pav for students",
        intent_type="category_discovery",
        is_brand_named=False,
        sample_index=key.sample_index,
        status=status,
        response_text="hello" if status == "ok" else None,
        error=None if status == "ok" else {"kind": "rate_limited"},
    )


def test_round_trip_put_then_get(tmp_path):
    store = FileResponseStore(tmp_path)
    key = _key()
    record = _record(key)
    assert not store.has(key)
    store.put(key, record)
    assert store.has(key)
    fetched = store.get(key)
    assert fetched is not None
    assert fetched.response_text == "hello"


def test_failure_record_never_shadows_an_ok_record(tmp_path):
    store = FileResponseStore(tmp_path)
    key = _key()
    store.put(key, _record(key, status="ok"))
    store.put_failure(key, _record(key, status="failed"))
    assert store.has(key)
    assert store.get(key).status == "ok"


def test_has_is_false_when_only_a_failure_exists(tmp_path):
    store = FileResponseStore(tmp_path)
    key = _key()
    store.put_failure(key, _record(key, status="failed"))
    assert not store.has(key)
    assert store.get(key) is None


def test_model_ids_with_slashes_produce_distinct_paths(tmp_path):
    store = FileResponseStore(tmp_path)
    key_a = _key(model_id="meta-llama/llama-4-scout:free")
    key_b = _key(model_id="meta-llama/llama-4-maverick:free")
    store.put(key_a, _record(key_a))
    store.put(key_b, _record(key_b))
    assert store.has(key_a)
    assert store.has(key_b)
    assert sanitize_path_segment(key_a.model_id) != sanitize_path_segment(key_b.model_id)


def test_iter_run_yields_only_matching_run_and_query_set(tmp_path):
    store = FileResponseStore(tmp_path)
    key_this_run = _key()
    key_other_run = _key(run_id="2026-W37", query_id="q_other")
    store.put(key_this_run, _record(key_this_run))
    store.put(key_other_run, _record(key_other_run))
    results = list(
        store.iter_run(run_id="2026-W36", query_set_hash="abc123def456abc123def456")
    )
    assert len(results) == 1
    assert results[0].query_id == key_this_run.query_id


def test_iter_run_skips_failed_records(tmp_path):
    store = FileResponseStore(tmp_path)
    key = _key()
    store.put_failure(key, _record(key, status="failed"))
    results = list(store.iter_run(run_id=key.run_id, query_set_hash=key.query_set_hash))
    assert results == []


def test_in_memory_store_round_trip():
    store = InMemoryResponseStore()
    key = _key()
    assert not store.has(key)
    store.put(key, _record(key))
    assert store.has(key)
    assert list(store.iter_run(run_id=key.run_id, query_set_hash=key.query_set_hash))
