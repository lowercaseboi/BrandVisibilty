import { describe, expect, it } from "vitest";
import { popDirection, shouldAnimatePop } from "./navDirection";
import type { PopContext } from "./navDirection";

describe("popDirection", () => {
  it("reads a lower history index as back", () => {
    expect(popDirection(4, 3)).toBe("back");
    expect(popDirection(1, 0)).toBe("back");
  });
  it("reads a higher history index as forward", () => {
    expect(popDirection(2, 3)).toBe("forward");
  });
  it("falls back to back when either index is unknown", () => {
    expect(popDirection(null, 3)).toBe("back");
    expect(popDirection(2, undefined)).toBe("back");
    expect(popDirection(Number.NaN, 3)).toBe("back");
    expect(popDirection("2", 3)).toBe("back");
  });
  it("treats the same index as back", () => {
    expect(popDirection(2, 2)).toBe("back");
  });
});

describe("shouldAnimatePop", () => {
  const base: PopContext = { replaying: false, phone: true, canMorph: true, busy: false, uaVisual: false };

  it("animates a plain browser back on a phone", () => {
    expect(shouldAnimatePop(base)).toBe(true);
  });
  it("lets its own replayed event through", () => {
    expect(shouldAnimatePop({ ...base, replaying: true })).toBe(false);
  });
  it("stays instant on wider screens", () => {
    expect(shouldAnimatePop({ ...base, phone: false })).toBe(false);
  });
  it("stays instant without View Transitions or under reduced motion", () => {
    expect(shouldAnimatePop({ ...base, canMorph: false })).toBe(false);
  });
  it("doesn't stack on a transition already running", () => {
    expect(shouldAnimatePop({ ...base, busy: true })).toBe(false);
  });
  it("doesn't replay what the browser already animated", () => {
    expect(shouldAnimatePop({ ...base, uaVisual: true })).toBe(false);
  });
});
