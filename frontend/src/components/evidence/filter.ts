import type { Gap, Observation } from "../../api/types";

// Pure selection/filter logic for the Gaps & evidence module, kept out of the components so it
// can be unit-tested.

export interface EvidenceFilter {
  /** Intent type, or "all". */
  intent: string;
  /** Provider id, or "all". */
  provider: string;
  /** Only answers that name the brand. */
  onlyBrand: boolean;
  /** Case-insensitive substring over question + answer. */
  text: string;
}

export const NO_FILTER: EvidenceFilter = { intent: "all", provider: "all", onlyBrand: false, text: "" };

export function isFiltered(f: EvidenceFilter): boolean {
  return f.intent !== "all" || f.provider !== "all" || f.onlyBrand || f.text.trim() !== "";
}

export function mentionsBrand(obs: Observation): boolean {
  return (obs.mentions ?? []).some((m) => m.entity_kind === "self");
}

export function filterObservations(all: Observation[], f: EvidenceFilter): Observation[] {
  const needle = f.text.trim().toLowerCase();
  return all.filter(
    (o) =>
      (f.intent === "all" || o.intent_type === f.intent) &&
      (f.provider === "all" || o.provider_id === f.provider) &&
      (!needle || `${o.query_text} ${o.response_text}`.toLowerCase().includes(needle)) &&
      (!f.onlyBrand || mentionsBrand(o)),
  );
}

/** Observations whose id is in `refs`, in their original order; everything when refs is null. */
export function scopeObservations(all: Observation[], refs: ReadonlySet<string> | null): Observation[] {
  return refs ? all.filter((o) => refs.has(o.observation_id)) : all;
}

/** `?refs=a,b` → a set, or null when absent/empty. */
export function parseRefs(param: string | null): Set<string> | null {
  const ids = (param ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

/** Stable key for a gap: its id, or its position when a (legacy) gap has none. Matches GapList. */
export function gapKey(gap: Gap, index: number): string {
  return gap.gap_id ?? `idx-${index}`;
}

/** True when the gap's evidence is exactly this set of refs (an old gap "evidence" deep link). */
export function sameRefs(gap: Gap, refs: ReadonlySet<string>): boolean {
  const own = new Set(gap.evidence_refs ?? []);
  if (own.size !== refs.size) return false;
  for (const r of refs) if (!own.has(r)) return false;
  return true;
}

/** Distinct, sorted values of a field across observations (filter dropdown options). */
export function distinct(all: Observation[], pick: (o: Observation) => string | null | undefined): string[] {
  return [...new Set(all.map(pick).filter((x): x is string => !!x))].sort();
}
