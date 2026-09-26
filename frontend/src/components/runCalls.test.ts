import { describe, expect, it } from "vitest";
import { runCalls } from "./runMath";

describe("runCalls", () => {
  it("multiplies questions x samples x max(1, ais)", () => {
    expect(runCalls(27, 3, 2)).toBe(162);
  });

  it("treats 0 ais as 1", () => {
    expect(runCalls(27, 3, 0)).toBe(81);
  });
});
