from datetime import UTC, datetime

from app import paths
from app.analysis.types import AnalysisResult, EntityAlias, ProviderBreakdown
from app.tracking import store
from app.tracking.snapshot import build_snapshot, comparability_key, data_origin

CONTRACT_KEYS = {
    "brand_key", "brand", "run_id", "status", "data_origin", "providers", "comparability_key",
    "collection_started_at", "collection_completed_at", "collection_span_days", "query_set_content_hash",
    "query_set_template_version", "sampling_config", "observation_count", "mentioned_count", "cluster_count",
    "analysis_result", "gaps", "recommendations", "admission", "entities", "raw_observations",
    "recommendation_status", "recommendation_error", "recommendations_total",
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
    assert snap["data_origin"] == "synthetic"  # any synthetic provider taints the run
    assert snap["admission"]["missing_providers"] == ["gemini"]
    assert snap["admission"]["query_coverage"] == 1.0
    assert snap["admission"]["sample_completeness"] == 0.5
    assert snap["admission"]["admissible"] is False
    assert snap["sampling_config"]["samples_per_query"] == 2
    assert len(snap["comparability_key"]) == 16


def test_store_round_trip_skips_corrupt_lines(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
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


def test_data_origin_synthetic_taints_and_offline_is_replay():
    assert data_origin(["synthetic", "replay"]) == "synthetic"
    assert data_origin(["synthetic", "groq"]) == "synthetic"  # fake answers are never "live"
    assert data_origin(["synthetic"]) == "synthetic"
    assert data_origin(["replay"]) == "replay"
    assert data_origin(["groq"]) == "live"
    assert data_origin(["replay", "groq"]) == "live"


def test_comparability_key_changes_when_the_entity_alias_table_changes():
    """Editing competitors or aliases changes what the mention detector counts as a match
    (Coverage/SoV/COMPETITIVE-gap inputs) without necessarily changing the query text, so
    the alias table must be part of the comparability key or runs would silently mix."""
    base_table = (
        EntityAlias("self", "self", ("Demo",)),
        EntityAlias("rival_a", "competitor", ("Rival A",)),
    )
    same_but_reordered = (
        EntityAlias("rival_a", "competitor", ("Rival A",)),
        EntityAlias("self", "self", ("Demo",)),
    )
    extra_self_alias = (
        EntityAlias("self", "self", ("Demo", "Demo Co")),
        EntityAlias("rival_a", "competitor", ("Rival A",)),
    )
    extra_competitor = base_table + (EntityAlias("rival_b", "competitor", ("Rival B",)),)

    key_a = comparability_key("h", {}, ["m1"], base_table)
    key_b = comparability_key("h", {}, ["m1"], same_but_reordered)
    key_c = comparability_key("h", {}, ["m1"], extra_self_alias)
    key_d = comparability_key("h", {}, ["m1"], extra_competitor)
    key_no_table = comparability_key("h", {}, ["m1"])

    assert len(key_a) == 16
    assert key_a == key_b  # order of entities/aliases doesn't matter, only membership
    assert key_a != key_c  # a new alias on an existing entity changes the key
    assert key_a != key_d  # an added/removed competitor changes the key
    assert key_a != key_no_table  # the default (no table passed) is its own, different key

    # Same story end-to-end through build_snapshot: only the alias table differs.
    result = AnalysisResult(0.5, 0.7, 0.4, 55.0, 40.0, 70.0, (ProviderBreakdown("synthetic", 0.5, 1, 1),), 1, 1, ("synthetic",))
    now = datetime.now(UTC)

    def snap_with(table):
        return build_snapshot(
            brand_key="demo", brand_name="Demo", entities={"self": "Demo"}, providers=["synthetic"],
            query_ids=["q0"], samples_per_query=1, query_set_content_hash="abc",
            query_set_template_version="v1", sampling_config={"temperature": None, "system_prompt": None},
            raw_observations=[_raw("synthetic", 0, 0)], analysis_result=result, gaps=[], recommendations=[],
            started_at=now, completed_at=now, entity_alias_table=table,
        )

    before = snap_with(base_table)
    after_new_competitor = snap_with(extra_competitor)
    after_new_alias = snap_with(extra_self_alias)
    unchanged_reorder = snap_with(same_but_reordered)
    assert before["comparability_key"] == unchanged_reorder["comparability_key"]
    assert before["comparability_key"] != after_new_competitor["comparability_key"]
    assert before["comparability_key"] != after_new_alias["comparability_key"]


def test_normalize_snapshot_defaults_unscored_observation_count():
    from app.interface.snapshots import normalize_snapshot

    legacy = normalize_snapshot({"brand_key": "demo", "raw_observations": [{"query_id": "q0"}]})
    assert legacy["unscored_observation_count"] == 0
    mixed = normalize_snapshot(
        {"run_id": "r", "raw_observations": [{"scored": True}, {"scored": False}, {"scored": False}]}
    )
    assert mixed["unscored_observation_count"] == 2
    stored = normalize_snapshot({"run_id": "r", "unscored_observation_count": 5, "raw_observations": []})
    assert stored["unscored_observation_count"] == 5


def test_build_snapshot_records_recommendation_status_and_total():
    snap = _snapshot([_raw("synthetic", 0, 0)])
    assert (snap["recommendation_status"], snap["recommendation_error"], snap["recommendations_total"]) == ("ok", None, 0)
    now = datetime.now(UTC)
    result = AnalysisResult(0.5, 0.7, 0.4, 55.0, 40.0, 70.0, (), 1, 1, ("synthetic",))
    capped = build_snapshot(
        brand_key="demo", brand_name="Demo", entities={}, providers=["synthetic"], query_ids=["q0"], samples_per_query=1,
        query_set_content_hash="abc", query_set_template_version="v1", sampling_config={}, raw_observations=[],
        analysis_result=result, gaps=[], recommendations=[{"recommendation_id": "rec-1", "gap_id": "gap-1"}],
        started_at=now, completed_at=now, recommendations_total=14,
        recommendation_status="failed", recommendation_error="ZeroDivisionError: division by zero",
    )
    assert capped["recommendations_total"] == 14 and capped["recommendation_status"] == "failed"
    assert capped["recommendation_error"] == "ZeroDivisionError: division by zero"


def test_old_snapshots_normalise_to_ok_with_backfilled_counts():
    from app.interface.schemas import Snapshot
    from app.interface.snapshots import normalize_snapshot

    old_rec = {"recommendation_id": "rec-1", "gap_id": "gap-1", "action": "faq_page", "evidence_refs": ["o1", "o2"],
               "reasoning": "English only."}
    snap = normalize_snapshot({"run_id": "r", "brand_key": "demo", "recommendations": [old_rec], "raw_observations": []})
    assert snap["recommendation_status"] == "ok" and snap["recommendation_error"] is None
    assert snap["recommendations_total"] == 1
    (rec,) = snap["recommendations"]
    assert rec["evidence_count"] == 2 and "reasoning_key" not in rec  # UI falls back to `reasoning`
    Snapshot.model_validate({**snap, "mention_summary": {"total_answers": 0, "entities": {}}})

    # a stored total below the list length (or garbage) can't claim fewer than are shown
    odd = normalize_snapshot({"run_id": "r", "recommendations": [old_rec], "recommendations_total": 0,
                              "recommendation_status": "weird"})
    assert odd["recommendations_total"] == 1 and odd["recommendation_status"] == "ok"
    kept = normalize_snapshot({"run_id": "r", "recommendations": [{**old_rec, "evidence_count": 7}],
                               "recommendations_total": 14, "recommendation_status": "failed",
                               "recommendation_error": "KeyError: 'x'"})
    assert kept["recommendations_total"] == 14 and kept["recommendations"][0]["evidence_count"] == 7
    assert (kept["recommendation_status"], kept["recommendation_error"]) == ("failed", "KeyError: 'x'")
