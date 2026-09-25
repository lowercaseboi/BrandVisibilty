// Mirrors docs/CONTRACT.md (§1 ProviderInfo, §5 snapshot record, §7 HTTP API).
// Coverage/Prominence/SoV/composite here are computed only over the
// unprompted query subset (PRD §10.1) — the API doesn't send prompted data.

export interface BrandSummary {
  brand_key: string;
  brand: string;
  has_data: boolean;
  is_pilot?: boolean;
  /** Scored questions the next run would ask; null when the brand has data but no setup. */
  question_count?: number | null;
}

export interface CreateBrandRequest {
  name: string;
  category: string;
  cities: string[];
  audiences: string[];
  competitors: string[];
  aliases?: string[];
  jobs_to_be_done?: string[];
  /** Only feed brand-named (unscored) questions. */
  use_cases?: string[];
  tasks?: string[];
}

export type ProviderKind = "live" | "offline";

export interface ProviderInfo {
  provider_id: string;
  label: string;
  configured: boolean;
  model: string | null;
  kind: ProviderKind;
}

export type JobStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";

export type ProviderState = "queued" | "running" | "waiting" | "skipped" | "done";

/** One provider's share of a running job (CONTRACT §7). */
export interface ProviderProgress {
  provider_id: string;
  label: string;
  done: number;
  total: number;
  succeeded: number;
  failed: number;
  state: ProviderState;
  /** e.g. "waiting 40s — rate limited", "auto-skipped after 2 min without an answer" */
  note: string | null;
  /** Current retry wait in whole seconds while state === "waiting", else null. */
  wait_seconds?: number | null;
  /** Why the AI was skipped (state === "skipped"). */
  skip_reason?: "user" | "auto" | "failures" | "unavailable" | null;
}

export interface Job {
  job_id: string;
  brand_key: string;
  status: JobStatus;
  message: string;
  done: number;
  total: number;
  run_id: string | null;
  error: string | null;
  providers?: ProviderProgress[];
}

export interface StartRunRequest {
  providers?: string;
  samples?: number;
  // Synthetic demo data only; omit it and the backend picks the next round.
  round?: number;
}

export type QuestionSource = "template" | "custom";

export interface Question {
  id: number;
  text: string;
  intent_type: string;
  source: QuestionSource;
  enabled: boolean;
  // The question itself names the brand, so a mention is guaranteed: asked and
  // shown in Evidence, but excluded from scores (PRD §10.1).
  names_brand: boolean;
  scored: boolean;
}

export interface QuestionSet {
  brand_key: string;
  customized: boolean;
  questions: Question[];
  scored_count: number;
  unscored_count: number;
  /** Hash of the set the next run would use; compare with Snapshot.query_set_content_hash. */
  content_hash?: string;
}

export interface QuestionInput {
  text: string;
  intent_type?: string;
  source?: QuestionSource;
  enabled?: boolean;
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

export type GapType = "presence" | "prominence" | "representation" | "competitive" | "source";

export interface Gap {
  gap_id: string;
  gap_type: GapType | string;
  evidence_refs: string[];
  detail: Record<string, unknown>;
  is_inferred: boolean;
}

export interface Recommendation {
  recommendation_id: string;
  gap_id: string; // never null — PRD AC-7
  action: string;
  action_class: string;
  priority: number;
  delta_composite: number;
  confidence: number;
  effort: number;
  reasoning: string;
  evidence_refs: string[];
  drafted_by: string;
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

export type DataOrigin = "live" | "synthetic" | "replay";
export type EntityKind = "self" | "competitor" | "discovered";

export interface Mention {
  entity_id: string;
  entity_kind: EntityKind;
  rank: number;
  char_start: number;
  char_end: number;
  is_passing_mention: boolean;
}

export interface Observation {
  observation_id: string;
  query_id: string;
  query_text: string;
  intent_type: string | null;
  provider_id: string;
  model_version: string;
  response_text: string;
  mentions: Mention[];
  // false = brand-named question (query_id "p<i>"): shown, never scored. Absent = scored.
  scored?: boolean;
}

export interface ObservationsResponse {
  observations: Observation[];
  entities: Record<string, string>;
}

export interface Snapshot {
  brand_key: string;
  brand: string;
  run_id: string;
  status: "completed" | "partial" | string;
  data_origin?: DataOrigin;
  providers?: string[];
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
  recommendations?: Recommendation[];
  admission?: Partial<SnapshotAdmission>;
  entities?: Record<string, string>;
  /** Brand-named answers kept as evidence only (not in observation_count). */
  unscored_observation_count?: number;
  /** Scored answers only; keys are exactly the `entities` keys ("self" + competitors). */
  mention_summary?: MentionSummary;
}

export interface MentionSummary {
  total_answers: number;
  entities: Record<string, { answers_mentioning: number; answers_ranked_first: number }>;
}
