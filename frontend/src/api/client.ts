import type { BrandSummary, Snapshot } from "./types";

// FastAPI dev server; see backend/src/app/interface/main.py.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

export function listBrands(): Promise<BrandSummary[]> {
  return getJson("/brands");
}

export function getLatestSnapshot(brandKey: string): Promise<Snapshot> {
  return getJson(`/brands/${encodeURIComponent(brandKey)}/snapshots/latest`);
}

export function getSnapshots(brandKey: string): Promise<Snapshot[]> {
  return getJson(`/brands/${encodeURIComponent(brandKey)}/snapshots`);
}

export function getRuns(brandKey: string): Promise<Snapshot[]> {
  return getJson(`/brands/${encodeURIComponent(brandKey)}/runs`);
}
