import { describe, expect, it } from "vitest";
import { tabForPath } from "./mobileTabs";

describe("tabForPath", () => {
  it("maps a brand's hub and modules to their tabs", () => {
    expect(tabForPath("/brands/vada-pav")).toBe("hub");
    expect(tabForPath("/brands/vada-pav/")).toBe("hub");
    expect(tabForPath("/brands/vada-pav/details")).toBe("details");
    expect(tabForPath("/brands/vada-pav/analysis")).toBe("analysis");
    expect(tabForPath("/brands/vada-pav/gaps")).toBe("gaps");
    expect(tabForPath("/brands/vada-pav/recommendations")).toBe("recommendations");
  });
  it("hides in Campaign Studio, which has its own bottom action bar", () => {
    expect(tabForPath("/brands/vada-pav/recommendations/c-42")).toBeNull();
  });
  it("hides outside brand pages and on unknown sub-paths", () => {
    expect(tabForPath("/app")).toBeNull();
    expect(tabForPath("/providers")).toBeNull();
    expect(tabForPath("/brands")).toBeNull();
    expect(tabForPath("/brands/vada-pav/runs/r1/evidence")).toBeNull();
  });
});
