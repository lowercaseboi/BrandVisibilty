// Onboarding checklist on the brand hub: five steps, each derived from data the app already has
// (profile, snapshots, connected accounts, campaigns). Pure — no I/O — so it's unit-tested.
import type { AccountStatus, BrandProfile, Campaign, Snapshot } from "../../api/types";
import { countConnected } from "../accounts/accountsModel";
import { brandHref } from "../module/modules";

export type StepId = "profile" | "accounts" | "analysis" | "campaign" | "measure";

export interface ChecklistStep {
  id: StepId;
  done: boolean;
  /** Where to go to do it (hash deep links land on the right Details section). */
  href: string;
}

export interface Checklist {
  steps: ChecklistStep[];
  doneCount: number;
  /** First step not done yet, or null when all are. */
  current: StepId | null;
}

export interface ChecklistInput {
  brandKey: string;
  profile: BrandProfile | null;
  /** Oldest → newest (useBrandData().history). */
  history: readonly Snapshot[];
  /** null while loading / when the backend has no accounts routes. */
  accounts: readonly AccountStatus[] | null;
  /** null while loading / unavailable. */
  campaigns: readonly Campaign[] | null;
}

const filled = (xs: readonly string[] | undefined) => (xs ?? []).some((x) => x.trim() !== "");

/** Enough of a profile for good questions: category, a city, a competitor and a customer group. */
export function profileComplete(p: BrandProfile | null): boolean {
  return !!p && p.category.trim() !== "" && filled(p.cities) && filled(p.competitors) && filled(p.audiences);
}

/** When the brand's first campaign actually went out (earliest "published" event), in ms. */
export function firstPublishedAt(campaigns: readonly Campaign[] | null): number | null {
  let first: number | null = null;
  for (const c of campaigns ?? []) {
    const times = (c.events ?? []).filter((e) => e.outcome === "published").map((e) => Date.parse(e.at));
    // A published campaign whose events weren't recorded still counts, from its last update.
    if (times.length === 0 && (c.status === "published" || c.status === "partially_published")) times.push(Date.parse(c.updated_at));
    for (const at of times) if (!Number.isNaN(at) && (first === null || at < first)) first = at;
  }
  return first;
}

function snapshotTime(s: Snapshot): number {
  const at = Date.parse(s.collection_started_at || s.collection_completed_at);
  return Number.isNaN(at) ? Date.parse(s.collection_completed_at) : at;
}

export function deriveChecklist({ brandKey, profile, history, accounts, campaigns }: ChecklistInput): Checklist {
  const details = brandHref(brandKey, "details");
  const analysis = brandHref(brandKey, "analysis");
  const publishedAt = firstPublishedAt(campaigns);
  // Continue the newest unfinished draft if there is one; otherwise start from the board.
  const draft = [...(campaigns ?? [])]
    .filter((c) => c.status === "ready" || c.status === "approved" || c.status === "failed")
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
  const campaignHref = draft
    ? `${brandHref(brandKey, "recommendations")}/${encodeURIComponent(draft.campaign_id)}`
    : brandHref(brandKey, "recommendations");

  const steps: ChecklistStep[] = [
    { id: "profile", done: profileComplete(profile), href: `${details}#profile` },
    { id: "accounts", done: countConnected(accounts) > 0, href: `${details}#accounts` },
    { id: "analysis", done: history.length > 0, href: analysis },
    { id: "campaign", done: publishedAt !== null, href: campaignHref },
    {
      id: "measure",
      done: publishedAt !== null && history.some((s) => snapshotTime(s) > publishedAt),
      href: analysis,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, current: steps.find((s) => !s.done)?.id ?? null };
}

// ---------------------------------------------------------------------------
// "Hide" is remembered per brand (localStorage; storage may be unavailable)
// ---------------------------------------------------------------------------

const dismissKey = (brandKey: string) => `bv.onboarding.hidden.${brandKey}`;

export function readChecklistHidden(brandKey: string): boolean {
  try {
    return localStorage.getItem(dismissKey(brandKey)) === "1";
  } catch {
    return false;
  }
}

export function saveChecklistHidden(brandKey: string): void {
  try {
    localStorage.setItem(dismissKey(brandKey), "1");
  } catch {
    /* storage unavailable: hidden for this visit only */
  }
}
