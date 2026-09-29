import type { Gap } from "../../api/types";

// Pure helpers behind the hub's module-card previews (previews.tsx).

export interface Pt {
  x: number;
  y: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A sparkline's polyline points for scores (0–100 points) in a w×h box with `pad` px inset, oldest → newest.
 * The y range is padded around the data (at least 10 points) so a flat series
 * sits mid-box instead of hugging an edge.
 */
export function sparkPoints(values: number[], w: number, h: number, pad = 3): Pt[] {
  if (values.length === 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 10);
  const mid = (lo + hi) / 2;
  const min = mid - span / 2;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  return values.map((v, i) => ({
    x: round1(pad + (values.length === 1 ? innerW : (i / (values.length - 1)) * innerW)),
    y: round1(pad + innerH - ((v - min) / span) * innerH),
  }));
}

/** Count per gap type, in first-seen order. */
export function countGapTypes(gaps: Gap[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const g of gaps) counts.set(g.gap_type, (counts.get(g.gap_type) ?? 0) + 1);
  return [...counts.entries()];
}
