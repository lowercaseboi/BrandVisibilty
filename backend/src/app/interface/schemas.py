"""Pydantic response models mirroring the on-disk tracking snapshot shape exactly.

Field sets match what `scripts/run_tracking_loop.py` actually serializes, not the full
`analysis.types.AnalysisResult` dataclass — e.g. `observation_count`/`mentioned_count`/
`cluster_count` live at the top-level snapshot, not inside `analysis_result`, and
`participating_providers` isn't serialized at all.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProviderBreakdown(BaseModel):
    model_config = ConfigDict(extra="ignore")

    provider_id: str
    coverage: float
    observation_count: int
    mentioned_count: int


class AnalysisResultOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    coverage: float
    prominence: float | None
    share_of_voice: float | None
    composite_score: float
    ci_low: float
    ci_high: float
    per_provider_coverage: list[ProviderBreakdown]


class GapOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    gap_type: str
    evidence_refs: list[str]
    detail: dict
    is_inferred: bool


class SnapshotAdmissionOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    admissible: bool
    status: str
    reasons: list[str]
    query_coverage: float
    sample_completeness: float
    missing_query_ids: list[str]
    missing_providers: list[str]
    collection_span_days: float
    policy_version: str


class SamplingConfigOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    temperature: float | None
    system_prompt: str | None
    samples_per_query: int


class Snapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    brand_key: str
    brand: str
    run_id: str
    status: str
    comparability_key: str
    collection_started_at: datetime
    collection_completed_at: datetime
    collection_span_days: float
    query_set_content_hash: str
    query_set_template_version: str
    sampling_config: SamplingConfigOut
    observation_count: int
    mentioned_count: int
    cluster_count: int
    analysis_result: AnalysisResultOut
    gaps: list[GapOut]
    admission: SnapshotAdmissionOut


class BrandSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    brand_key: str
    brand: str
    has_data: bool
