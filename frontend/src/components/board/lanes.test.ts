import { describe, expect, it } from "vitest";
import { laneIndexFromScroll, lanesInView } from "./lanes";

describe("laneIndexFromScroll", () => {
  it("maps snap points to their lane", () => {
    expect(laneIndexFromScroll(0, 360, 5)).toBe(0);
    expect(laneIndexFromScroll(360, 360, 5)).toBe(1);
    expect(laneIndexFromScroll(1440, 360, 5)).toBe(4);
  });

  it("rounds to the nearest lane mid-swipe", () => {
    expect(laneIndexFromScroll(179, 360, 5)).toBe(0);
    expect(laneIndexFromScroll(180, 360, 5)).toBe(1);
    expect(laneIndexFromScroll(900.4, 376, 5)).toBe(2);
  });

  it("clamps overscroll and bounces to the first / last lane", () => {
    expect(laneIndexFromScroll(-40, 360, 5)).toBe(0);
    expect(laneIndexFromScroll(5000, 360, 5)).toBe(4);
  });

  it("is 0 for no lanes, no width or a bad position", () => {
    expect(laneIndexFromScroll(500, 360, 0)).toBe(0);
    expect(laneIndexFromScroll(500, 0, 5)).toBe(0);
    expect(laneIndexFromScroll(500, -10, 5)).toBe(0);
    expect(laneIndexFromScroll(Number.NaN, 360, 5)).toBe(0);
  });
});

describe("lanesInView", () => {
  it("is one lane once settled (within the tolerance)", () => {
    expect(lanesInView(720, 360, 5)).toEqual([2, 2]);
    expect(lanesInView(721.5, 360, 5)).toEqual([2, 2]);
  });

  it("is the two neighbours mid-swipe", () => {
    expect(lanesInView(500, 360, 5)).toEqual([1, 2]);
    expect(lanesInView(10, 360, 5)).toEqual([0, 1]);
  });

  it("stays inside the lanes when overscrolled", () => {
    expect(lanesInView(-30, 360, 5)).toEqual([0, 0]);
    expect(lanesInView(1500, 360, 5)).toEqual([4, 4]);
  });
});
