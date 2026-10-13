// Metrics v2 view helpers: the Visibility Index headline, its rating word, plain-language
// position / reach facts, trend-line breaks, and verdict wording. Pure, so they're unit-tested
// (visibility.test.ts). Old snapshots without `metrics_v2` fall back to the v1 composite.
import type { MatchedVerdict, MetricsV2, Snapshot, TrendVerdict } from "../../api/types";
import type { MessageKey } from "../../i18n";
import { ratingFromRange } from "../../format";
import type { RatingBand } from "../../format";

/** Below this share of matched cells two runs measured different things: the trend line breaks. */
export const BREAK_OVERLAP = 0.7;

export interface Headline {
  /** 0–100 */
  value: number;
  lo: number;
  hi: number;
  version: "v2" | "v1";
}

const clamp = (x: number) => Math.min(100, Math.max(0, Number.isFinite(x) ? x : 0));

/** The headline number of a snapshot: its Visibility Index, or the v1 composite for old runs. */
export function headline(s: Snapshot): Headline {
  const m = s.metrics_v2;
  const own = m?.entities?.[m.self_id];
  if (m && own) {
    const [lo, hi] = own.ci ?? [own.vi, own.vi];
    return { value: clamp(own.vi), lo: clamp(Math.min(lo, own.vi)), hi: clamp(Math.max(hi, own.vi)), version: "v2" };
  }
  const a = s.analysis_result;
  return { value: clamp(a.composite_score), lo: clamp(a.ci_low ?? a.composite_score), hi: clamp(a.ci_high ?? a.composite_score), version: "v1" };
}

/** A VI value for display: one decimal under 10 (where a point matters), whole points above. */
export function viDigits(v: number): number {
  return Math.abs(v) < 10 ? 1 : 0;
}

// Rating bands on the VI scale. VI 100 = named first in every answer, so the category leader in
// the pilot data (Ashok Vada Pav) sits around 27–30. Bands: >= 40 top, >= 20 often, >= 8 sometimes.
const VI_BANDS: [number, RatingBand][] = [
  [40, "top"],
  [20, "often"],
  [8, "sometimes"],
];

function viBand(v: number): RatingBand {
  return VI_BANDS.find(([min]) => v >= min)?.[1] ?? "rarely";
}

/** The rating word from the LOW end of the interval (never claims more than the data supports). */
export function ratingFromVi(lo: number, hi: number): { band: RatingBand; upper?: RatingBand } {
  const band = viBand(Math.min(lo, hi));
  const upper = viBand(Math.max(lo, hi));
  return upper === band ? { band } : { band, upper };
}

/** The rating word for a snapshot's headline: VI bands for v2, the v1 bands otherwise. */
export function headlineRating(s: Snapshot): { band: RatingBand; upper?: RatingBand } {
  const h = headline(s);
  return h.version === "v2" ? ratingFromVi(h.lo, h.hi) : ratingFromRange(h.lo, h.hi);
}

/** The headline rounded for display (one decimal under 10). */
export function headlineValue(s: Snapshot): number {
  const v = headline(s).value;
  return Number(v.toFixed(viDigits(v)));
}

/**
 * The v2 trend in the v1 verdict vocabulary, for compact previews that only need a word and an arrow:
 * a clear rise / fall -> change detected; leaning or no change -> no change detected.
 */
export function previewTrend(s: Snapshot): TrendVerdict | undefined {
  const v = s.trend_verdict_v2;
  if (!v) return s.trend_verdict;
  const base = { method: "ci_overlap" as const, n_points: v.n_points, n_excluded: 0, comparability_key: null };
  if (v.method === "theil_sen") {
    return { ...base, method: "theil_sen", status: v.status as TrendVerdict["status"], direction: v.direction };
  }
  if (v.status === "rose_after" || v.status === "fell_after") {
    return { ...base, status: "change_detected", direction: v.status === "rose_after" ? "up" : "down" };
  }
  if (v.status === "insufficient_data" || v.method === "none") return { ...base, status: "insufficient_data", direction: null };
  return { ...base, status: "no_change_detected", direction: null };
}

/** Whether the trend line must break between two consecutive snapshots. */
export function isBreak(prev: Snapshot, cur: Snapshot): boolean {
  const overlap = cur.metrics_v2?.overlap_with_previous;
  if (prev.metrics_v2 && cur.metrics_v2 && typeof overlap === "number") return overlap < BREAK_OVERLAP;
  return prev.comparability_key !== cur.comparability_key;
}

/** Self's market position: a single rank when the bootstrap agrees, else a range. */
export function position(m: MetricsV2): { rank: number; low: number; high: number; of: number; stable: boolean } {
  const p = m.market_position;
  const stable = p.rank_low === p.rank_high || (p.agreement ?? 0) >= 0.8;
  return { rank: p.rank, low: Math.min(p.rank_low, p.rank), high: Math.max(p.rank_high, p.rank), of: p.of, stable };
}

/** The competitor named most often, for "X is named in 41 answers, you in 4". */
export function leader(m: MetricsV2): { id: string; named: number; vi: number } | null {
  const others = Object.entries(m.entities).filter(([id]) => id !== m.self_id);
  if (!others.length) return null;
  const [id, e] = others.reduce((a, b) => (b[1].vi > a[1].vi ? b : a));
  return { id, named: e.named, vi: e.vi };
}

/** Full sentence per matched verdict, for the score card and the trend line ("since the last check"). */
export const CHANGE_KEY: Record<MatchedVerdict, MessageKey> = {
  rose_after: "dashboard.v2.change.rose_after",
  leaning_up: "dashboard.v2.change.leaning_up",
  no_detectable_change: "dashboard.v2.change.no_detectable_change",
  leaning_down: "dashboard.v2.change.leaning_down",
  fell_after: "dashboard.v2.change.fell_after",
  insufficient_data: "dashboard.v2.change.insufficient_data",
};

/** Short label per matched verdict, for status pills ("rose after", never "because of"). */
export const VERDICT_KEY: Record<MatchedVerdict, MessageKey> = {
  rose_after: "dashboard.v2.verdict.rose_after",
  leaning_up: "dashboard.v2.verdict.leaning_up",
  no_detectable_change: "dashboard.v2.verdict.no_detectable_change",
  leaning_down: "dashboard.v2.verdict.leaning_down",
  fell_after: "dashboard.v2.verdict.fell_after",
  insufficient_data: "dashboard.v2.verdict.insufficient_data",
};

/** Tone of a verdict for a status pill. */
export function verdictTone(v: string): "ok" | "err" | "muted" | "warn" {
  if (v === "rose_after") return "ok";
  if (v === "fell_after") return "err";
  if (v === "leaning_up" || v === "leaning_down" || v === "confounded") return "warn";
  return "muted";
}
