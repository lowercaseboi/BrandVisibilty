import { describe, expect, it } from "vitest";
import { dragOffset, shouldDismissSheet } from "./sheetDrag";

describe("shouldDismissSheet", () => {
  it("closes once pulled past 30% of the height", () => {
    expect(shouldDismissSheet(120, 400, 0)).toBe(true);
    expect(shouldDismissSheet(119, 400, 0)).toBe(false);
  });

  it("closes on a quick flick that moved a little", () => {
    expect(shouldDismissSheet(30, 400, 0.8)).toBe(true);
    expect(shouldDismissSheet(10, 400, 2)).toBe(false);
  });

  it("never closes when pushed up or with no height", () => {
    expect(shouldDismissSheet(-200, 400, 3)).toBe(false);
    expect(shouldDismissSheet(0, 400, 3)).toBe(false);
    expect(shouldDismissSheet(50, 0, 3)).toBe(false);
  });
});

describe("dragOffset", () => {
  it("follows the finger down and resists going up", () => {
    expect(dragOffset(80)).toBe(80);
    expect(dragOffset(-100)).toBe(-20);
    expect(dragOffset(0)).toBe(0);
  });
});
