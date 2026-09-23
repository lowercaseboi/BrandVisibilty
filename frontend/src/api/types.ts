// Mirrors backend/src/app/interface/schemas.py field-for-field.
// Coverage/Prominence/SoV/composite here are computed only over the
// unprompted query subset (PRD §10.1) — the API doesn't send prompted data.

export interface BrandSummary {
  brand_key: string;
  brand: string;
  has_data: boolean;
}

export interface ProviderBreakdown {
  provider_id: string;
  coverage: number;
  observation_count: number;
  mentioned_count: number;
}

export interface AnalysisResult {
  coverage: number;
  // null when Coverage = 0 — DESIGN §1.6/PRD §222: Prominence is undefined,
  // never a misleading 0, for a brand with no mentions.
  prominence: number | null;
  share_of_voice: number | null;
  composite_score: number;
  ci_low: number;
  ci_high: number;
  per_provider_coverage: ProviderBreakdown[];
}

export interface Gap {
  gap_type: string;
  evidence_refs: string[];
  detail: Record<string, unknown>;
  is_inferred: boolean;
}

export interface SnapshotAdmission {
  admissible: boolean;
  status: string;
  reasons: string[];
  query_coverage: number;
  sample_completeness: number;
  missing_query_ids: string[];
  missing_providers: string[];
  collection_span_days: number;
  policy_version: string;
}

export interface SamplingConfig {
  temperature: number | null;
  system_prompt: string | null;
  samples_per_query: number;
}

export interface Snapshot {
  brand_key: string;
  brand: string;
  run_id: string;
  status: string;
  comparability_key: string;
  collection_started_at: string;
  collection_completed_at: string;
  collection_span_days: number;
  query_set_content_hash: string;
  query_set_template_version: string;
  sampling_config: SamplingConfig;
  observation_count: number;
  mentioned_count: number;
  cluster_count: number;
  analysis_result: AnalysisResult;
  gaps: Gap[];
  admission: SnapshotAdmission;
}
