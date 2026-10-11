import { describe, expect, it } from "vitest";
import { oneIn, wholeRank } from "./plain";

describe("oneIn", () => {
  it("rounds a share to a friendly 'about 1 in N'", () => {
    expect(oneIn(0.093)).toBe(10);
    expect(oneIn(0.33)).toBe(3);
    expect(oneIn(0.07)).toBe(10);
    expect(oneIn(0.02)).toBe(50);
  });

  it("returns null for half or more, zero and junk", () => {
    expect(oneIn(0.5)).toBeNull();
    expect(oneIn(0.8)).toBeNull();
    expect(oneIn(0)).toBeNull();
    expect(oneIn(Number.NaN)).toBeNull();
  });
});

describe("wholeRank", () => {
  it("rounds a position and never goes below first", () => {
    expect(wholeRank(3.4)).toBe(3);
    expect(wholeRank(0.2)).toBe(1);
    expect(wholeRank(Number.NaN)).toBe(1);
  });
});
