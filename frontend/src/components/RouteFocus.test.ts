import { describe, expect, it } from "vitest";
import { isNewPage, pageLabel, shouldTakeFocus } from "./RouteFocus";
import type { NodeLike } from "./RouteFocus";

/** A tiny tree of fake nodes: `contains` follows parent links, like the DOM's. */
function node(parent: NodeLike | null = null): NodeLike & { parent: NodeLike | null } {
  const n = {
    parent,
    contains(other: NodeLike | null): boolean {
      for (let cur = other as (NodeLike & { parent?: NodeLike | null }) | null; cur; cur = cur.parent ?? null) {
        if (cur === n) return true;
      }
      return false;
    },
  };
  return n;
}

describe("isNewPage", () => {
  it("skips the first load", () => {
    expect(isNewPage(null, "/app")).toBe(false);
  });
  it("fires on a pathname change only", () => {
    expect(isNewPage("/app", "/brands/x")).toBe(true);
    expect(isNewPage("/brands/x", "/brands/x")).toBe(false);
  });
});

describe("shouldTakeFocus", () => {
  const body = node();
  const header = node(body);
  const main = node(body);
  const pageField = node(main);
  const headerLink = node(header);

  it("takes focus from the body (the clicked link unmounted)", () => {
    expect(shouldTakeFocus(body, { body, main, trigger: null })).toBe(true);
    expect(shouldTakeFocus(null, { body, main, trigger: null })).toBe(true);
  });
  it("takes focus from <main> itself", () => {
    expect(shouldTakeFocus(main, { body, main, trigger: null })).toBe(true);
  });
  it("takes focus from the element that started the navigation", () => {
    const link = node(main);
    expect(shouldTakeFocus(link, { body, main, trigger: link })).toBe(true);
    const icon = node(link);
    expect(shouldTakeFocus(link, { body, main, trigger: icon })).toBe(true);
  });
  it("takes focus from the header (outside main)", () => {
    expect(shouldTakeFocus(headerLink, { body, main, trigger: null })).toBe(true);
  });
  it("leaves focus the new page placed itself", () => {
    const link = node(main);
    expect(shouldTakeFocus(pageField, { body, main, trigger: link })).toBe(false);
  });
});

describe("pageLabel", () => {
  it("prefers the heading, collapsing whitespace", () => {
    expect(pageLabel("  Gaps &\n evidence ", "App")).toBe("Gaps & evidence");
  });
  it("falls back to the document title", () => {
    expect(pageLabel("", " App ")).toBe("App");
    expect(pageLabel(null, "App")).toBe("App");
  });
});
