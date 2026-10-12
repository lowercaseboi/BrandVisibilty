import { describe, expect, it } from "vitest";
import { spotlightEnabled } from "./spotlightRoutes";

describe("spotlightEnabled", () => {
  it("is on for the landing, the brand list, connections and the hub", () => {
    for (const p of ["/", "/app", "/providers", "/brands/acme", "/brands/acme/"]) expect(spotlightEnabled(p)).toBe(true);
  });

  it("is off inside every module, including Campaign Studio", () => {
    for (const m of ["details", "analysis", "gaps", "recommendations"]) expect(spotlightEnabled(`/brands/acme/${m}`)).toBe(false);
    expect(spotlightEnabled("/brands/acme/recommendations/camp-1")).toBe(false);
  });

  it("does not mistake a brand named like a module for one", () => {
    expect(spotlightEnabled("/brands/analysis")).toBe(true);
  });
});
