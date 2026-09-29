import { describe, expect, it } from "vitest";
import { measuredParts, ratingFromRange, scoreRange } from "./format";

describe("ratingFromRange", () => {
  it("bands from the low end, no upper when same band", () => {
    expect(ratingFromRange(10, 20)).toEqual({ band: "rarely" });
    expect(ratingFromRange(30, 40)).toEqual({ band: "sometimes" });
    expect(ratingFromRange(60, 65)).toEqual({ band: "often" });
    expect(ratingFromRange(80, 90)).toEqual({ band: "top" });
  });

  it("includes upper when the high end lands in a different band", () => {
    expect(ratingFromRange(10, 60)).toEqual({ band: "rarely", upper: "often" });
    expect(ratingFromRange(40, 55)).toEqual({ band: "sometimes", upper: "often" });
  });

  it("still works with swapped argument order", () => {
    expect(ratingFromRange(60, 10)).toEqual({ band: "rarely", upper: "often" });
  });
});

describe("scoreRange", () => {
  it("rounds 0-100 inputs to whole points", () => {
    expect(scoreRange({ composite_score: 50, ci_low: 40, ci_high: 60 })).toEqual([40, 60]);
    expect(scoreRange({ composite_score: 45.07, ci_low: 33.59, ci_high: 55.27 })).toEqual([34, 55]);
  });

  it("clamps to 0-100", () => {
    expect(scoreRange({ composite_score: 50, ci_low: -3, ci_high: 104 })).toEqual([0, 100]);
  });

  it("falls back to [score, score] when ci is missing or NaN", () => {
    expect(scoreRange({ composite_score: 50 })).toEqual([50, 50]);
    expect(scoreRange({ composite_score: 50, ci_low: NaN, ci_high: 60 })).toEqual([50, 50]);
    expect(scoreRange({ composite_score: 50, ci_low: 40, ci_high: null })).toEqual([50, 50]);
  });

  it("hi is never below lo", () => {
    expect(scoreRange({ composite_score: 50, ci_low: 60, ci_high: 40 })).toEqual([60, 60]);
  });
});

describe("measuredParts", () => {
  it("counts the defined components", () => {
    expect(measuredParts({ coverage: 0.5, prominence: 0.4, share_of_voice: 0.3 })).toBe(3);
    expect(measuredParts({ coverage: 0, prominence: null, share_of_voice: 0 })).toBe(2);
    expect(measuredParts({ coverage: 0, prominence: null, share_of_voice: null })).toBe(1);
    expect(measuredParts({ coverage: 0.2, prominence: undefined, share_of_voice: NaN })).toBe(1);
  });
});
