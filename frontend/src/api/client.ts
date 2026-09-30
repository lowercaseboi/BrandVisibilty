import type {
  AccountStatus,
  BoardState,
  Campaign,
  ChannelId,
  ChannelStatus,
  CreateCampaignResponse,
  DeliverablePatch,
  RegenerateImageRequest,
  VariantPatch,
  BrandDeleteResponse,
  BrandProfile,
  BrandSummary,
  CreateBrandRequest,
  Job,
  Observation,
  ObservationsResponse,
  ProviderInfo,
  QuestionInput,
  QuestionSet,
  Snapshot,
  StartRunRequest,
  TrendVerdict,
  UpdateBrandRequest,
} from "./types";

// Default "/api": the Vite dev proxy (vite.config.ts) or nginx strips the
// prefix and forwards to the FastAPI backend (docs/CONTRACT.md §7).
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// FastAPI errors come back as {detail: string} or {detail: [{loc, msg}]}.
function describeDetail(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (d && typeof d === "object" && "msg" in d) {
          const loc = Array.isArray((d as { loc?: unknown }).loc)
            ? ((d as { loc: unknown[] }).loc.filter((p) => p !== "body").join("."))
            : "";
          return loc ? `${loc}: ${(d as { msg: string }).msg}` : (d as { msg: string }).msg;
        }
        return String(d);
      })
      .join("; ");
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "Cannot reach the API server. Is the backend running on :8000?");
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const described = describeDetail(await res.json());
      if (described) message = described;
    } catch {
      // non-JSON error body; keep the status line
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

function getJson<T>(path: string): Promise<T> {
  return request<T>(path);
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteJson<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

const b = encodeURIComponent;

export function listBrands(): Promise<BrandSummary[]> {
  return getJson("/brands");
}

export function createBrand(spec: CreateBrandRequest): Promise<BrandSummary> {
  return postJson("/brands", spec);
}

/** Delete a user-created brand and its stored runs/snapshots. Sample brands can't be deleted
 * (the backend returns 403). */
export function deleteBrand(brandKey: string): Promise<BrandDeleteResponse> {
  latestCache.delete(brandKey);
  return deleteJson(`/brands/${b(brandKey)}`);
}

/** Full saved profile (category, cities, competitors, aliases…). */
export function getBrand(brandKey: string): Promise<BrandProfile> {
  return getJson(`/brands/${b(brandKey)}`);
}

/** Edit a user-created brand (403 for a sample brand). Changing competitors/aliases starts a new
 * comparability segment, so the trend restarts. */
export function updateBrand(brandKey: string, body: UpdateBrandRequest): Promise<BrandProfile> {
  return putJson(`/brands/${b(brandKey)}`, body);
}

/** Recommendation board column/order per suggestion group (empty `cards` when never saved). */
export function getBoard(brandKey: string): Promise<BoardState> {
  return getJson(`/brands/${b(brandKey)}/board`);
}

export function saveBoard(brandKey: string, board: BoardState): Promise<BoardState> {
  return putJson(`/brands/${b(brandKey)}/board`, board);
}

export function listProviders(): Promise<ProviderInfo[]> {
  return getJson("/providers");
}

// Last latest-snapshot seen per brand, so the brand hub can draw the centre card on the very first
// frame of the list → hub view transition (no loading flash mid-morph).
const latestCache = new Map<string, Snapshot>();

/** The most recently fetched latest snapshot for a brand, if any (synchronous; may be stale). */
export function peekLatestSnapshot(brandKey: string): Snapshot | undefined {
  return latestCache.get(brandKey);
}

export async function getLatestSnapshot(brandKey: string): Promise<Snapshot> {
  const snap = await getJson<Snapshot>(`/brands/${b(brandKey)}/snapshots/latest`);
  latestCache.set(brandKey, snap);
  return snap;
}

export function getSnapshots(brandKey: string): Promise<Snapshot[]> {
  return getJson<Snapshot[]>(`/brands/${b(brandKey)}/snapshots`);
}

/** AC-8 trend verdict (0-100 scale). The newest snapshot from getSnapshots/getLatestSnapshot
 * already carries the same object as `trend_verdict`. */
export function getTrend(brandKey: string): Promise<TrendVerdict> {
  return getJson(`/brands/${b(brandKey)}/trend`);
}

export async function getObservations(brandKey: string, runId: string): Promise<ObservationsResponse> {
  const raw = await getJson<unknown>(`/brands/${b(brandKey)}/snapshots/${b(runId)}/observations`);
  // Contract §7 says "raw_observations[] + entities"; accept the plausible shapes.
  if (Array.isArray(raw)) return { observations: raw as Observation[], entities: {} };
  const obj = (raw ?? {}) as Record<string, unknown>;
  const observations = (obj.raw_observations ?? obj.observations ?? []) as Observation[];
  const entities = (obj.entities ?? {}) as Record<string, string>;
  return { observations, entities };
}

export function startRun(brandKey: string, body: StartRunRequest): Promise<Job> {
  return postJson(`/brands/${b(brandKey)}/runs`, body);
}

export function getJob(jobId: string): Promise<Job> {
  return getJson(`/jobs/${b(jobId)}`);
}

export function listJobs(brandKey: string): Promise<Job[]> {
  return getJson(`/jobs?brand_key=${b(brandKey)}`);
}

export function cancelJob(jobId: string): Promise<Job> {
  return postJson(`/jobs/${b(jobId)}/cancel`, {});
}

/** Skip one provider's remaining calls, or (null) every remaining call and score what was collected. */
export function skipJob(jobId: string, providerId: string | null): Promise<Job> {
  return postJson(`/jobs/${b(jobId)}/skip`, { provider_id: providerId });
}

export function getQuestions(brandKey: string): Promise<QuestionSet> {
  return getJson(`/brands/${b(brandKey)}/questions`);
}

export function saveQuestions(brandKey: string, questions: QuestionInput[]): Promise<QuestionSet> {
  return putJson(`/brands/${b(brandKey)}/questions`, { questions });
}

export function resetQuestions(brandKey: string): Promise<QuestionSet> {
  return deleteJson(`/brands/${b(brandKey)}/questions`);
}

// ---------------------------------------------------------------------------
// Campaign Studio (PRD §11.5 / AC-10)
// ---------------------------------------------------------------------------

/** Header the backend checks on approve / publish / delete (ADMIN_TOKEN). */
export const ADMIN_HEADER = "X-Admin-Token";

/** JSON request with the admin token header; an empty token sends no header (server without ADMIN_TOKEN). */
function adminJson<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers[ADMIN_HEADER] = token;
  return request<T>(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const campaignPath = (brandKey: string, campaignId: string) => `/brands/${b(brandKey)}/campaigns/${b(campaignId)}`;

/** Every channel adapter: connected / export only / disabled, with detail and quota. */
export function listChannels(): Promise<ChannelStatus[]> {
  return getJson("/channels");
}

export function listCampaigns(brandKey: string): Promise<Campaign[]> {
  return getJson(`/brands/${b(brandKey)}/campaigns`);
}

/** Starts drafting a campaign for one recommendation (202): the campaign comes back "generating"
 * with its job; poll getJob until terminal, then getCampaign. */
export function createCampaign(brandKey: string, recommendationId: string): Promise<CreateCampaignResponse> {
  return postJson(`/brands/${b(brandKey)}/campaigns`, { recommendation_id: recommendationId });
}

export function getCampaign(brandKey: string, campaignId: string): Promise<Campaign> {
  return getJson(campaignPath(brandKey, campaignId));
}

/** Edit one channel's copy. Editing an approved campaign revokes the approval. */
export function patchVariant(brandKey: string, campaignId: string, channel: ChannelId, patch: VariantPatch): Promise<Campaign> {
  return request(`${campaignPath(brandKey, campaignId)}/variants/${b(channel)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function updateDeliverable(
  brandKey: string,
  campaignId: string,
  index: number,
  patch: DeliverablePatch,
): Promise<Campaign> {
  return postJson(`${campaignPath(brandKey, campaignId)}/deliverables/${index}`, patch);
}

export function regenerateImage(brandKey: string, campaignId: string, body: RegenerateImageRequest): Promise<Campaign> {
  return postJson(`${campaignPath(brandKey, campaignId)}/regenerate-image`, body);
}

export function approveCampaign(brandKey: string, campaignId: string, token: string): Promise<Campaign> {
  return adminJson("POST", `${campaignPath(brandKey, campaignId)}/approve`, token, {});
}

export function publishCampaign(brandKey: string, campaignId: string, channels: ChannelId[], token: string): Promise<Campaign> {
  return adminJson("POST", `${campaignPath(brandKey, campaignId)}/publish`, token, { channels });
}

export function deleteCampaign(brandKey: string, campaignId: string, token: string): Promise<unknown> {
  return adminJson("DELETE", campaignPath(brandKey, campaignId), token);
}

/** Direct link to the export pack (images + copy + deliverables). */
export function campaignExportUrl(brandKey: string, campaignId: string): string {
  return `${API_BASE}${campaignPath(brandKey, campaignId)}/export.zip`;
}

/** URL of a generated image (Asset.path is relative to the media root). */
export function mediaUrl(path: string, version?: string): string {
  const clean = path.split("/").map(encodeURIComponent).join("/");
  return `${API_BASE}/media/${clean}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}

// ---------------------------------------------------------------------------
// Per-brand connected accounts (Details → Connected accounts). Responses never carry secrets.
// ---------------------------------------------------------------------------

/** One pickable Page / organisation / location after an OAuth sign-in (`connect_choose`). */
export interface AccountChoice {
  id: string;
  name: string;
  kind: string;
}

/** POST …/test: a cheap read-only call against the platform. */
export interface AccountTestResult {
  ok: boolean;
  detail: string;
}

const accountPath = (brandKey: string, channel: ChannelId) => `/brands/${b(brandKey)}/accounts/${b(channel)}`;

export function listAccounts(brandKey: string): Promise<AccountStatus[]> {
  return getJson(`/brands/${b(brandKey)}/accounts`);
}

/** Manual entry: the guided form's fields (ids and tokens), stored encrypted server-side. */
export function saveAccount(brandKey: string, channel: ChannelId, fields: Record<string, string>, token: string): Promise<AccountStatus> {
  return adminJson("PUT", accountPath(brandKey, channel), token, { fields });
}

export function disconnectAccount(brandKey: string, channel: ChannelId, token: string): Promise<AccountStatus> {
  return adminJson("DELETE", accountPath(brandKey, channel), token);
}

export function testAccount(brandKey: string, channel: ChannelId, token: string): Promise<AccountTestResult> {
  return adminJson("POST", `${accountPath(brandKey, channel)}/test`, token, {});
}

/** Starts the platform's sign-in; the caller then sends the browser to `authorize_url`. */
export function startAccountOAuth(brandKey: string, channel: ChannelId, token: string, returnTo?: string): Promise<{ authorize_url: string }> {
  return adminJson("POST", `${accountPath(brandKey, channel)}/oauth/start`, token, returnTo ? { return_to: returnTo } : {});
}

export function listAccountChoices(brandKey: string, channel: ChannelId): Promise<AccountChoice[]> {
  return getJson(`${accountPath(brandKey, channel)}/choices`);
}

export function chooseAccount(brandKey: string, channel: ChannelId, id: string, token: string): Promise<AccountStatus> {
  return adminJson("POST", `${accountPath(brandKey, channel)}/choose`, token, { id });
}

// ---------------------------------------------------------------------------
// Campaign Studio: channel status for one brand
// ---------------------------------------------------------------------------

/** Channel status as this brand would post (its own connected accounts first, then the server's
 * shared credentials). Falls back to the brand-agnostic GET /channels on an older backend (404). */
export async function listBrandChannels(brandKey: string): Promise<ChannelStatus[]> {
  try {
    return await getJson<ChannelStatus[]>(`/brands/${b(brandKey)}/channels`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return listChannels();
    throw err;
  }
}
