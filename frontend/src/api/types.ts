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

export type JobStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled" | "interrupted";

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
  /** "analysis" (a run) or "campaign" (Campaign Studio drafting); absent from older servers. */
  kind?: "analysis" | "campaign";
  /** The campaign being drafted when kind === "campaign". */
  campaign_id?: string | null;
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

/**
 * Scales, exactly as the backend sends them (no conversion in api/client.ts):
 * - `composite_score`, `ci_low`, `ci_high`: 0–100 points (scorer.py), like every score in
 *   `TrendVerdict`. Round with `scoreOutOf100` / `toScore` for display.
 * - `coverage`, `prominence`, `share_of_voice` (and `ProviderBreakdown.coverage`): 0–1 fractions,
 *   shown as percentages via `fmt.percent`.
 * The composite is renormalised over whichever components are defined (not null); see
 * `measuredParts` in format.ts.
 */
export interface AnalysisResult {
  /** 0–1. Always defined (0 when nothing was collected). */
  coverage: number;
  // 0–1, null when Coverage = 0 — DESIGN §1.6/PRD §222: Prominence is undefined,
  // never a misleading 0, for a brand with no mentions.
  prominence: number | null;
  /** 0–1, null when no answer mentioned the brand or any competitor. */
  share_of_voice: number | null;
  /** 0–100 points. */
  composite_score: number;
  /** 0–100 points. */
  ci_low: number;
  /** 0–100 points. */
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
  /** Responses behind it (confidence = min(1, n / 10), floored at 0.2). Older snapshots: absent. */
  evidence_count?: number;
  /** i18n key for `reasoning` (rendered as `dashboard.recs.why.<key>`); absent on older snapshots. */
  reasoning_key?: string;
  /** Values for the reasoning_key placeholders. */
  reasoning_params?: Record<string, string | number>;
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
  /** "failed" when drafting recommendations crashed (the scores are still valid); absent = "ok". */
  recommendation_status?: "ok" | "failed";
  /** Short, safe message when recommendation_status is "failed". */
  recommendation_error?: string | null;
  /** Recommendations that passed validation before the display cap (≥ recommendations.length). */
  recommendations_total?: number;
}

export type TrendStatus =
  | "insufficient_data"
  | "no_change_detected"
  | "change_detected"
  | "no_clear_trend"
  | "improving"
  | "declining";

/** PRD §11.6 / AC-8 trend statistics over the latest comparable segment (same comparability_key,
 * admissible runs only). Scores and slopes are on the 0–100 scale, like `AnalysisResult.composite_score`.
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

// ---------------------------------------------------------------------------
// Campaign Studio (PRD §11.5 / AC-10). Mirrors backend/src/app/distribution/types.py exactly:
// JSON field names are the dataclass field names.
// ---------------------------------------------------------------------------

export type ChannelId =
  | "facebook_page"
  | "instagram"
  | "x"
  | "linkedin"
  | "google_business"
  | "whatsapp"
  | "export"
  | "sandbox";

export const CHANNEL_IDS: ChannelId[] = [
  "facebook_page",
  "instagram",
  "x",
  "linkedin",
  "google_business",
  "whatsapp",
  "export",
  "sandbox",
];

/** connected: can publish now · export_only: no credentials / no API (copy + download) · disabled: off in config. */
export type ChannelMode = "connected" | "export_only" | "disabled";

/** generating → ready → approved → published | partially_published | failed. Any edit to an approved
 * campaign drops it back to "ready" (approval revoked). */
export type CampaignStatus = "generating" | "ready" | "approved" | "published" | "partially_published" | "failed";

export type DeliverableKind =
  | "social_post"
  | "article"
  | "faq"
  | "profile_copy"
  | "video_script"
  | "review_request"
  | "listing"
  | "outreach_email"
  | "community_answer";

export type ImageFormat = "square" | "portrait" | "landscape" | "story" | "gbp";

/** Output image sizes, px [width, height]. */
export const IMAGE_SIZES: Record<ImageFormat, [number, number]> = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  landscape: [1200, 675],
  story: [1080, 1920],
  gbp: [1200, 900],
};

/** Per-channel hard limits used by validation (characters). */
export const TEXT_LIMITS: Record<ChannelId, number> = {
  facebook_page: 63_206,
  instagram: 2_200,
  x: 280,
  linkedin: 3_000,
  google_business: 1_500,
  whatsapp: 4_096,
  export: 1_000_000,
  sandbox: 1_000_000,
};

