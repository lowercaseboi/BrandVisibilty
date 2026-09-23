"""Snapshot admissibility gate — the rule that would have kept the 1/34 degenerate run
out of the trend series (DESIGN_v1 §6.x comparability, §4.5, §1.4)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.orchestration.collection_runner import CollectionReport, ProviderRunStats
from app.tracking.snapshot import AdmissibilityPolicy, comparability_key, evaluate_admission, model_fingerprint

START = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)


def _report(
    *,
    planned_query_ids,
    collected_query_ids,
    planned,
    newly_collected,
    from_cache,
    per_provider,
    resolved_model_versions=None,
    started_at=START,
    completed_at=None,
) -> CollectionReport:
    completed_at = completed_at or (started_at + timedelta(minutes=10))
    return CollectionReport(
        planned=planned,
        from_cache=from_cache,
        newly_collected=newly_collected,
        failed=planned - newly_collected - from_cache,
        skipped=0,
        per_provider=per_provider,
        planned_query_ids=frozenset(planned_query_ids),
        collected_query_ids=frozenset(collected_query_ids),
        resolved_model_versions=resolved_model_versions or {},
        started_at=started_at,
        completed_at=completed_at,
        stopped_early=False,
        stop_reason=None,
    )


def test_the_134_style_run_is_inadmissible_and_partial():
    query_ids = {f"q{i}" for i in range(17)}
    report = _report(
        planned_query_ids=query_ids,
        collected_query_ids={"q2"},  # only 1 of 17 queries got a sample
        planned=34,
        newly_collected=1,
        from_cache=0,
        per_provider={"gemini:m": ProviderRunStats(planned=34, ok=1, failed=33)},
    )
    admission = evaluate_admission(report)
    assert not admission.admissible
    assert admission.status == "PARTIAL"
    assert any("query_coverage" in reason for reason in admission.reasons)


def test_a_full_run_is_admissible_and_complete():
    query_ids = {f"q{i}" for i in range(17)}
    report = _report(
        planned_query_ids=query_ids,
        collected_query_ids=query_ids,
        planned=85,
        newly_collected=85,
        from_cache=0,
        per_provider={"gemini:m": ProviderRunStats(planned=85, ok=85)},
        resolved_model_versions={"gemini:m": frozenset({"gemini-3.6-flash-001"})},
    )
    admission = evaluate_admission(report)
    assert admission.admissible
    assert admission.status == "COMPLETE"
    assert admission.reasons == ()


def test_one_missing_query_is_inadmissible_even_at_high_sample_completeness():
    query_ids = {f"q{i}" for i in range(20)}
    collected = query_ids - {"q19"}  # 19 of 20 queries collected, high raw completeness
    report = _report(
        planned_query_ids=query_ids,
        collected_query_ids=collected,
        planned=100,
        newly_collected=95,  # 95% sample completeness, above the 0.8 soft threshold
        from_cache=0,
        per_provider={"gemini:m": ProviderRunStats(planned=100, ok=95, failed=5)},
    )
    admission = evaluate_admission(report)
    assert not admission.admissible
    assert "q19" in admission.missing_query_ids


def test_two_model_versions_in_one_run_is_inadmissible():
    query_ids = {f"q{i}" for i in range(15)}
    report = _report(
        planned_query_ids=query_ids,
        collected_query_ids=query_ids,
        planned=75,
        newly_collected=75,
        from_cache=0,
        per_provider={"gemini:m": ProviderRunStats(planned=75, ok=75)},
        resolved_model_versions={"gemini:m": frozenset({"gemini-3.6-flash-001", "gemini-3.6-flash-002"})},
    )
    admission = evaluate_admission(report)
    assert not admission.admissible
    assert any("distinct model versions" in reason for reason in admission.reasons)


def test_collection_span_over_policy_max_is_inadmissible():
    query_ids = {f"q{i}" for i in range(15)}
    report = _report(
        planned_query_ids=query_ids,
        collected_query_ids=query_ids,
        planned=75,
        newly_collected=75,
        from_cache=0,
        per_provider={"gemini:m": ProviderRunStats(planned=75, ok=75)},
        started_at=START,
        completed_at=START + timedelta(days=5),
    )
    admission = evaluate_admission(report)
    assert not admission.admissible
    assert any("collection_span_days" in reason for reason in admission.reasons)


def test_below_min_clusters_is_inadmissible():
    query_ids = {f"q{i}" for i in range(3)}
    report = _report(
        planned_query_ids=query_ids,
        collected_query_ids=query_ids,
        planned=15,
        newly_collected=15,
        from_cache=0,
        per_provider={"gemini:m": ProviderRunStats(planned=15, ok=15)},
    )
    admission = evaluate_admission(report, AdmissibilityPolicy(min_clusters=10))
    assert not admission.admissible
    assert any("cluster_count" in reason for reason in admission.reasons)


def test_policy_version_is_recorded_on_the_verdict():
    query_ids = {"q0"}
    report = _report(
        planned_query_ids=query_ids,
        collected_query_ids=query_ids,
        planned=1,
        newly_collected=1,
        from_cache=0,
        per_provider={"gemini:m": ProviderRunStats(planned=1, ok=1)},
    )
    admission = evaluate_admission(report, AdmissibilityPolicy(policy_version="v2-test", min_clusters=1))
    assert admission.policy_version == "v2-test"


def test_comparability_key_stable_under_provider_reordering():
    fp_a = model_fingerprint({"gemini:m": frozenset({"v1"}), "groq:m2": frozenset({"v2"})})
    fp_b = model_fingerprint({"groq:m2": frozenset({"v2"}), "gemini:m": frozenset({"v1"})})
    assert fp_a == fp_b
    key_a = comparability_key("qshash", {"temperature": None}, fp_a)
    key_b = comparability_key("qshash", {"temperature": None}, fp_b)
    assert key_a == key_b


def test_comparability_key_changes_when_resolved_version_changes():
    fp_before = model_fingerprint({"gemini:m": frozenset({"gemini-3.6-flash-001"})})
    fp_after = model_fingerprint({"gemini:m": frozenset({"gemini-3.6-flash-002"})})
    key_before = comparability_key("qshash", {"temperature": None}, fp_before)
    key_after = comparability_key("qshash", {"temperature": None}, fp_after)
    assert key_before != key_after
