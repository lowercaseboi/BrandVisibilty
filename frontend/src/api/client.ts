import type {
  BrandSummary,
  CreateBrandRequest,
  Job,
  Observation,
  ObservationsResponse,
  ProviderInfo,
  Snapshot,
  StartRunRequest,
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

const b = encodeURIComponent;

export function listBrands(): Promise<BrandSummary[]> {
  return getJson("/brands");
}

export function createBrand(spec: CreateBrandRequest): Promise<BrandSummary> {
  return postJson("/brands", spec);
}

export function listProviders(): Promise<ProviderInfo[]> {
  return getJson("/providers");
}

export function getLatestSnapshot(brandKey: string): Promise<Snapshot> {
  return getJson(`/brands/${b(brandKey)}/snapshots/latest`);
}

export function getSnapshots(brandKey: string): Promise<Snapshot[]> {
  return getJson(`/brands/${b(brandKey)}/snapshots`);
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
