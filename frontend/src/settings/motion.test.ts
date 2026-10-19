import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollBehavior } from "./motion";

afterEach(() => vi.unstubAllGlobals());

const stubReduced = (matches: boolean) =>
  vi.stubGlobal("window", { matchMedia: () => ({ matches, addEventListener() {}, removeEventListener() {} }) });

describe("scrollBehavior", () => {
  it("is instant when the user prefers reduced motion", () => {
    stubReduced(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("is smooth otherwise", () => {
    stubReduced(false);
    expect(scrollBehavior()).toBe("smooth");
  });
});
