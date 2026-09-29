import { afterEach, describe, expect, it, vi } from "vitest";
import { patchBrandSummary, peekBrandSummary, rememberBrands } from "../components/hub/brandCache";
import { deleteBrand, getLatestSnapshot, getSnapshots, peekLatestSnapshot } from "./client";

function snap(runId: string, composite: number) {
  return {
    brand_key: "b1",
    run_id: runId,
    analysis_result: { coverage: 0.5, prominence: null, share_of_voice: 0.4, composite_score: composite, ci_low: composite - 10, ci_high: composite + 10, per_provider_coverage: [] },
  };
}

function stubFetch(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
}

afterEach(() => vi.unstubAllGlobals());

describe("snapshot scale", () => {
  it("passes composite / CI through on the backend's 0-100 scale", async () => {
    stubFetch(snap("r1", 45.07));
    const s = await getLatestSnapshot("b1");
    expect(s.analysis_result.composite_score).toBe(45.07);
    expect(s.analysis_result.ci_low).toBeCloseTo(35.07);
    expect(s.analysis_result.coverage).toBe(0.5);
    stubFetch([snap("r0", 30), snap("r1", 45.07)]);
    const all = await getSnapshots("b1");
    expect(all.map((x) => x.analysis_result.composite_score)).toEqual([30, 45.07]);
  });
});

describe("latestCache", () => {
  it("is overwritten by each getLatestSnapshot (e.g. BrandContext.reload after a run)", async () => {
    stubFetch(snap("r1", 40));
    await getLatestSnapshot("b1");
    expect(peekLatestSnapshot("b1")?.run_id).toBe("r1");
    stubFetch(snap("r2", 55));
    await getLatestSnapshot("b1");
    expect(peekLatestSnapshot("b1")?.run_id).toBe("r2");
    expect(peekLatestSnapshot("b1")?.analysis_result.composite_score).toBe(55);
  });

  it("is cleared by deleteBrand", async () => {
    stubFetch(snap("r1", 40));
    await getLatestSnapshot("b1");
    stubFetch({ brand_key: "b1", deleted: true });
    await deleteBrand("b1");
    expect(peekLatestSnapshot("b1")).toBeUndefined();
  });
});

describe("brand list cache", () => {
  it("patchBrandSummary updates has_data / question_count of the cached list", () => {
    rememberBrands([{ brand_key: "b1", brand: "B1", has_data: false, is_pilot: false, question_count: 8 }]);
    patchBrandSummary("b1", { has_data: true, question_count: 9 });
    expect(peekBrandSummary("b1")).toMatchObject({ has_data: true, question_count: 9 });
    patchBrandSummary("missing", { has_data: true });
    expect(peekBrandSummary("missing")).toBeUndefined();
  });
});
