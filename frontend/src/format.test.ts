import { describe, expect, it } from "vitest";
import { ratingFromRange, scoreRange } from "./format";

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
  it("converts 0-1 inputs to whole points", () => {
    expect(scoreRange({ composite_score: 0.5, ci_low: 0.4, ci_high: 0.6 })).toEqual([40, 60]);
  });

  it("falls back to [score, score] when ci is missing or NaN", () => {
    expect(scoreRange({ composite_score: 0.5 })).toEqual([50, 50]);
    expect(scoreRange({ composite_score: 0.5, ci_low: NaN, ci_high: 0.6 })).toEqual([50, 50]);
    expect(scoreRange({ composite_score: 0.5, ci_low: 0.4, ci_high: null })).toEqual([50, 50]);
  });

  it("hi is never below lo", () => {
    expect(scoreRange({ composite_score: 0.5, ci_low: 0.6, ci_high: 0.4 })).toEqual([60, 60]);
  });
});
