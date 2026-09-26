import { describe, expect, it } from "vitest";
import { effortLevel, toScore } from "./helpers";

describe("effortLevel", () => {
  it("undefined or 1 -> 1", () => {
    expect(effortLevel(undefined)).toBe(1);
    expect(effortLevel(1)).toBe(1);
  });

  it("2-4 -> 2", () => {
    expect(effortLevel(2)).toBe(2);
    expect(effortLevel(4)).toBe(2);
  });

  it(">=5 -> 3", () => {
    expect(effortLevel(5)).toBe(3);
    expect(effortLevel(9)).toBe(3);
  });
});

describe("toScore", () => {
  it("clamps to 0-1 and rounds to whole points", () => {
    expect(toScore(0.5)).toBe(50);
    expect(toScore(-1)).toBe(0);
    expect(toScore(2)).toBe(100);
  });

  it("null/undefined/NaN -> 0", () => {
    expect(toScore(null)).toBe(0);
    expect(toScore(undefined)).toBe(0);
    expect(toScore(NaN)).toBe(0);
  });
});
