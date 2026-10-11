// Plain-language numbers for the default (non-analytical) view. Pure, so they're unit-tested.

const NICE = [2, 3, 4, 5, 10, 20, 50, 100] as const;

/**
 * "About 1 in N": turns a share (0–1) into the nearest friendly N (2, 3, 4, 5, 10, 20, 50, 100).
 * Returns null when the share is at or above half ("most of the time") or not a usable number.
 */
export function oneIn(share: number): number | null {
  if (!Number.isFinite(share) || share <= 0 || share >= 0.5) return null;
  const n = 1 / share;
  let best: number = NICE[0];
  for (const c of NICE) if (Math.abs(c - n) < Math.abs(best - n)) best = c;
  return best;
}

/** A position (1 = first named) rounded for people: 3.4 → 3. Never below 1. */
export function wholeRank(rank: number): number {
  return Number.isFinite(rank) ? Math.max(1, Math.round(rank)) : 1;
}
