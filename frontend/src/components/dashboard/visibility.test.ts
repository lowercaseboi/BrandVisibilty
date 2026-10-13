import { describe, expect, it } from "vitest";
import type { MetricsV2, Snapshot } from "../../api/types";
import { sinceDelta } from "../campaign/trendMarkers";
import { headline, headlineRating, isBreak, leader, position, previewTrend, ratingFromVi, viDigits } from "./visibility";

function metrics(vi: number, ci: [number, number], extra: Partial<MetricsV2> = {}): MetricsV2 {
  return {
    metric_version: "v2.0",
    metric_config_hash: "h",
    answers: 102,
    questions: 17,
    answer_rate: 0.97,
    self_id: "self",
    entities: {
      self: { vi, ci, answers: 102, named: 4, first: 0, presence: 0.04, mean_weight_named: 0.5 },
      ashok: { vi: 26.5, ci: [13.5, 40.9], answers: 96, named: 36, first: 20, presence: 0.37, mean_weight_named: 0.7 },
      goli: { vi: 11.1, ci: [5.9, 16.4], answers: 102, named: 26, first: 2, presence: 0.25, mean_weight_named: 0.44 },
    },
    low_information: false,
    market_position: { rank: 3, of: 3, rank_low: 2, rank_high: 3, agreement: 0.85 },
    share_of_recommendations: { value: 0.05, ci: [0, 0.1] },
    head_to_head: {},
    question_reach: { named: 3, reliable: 0, of: 17 },
    per_question: {},
    per_provider: {},
    per_intent: {},
    mde_design: 3.5,
    ...extra,
  };
}

function snap(at: string, opts: { vi?: number; composite?: number; key?: string; overlap?: number | null } = {}): Snapshot {
  return {
    brand_key: "b",
    brand: "B",
    run_id: at,
    status: "completed",
    comparability_key: opts.key ?? "k",
    collection_started_at: at,
    collection_completed_at: at,
    collection_span_days: 0,
    query_set_content_hash: "q",
    query_set_template_version: "v1",
    sampling_config: { temperature: null, system_prompt: null, samples_per_query: 3 },
    observation_count: 102,
    mentioned_count: 4,
    cluster_count: 17,
    analysis_result: {
      coverage: 0.04, prominence: 0.5, share_of_voice: 0.07, composite_score: opts.composite ?? 19.5,
      ci_low: 0, ci_high: 24.8, per_provider_coverage: [],
    },
    gaps: [],
    metrics_v2:
      opts.vi === undefined ? undefined : { ...metrics(opts.vi, [Math.max(0, opts.vi - 2), opts.vi + 3]), overlap_with_previous: opts.overlap ?? null },
  };
}

describe("headline", () => {
  it("is the Visibility Index when the run has metrics v2", () => {
    const h = headline(snap("2026-10-01", { vi: 2.15 }));
    expect(h.version).toBe("v2");
    expect(h.value).toBe(2.15);
    expect([h.lo, h.hi]).toEqual([expect.closeTo(0.15), expect.closeTo(5.15)]);
  });
  it("falls back to the v1 composite for older payloads", () => {
    expect(headline(snap("2026-10-01", { composite: 19.46 }))).toMatchObject({ value: 19.46, lo: 0, hi: 24.8, version: "v1" });
  });
  it("keeps one decimal only for small values", () => {
    expect(viDigits(2.1)).toBe(1);
    expect(viDigits(26.5)).toBe(0);
  });
});

describe("ratingFromVi", () => {
  it("uses the low end, with VI bands", () => {
    expect(ratingFromVi(0, 4.9)).toEqual({ band: "rarely" });
    expect(ratingFromVi(13.5, 40.9)).toEqual({ band: "sometimes", upper: "top" });
    expect(ratingFromVi(22, 30)).toEqual({ band: "often" });
  });
  it("v1 payloads keep the v1 bands", () => {
    expect(headlineRating(snap("2026-10-01", { composite: 60 }))).toMatchObject({ band: "rarely" }); // low end 0
  });
});

describe("position and leader", () => {
  it("states one rank only when the bootstrap mostly agrees", () => {
    expect(position(metrics(2, [0, 5])).stable).toBe(true);
    const unsettled = metrics(2, [0, 5], { market_position: { rank: 5, of: 6, rank_low: 3, rank_high: 6, agreement: 0.6 } });
    expect(position(unsettled)).toEqual({ rank: 5, low: 3, high: 6, of: 6, stable: false });
  });
  it("names the most visible competitor", () => {
    expect(leader(metrics(2, [0, 5]))).toEqual({ id: "ashok", named: 36, vi: 26.5 });
  });
});

describe("isBreak", () => {
  it("breaks on low overlap between v2 runs, not on a different comparability key", () => {
    const a = snap("2026-10-01", { vi: 2, key: "k1" });
    expect(isBreak(a, snap("2026-10-02", { vi: 3, key: "k2", overlap: 1 }))).toBe(false);
    expect(isBreak(a, snap("2026-10-02", { vi: 3, key: "k1", overlap: 0.18 }))).toBe(true);
  });
  it("keeps the v1 rule for older payloads", () => {
    expect(isBreak(snap("2026-10-01", { key: "k1" }), snap("2026-10-02", { key: "k2" }))).toBe(true);
  });
});

describe("sinceDelta (v2)", () => {
  it("compares headline values across matched runs", () => {
    const runs = [snap("2026-10-01", { vi: 2 }), snap("2026-10-05", { vi: 3, overlap: 1 }), snap("2026-10-09", { vi: 5.5, overlap: 0.9 })];
    expect(sinceDelta(runs, "2026-10-02")).toBeCloseTo(3.5);
    const broken = [snap("2026-10-01", { vi: 2 }), snap("2026-10-05", { vi: 9, overlap: 0.2 })];
    expect(sinceDelta(broken, "2026-10-02")).toBeNull();
  });
});

describe("previewTrend", () => {
  it("maps matched verdicts onto the compact preview vocabulary", () => {
    const s = snap("2026-10-01", { vi: 2 });
    const v2 = (status: string, method = "matched") => ({
      ...s,
      trend_verdict_v2: { status, method, direction: null, n_points: 2, segment_run_ids: [], comparison: null, slope: null },
    }) as Snapshot;
    expect(previewTrend(v2("rose_after"))).toMatchObject({ status: "change_detected", direction: "up" });
    expect(previewTrend(v2("leaning_down"))).toMatchObject({ status: "no_change_detected" });
    expect(previewTrend(v2("insufficient_data"))).toMatchObject({ status: "insufficient_data" });
    expect(previewTrend(v2("improving", "theil_sen"))).toMatchObject({ status: "improving" });
  });
});