/** blocked = the approval gate refused. */
export type EventOutcome = "published" | "failed" | "exported" | "blocked";

/** One generated image (base scene from an image provider + our text overlay). */
export interface Asset {
  asset_id: string;
  format: ImageFormat;
  /** Relative to DATA_DIR/media, e.g. "<campaign_id>/<asset_id>.png"; served at GET /media/{path}. */
  path: string;
  /** "gemini" | "cloudflare" | "template" */
  provider: string;
  prompt: string;
  seed: number | null;
  overlay_text: string | null;
  created_at: string;
}

/** Copy for one channel. `approved_hash` is set on approval; an edit that changes the content makes
 * the campaign unpublishable until re-approved. */
export interface Variant {
  channel: ChannelId;
  text: string;
  hashtags: string[];
  link: string | null;
  asset_id: string | null;
  alt_text: string | null;
  enabled: boolean;
  approved_hash: string | null;
  /** Validation problems (too long, unsupported claim…). */
  issues: string[];
}

/** Non-post output of the kit (article, FAQ + JSON-LD, profile copy, script, email…). */
export interface Deliverable {
  kind: DeliverableKind;
  title: string;
  /** markdown */
  body: string;
  /** e.g. {"jsonld": "..."} or {"qr_url": "..."} */
  extra: Record<string, string>;
}

/** One publish/export attempt on one channel (AC-10: logged regardless of outcome). */
export interface DistributionEvent {
  event_id: string;
  campaign_id: string;
  recommendation_id: string;
  channel: ChannelId;
  outcome: EventOutcome;
  at: string;
  external_url: string | null;
  external_id: string | null;
  error: string | null;
  content_hash: string | null;
}

export interface AuditLogEntry {
  entry_id: string;
  actor: string;
  action: string;
  target_ref: string;
  at: string;
  context: Record<string, string>;
}

export interface Campaign {
  campaign_id: string;
  brand_key: string;
  recommendation_id: string;
  /** AC-7: never empty. */
  gap_id: string;
  action: string;
  /** Board card key (`action|competitor_id`) so the board status can follow. */
  suggestion_key: string;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
  headline: string;
  variants: Variant[];
  assets: Asset[];
  deliverables: Deliverable[];
  events: DistributionEvent[];
  /** "gemini:<model>" | "groq:<model>" | "template" */
  drafted_by: string;
  approved_at: string | null;
  /** Generation job while status === "generating". */
  job_id: string | null;
}

export interface ChannelStatus {
  channel: ChannelId;
  label: string;
  mode: ChannelMode;
  detail: string;
  /** X free-tier posts left this month, when known. */
  quota_remaining: number | null;
}

export interface PublishResult {
  ok: boolean;
  external_url: string | null;
  external_id: string | null;
  error: string | null;
}

/** POST /brands/{k}/campaigns → 202. Poll `job` with getJob until terminal, then refetch the campaign. */
export interface CreateCampaignResponse {
  campaign: Campaign;
  job: Job;
}

/** PATCH /brands/{k}/campaigns/{cid}/variants/{channel} */
export interface VariantPatch {
  text?: string;
  hashtags?: string[];
  link?: string | null;
  enabled?: boolean;
  asset_id?: string | null;
  alt_text?: string | null;
}

/** POST /brands/{k}/campaigns/{cid}/deliverables/{index} */
export interface DeliverablePatch {
  title?: string;
  body?: string;
}

/** POST /brands/{k}/campaigns/{cid}/regenerate-image */
export interface RegenerateImageRequest {
  format: ImageFormat;
  prompt?: string;
  style?: string;
  seed?: number;
}

// --- per-brand connected accounts (mirrors distribution/types.py AccountStatus) --------------------

export type AccountMethod = "oauth" | "manual" | "env";
export type AccountState = "connected" | "not_connected" | "needs_setup" | "pending_approval" | "expired";

/** One brand's account on one channel. Never contains secrets. */
export interface AccountStatus {
  channel: ChannelId;
  state: AccountState;
  method: AccountMethod | null;
  account_name: string | null;
  account_id: string | null;
  connected_at: string | null;
  expires_at: string | null;
  /** The platform's OAuth app keys are configured, so a "Connect" button can be offered. */
  oauth_available: boolean;
  /** Field names the manual-entry form needs (e.g. ["page_id", "page_token"]). */
  manual_fields: string[];
  detail: string;
}
