/* oxlint-disable react/only-export-components -- provider and hook belong together */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  getBrand,
  getLatestSnapshot,
  getQuestions,
  getSnapshots,
  listBrands,
  listProviders,
  peekLatestSnapshot,
} from "../../api/client";
import type { BrandProfile, ProviderInfo, QuestionSet, Snapshot } from "../../api/types";
import { useProviderLabel } from "../../components/dashboard/helpers";

/**
 * Everything the brand hub and its four modules share, loaded once per brand by BrandLayout.
 * Moving between modules keeps this mounted (App.tsx keys the page wrapper per brand, not per
 * path), so switching modules never refetches or flashes a loading state.
 */
export interface BrandData {
  brandKey: string;
  /** Best-known display name: profile → latest snapshot → brand list → key. */
  brandName: string;
  /** null until loaded, or when the backend has no profile endpoint / the brand is data-only. */
  profile: BrandProfile | null;
  latest: Snapshot | null;
  /** Oldest → newest. */
  history: Snapshot[];
  questions: QuestionSet | null;
  providers: ProviderInfo[] | null;
  labelOf: (providerId: string) => string;
  /** "loading" only on the first load; later reloads keep showing the previous data. */
  status: "loading" | "ready" | "error";
  error: string | null;
  /** Refetch everything (after a run completes, questions are saved, etc.). */
  reload(): void;
  /** Replace the profile after a successful edit without a full reload. */
  setProfile(p: BrandProfile): void;
}

const BrandContext = createContext<BrandData | null>(null);

export function useBrandData(): BrandData {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrandData() must be used inside <BrandDataProvider>");
  return ctx;
}

interface Loaded {
  profile: BrandProfile | null;
  latest: Snapshot | null;
  history: Snapshot[];
  questions: QuestionSet | null;
  listName: string | null;
}

const notFoundToNull = <T,>(err: unknown): T | null => {
  if (err instanceof ApiError && err.status === 404) return null;
  throw err;
};

async function loadBrand(brandKey: string): Promise<Loaded> {
  const [profile, latest, history, questions] = await Promise.all([
    getBrand(brandKey).catch(() => null),
    getLatestSnapshot(brandKey).catch((e: unknown) => notFoundToNull<Snapshot>(e)),
    getSnapshots(brandKey).catch(() => [] as Snapshot[]),
    getQuestions(brandKey).catch(() => null),
  ]);
  let listName: string | null = null;
  if (!profile && !latest) {
    const brands = await listBrands().catch(() => []);
    listName = brands.find((b) => b.brand_key === brandKey)?.brand ?? null;
  }
  return { profile, latest, history, questions, listName };
}

export function BrandDataProvider({ brandKey, children }: { brandKey: string; children: ReactNode }) {
  // Seed from the brand list's cached snapshot so the hub's centre card renders on the first frame.
  const seeded = peekLatestSnapshot(brandKey) ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBrand(brandKey)
      .then((d) => {
        if (!cancelled) {
          setLoaded(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [brandKey, reloadTick]);

  useEffect(() => {
    let cancelled = false;
    listProviders()
      .then((p) => !cancelled && setProviders(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const labelOf = useProviderLabel(providers);
  const reload = useCallback(() => setReloadTick((n) => n + 1), []);
  const setProfile = useCallback(
    (p: BrandProfile) => setLoaded((prev) => (prev ? { ...prev, profile: p } : prev)),
    [],
  );

  const value = useMemo<BrandData>(() => {
    const latest = loaded ? loaded.latest : seeded;
    const brandName = loaded?.profile?.brand ?? latest?.brand ?? loaded?.listName ?? brandKey;
    return {
      brandKey,
      brandName,
      profile: loaded?.profile ?? null,
      latest,
      history: loaded?.history ?? (seeded ? [seeded] : []),
      questions: loaded?.questions ?? null,
      providers,
      labelOf,
      status: loaded ? "ready" : error ? "error" : "loading",
      error,
      reload,
      setProfile,
    };
  }, [brandKey, loaded, seeded, providers, labelOf, error, reload, setProfile]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}
