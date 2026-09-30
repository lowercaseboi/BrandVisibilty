import { useCallback, useEffect, useState } from "react";
import { ApiError, listAccounts } from "../../api/client";
import type { AccountStatus } from "../../api/types";

// One small shared cache per brand, so the hub preview, the onboarding checklist and the Details
// page don't each fetch the accounts list. A mutation (connect / disconnect / save) writes its
// fresh status straight in and every mounted reader re-renders.

export type AccountsState = "loading" | "ready" | "unavailable" | "error";

interface Entry {
  data: AccountStatus[] | null;
  state: AccountsState;
  error: string | null;
  at: number;
  inflight: Promise<void> | null;
}

const FRESH_MS = 30_000;
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function entry(brandKey: string): Entry {
  let e = cache.get(brandKey);
  if (!e) {
    e = { data: null, state: "loading", error: null, at: 0, inflight: null };
    cache.set(brandKey, e);
  }
  return e;
}

function load(brandKey: string, force: boolean): Promise<void> {
  const e = entry(brandKey);
  if (e.inflight) return e.inflight;
  if (!force && e.state !== "loading" && Date.now() - e.at < FRESH_MS) return Promise.resolve();
  e.inflight = listAccounts(brandKey)
    .then((data) => {
      Object.assign(e, { data, state: "ready", error: null });
    })
    .catch((err: unknown) => {
      // 404/405: this backend has no accounts routes (yet) — not an error the user can fix.
      const missing = err instanceof ApiError && (err.status === 404 || err.status === 405);
      Object.assign(e, { state: missing ? "unavailable" : "error", error: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      e.at = Date.now();
      e.inflight = null;
      emit();
    });
  return e.inflight;
}

/** Replace one channel's status in the cache (after connect / disconnect / save / choose). */
export function putAccountStatus(brandKey: string, status: AccountStatus): void {
  const e = entry(brandKey);
  const list = e.data ? e.data.filter((a) => a.channel !== status.channel) : [];
  e.data = [...list, status];
  e.state = "ready";
  e.at = Date.now();
  emit();
}

export function useAccounts(brandKey: string): {
  accounts: AccountStatus[] | null;
  state: AccountsState;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    void load(brandKey, false);
    return () => {
      listeners.delete(l);
    };
  }, [brandKey]);
  const reload = useCallback(() => load(brandKey, true), [brandKey]);
  const e = entry(brandKey);
  return { accounts: e.data, state: e.state, error: e.error, reload };
}
