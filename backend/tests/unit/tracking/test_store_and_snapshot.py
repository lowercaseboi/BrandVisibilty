from datetime import UTC, datetime

from app.analysis.types import AnalysisResult, ProviderBreakdown
from app.tracking import store
from app.tracking.snapshot import build_snapshot

CONTRACT_KEYS = {
    "brand_key", "brand", "run_id", "status", "data_origin", "providers", "comparability_key",
    "collection_started_at", "collection_completed_at", "collection_span_days", "query_set_content_hash",
    "query_set_template_version", "sampling_config", "observation_count", "mentioned_count", "cluster_count",
    "analysis_result", "gaps", "recommendations", "admission", "entities", "raw_observations",
}
ADMISSION_KEYS = {
    "admissible", "status", "reasons", "query_coverage", "sample_completeness", "missing_query_ids",
    "missing_providers", "collection_span_days", "policy_version",
}


def _raw(provider: str, q: int, s: int) -> dict:
    return {
        "observation_id": f"{provider}:q{q}-s{s}", "query_id": f"q{q}", "query_text": "t", "intent_type": "x",
        "provider_id": provider, "model_version": "m-1", "response_text": "r", "mentions": [],
    }


def _snapshot(raw_observations: list[dict]) -> dict:
    now = datetime.now(UTC)
    result = AnalysisResult(0.5, 0.7, 0.4, 55.0, 40.0, 70.0, (ProviderBreakdown("synthetic", 0.5, 4, 2),), 4, 2, ("synthetic",))
    return build_snapshot(
        brand_key="demo", brand_name="Demo", entities={"self": "Demo"}, providers=["synthetic", "gemini"],
        query_ids=["q0", "q1"], samples_per_query=2, query_set_content_hash="abc", query_set_template_version="v1",
        sampling_config={"temperature": None, "system_prompt": None}, raw_observations=raw_observations,
        analysis_result=result, gaps=[], recommendations=[], started_at=now, completed_at=now,
    )


def test_build_snapshot_contract_keys_and_admission():
    snap = _snapshot([_raw("synthetic", q, s) for q in range(2) for s in range(2)])
    assert set(snap) == CONTRACT_KEYS
    assert set(snap["admission"]) == ADMISSION_KEYS
    assert snap["status"] == "partial"  # gemini produced nothing
    assert snap["data_origin"] == "live"
    assert snap["admission"]["missing_providers"] == ["gemini"]
    assert snap["admission"]["query_coverage"] == 1.0
    assert snap["admission"]["sample_completeness"] == 0.5
    assert snap["admission"]["admissible"] is False
    assert snap["sampling_config"]["samples_per_query"] == 2
    assert len(snap["comparability_key"]) == 16


def test_store_round_trip_skips_corrupt_lines(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    assert store.load_snapshots("demo") == [] and store.brand_keys_with_data() == set()
    first, second = _snapshot([_raw("synthetic", 0, 0)]), _snapshot([_raw("gemini", 1, 0)])
    store.append_snapshot(first)
    with (tmp_path / "tracking" / "demo.jsonl").open("a") as f:
        f.write('{"truncated": \n')
    store.append_snapshot(second)
    loaded = store.load_snapshots("demo")
    assert [s["run_id"] for s in loaded] == [first["run_id"], second["run_id"]]
    assert store.get_snapshot("demo", second["run_id"])["brand"] == "Demo"
    assert store.get_snapshot("demo", "missing") is None
    assert store.brand_keys_with_data() == {"demo"}
