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

export interface BrandDeleteResponse {
  brand_key: string;
  deleted: boolean;
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
  /** AC-8 verdict on the history as of this run; only the newest snapshot carries it. */
  trend_verdict?: TrendVerdict;
}

export type TrendStatus =
  | "insufficient_data"
  | "no_change_detected"
  | "change_detected"
  | "no_clear_trend"
  | "improving"
  | "declining";

/** PRD §11.6 / AC-8 trend statistics over the latest comparable segment (same comparability_key,
 * admissible runs only). Scores and slopes are on the 0–100 scale — `toFractions` leaves them alone.
 * 2–3 runs: last two compared by CI overlap; 4+: Theil–Sen slope with a bootstrap CI. */
export interface TrendVerdict {
  status: TrendStatus;
  method: "none" | "ci_overlap" | "theil_sen";
  direction: "up" | "down" | null;
  n_points: number;
  n_excluded: number;
  comparability_key: string | null;
  first_run_id?: string | null;
  last_run_id?: string | null;
  previous_score?: number | null;
  previous_ci_low?: number | null;
  previous_ci_high?: number | null;
  latest_score?: number | null;
  latest_ci_low?: number | null;
  latest_ci_high?: number | null;
  delta?: number | null;
  /** "day": x = days since the first run; "run": x = run index (runs < 1 day apart). */
  x_unit?: "day" | "run" | null;
  /** Points per x_unit. */
  slope?: number | null;
  slope_ci_low?: number | null;
  slope_ci_high?: number | null;
  slope_per_week?: number | null;
  slope_per_week_ci_low?: number | null;
  slope_per_week_ci_high?: number | null;
  span_days?: number | null;
  bootstrap_iterations?: number | null;
  valid_resamples?: number | null;
}

export interface MentionSummary {
  total_answers: number;
  entities: Record<string, { answers_mentioning: number; answers_ranked_first: number }>;
}

// ---------------------------------------------------------------------------
// Brand profile (GET/PUT /brands/{key}) and recommendation board (GET/PUT /brands/{key}/board)
// ---------------------------------------------------------------------------

/** Everything saved about a brand. Pilot (sample) brands are read-only. */
export interface BrandProfile {
  brand_key: string;
  brand: string;
  is_pilot: boolean;
  category: string;
  cities: string[];
  competitors: string[];
  aliases: string[];
  audiences: string[];
  jobs_to_be_done: string[];
}

/** PUT /brands/{key} body. Same validation as CreateBrandRequest; 403 for a pilot brand. */
export interface UpdateBrandRequest {
  name: string;
  category: string;
  cities: string[];
  audiences: string[];
  competitors: string[];
  aliases?: string[];
  jobs_to_be_done?: string[];
}

/** Kanban columns (PRD §11.4 decisions: approve → in progress/done, reject, save for later). */
export type BoardColumn = "suggested" | "saved" | "in_progress" | "done" | "rejected";

export const BOARD_COLUMNS: BoardColumn[] = ["suggested", "saved", "in_progress", "done", "rejected"];

export interface BoardCardState {
  column: BoardColumn;
  /** Position within its column, ascending. */
  order: number;
  updated_at: string;
}

/** Keyed by the stable suggestion group key (`action|competitor_id`), so it survives across runs. */
export interface BoardState {
  brand_key: string;
  cards: Record<string, BoardCardState>;
}
