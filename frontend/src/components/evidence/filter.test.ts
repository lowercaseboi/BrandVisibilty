import { describe, expect, it } from "vitest";
import type { Gap, Mention, Observation } from "../../api/types";
import { evidenceHref } from "../../format";
import { NO_FILTER, distinct, filterObservations, gapKey, isFiltered, parseRefs, sameRefs, scopeObservations } from "./filter";

const mention = (entity_kind: Mention["entity_kind"]): Mention => ({
  entity_id: entity_kind === "self" ? "self" : "c1",
  entity_kind,
  rank: 1,
  char_start: 0,
  char_end: 3,
  is_passing_mention: false,
});

const obs = (id: string, over: Partial<Observation> = {}): Observation => ({
  observation_id: id,
  query_id: `q-${id}`,
  query_text: "best vada pav in pune",
  intent_type: "local_contextual",
  provider_id: "gemini",
  model_version: "m",
  response_text: "Try Foo or Bar.",
  mentions: [],
  ...over,
});

const gap = (refs: string[], id: string | null = "g1"): Gap =>
  ({ gap_id: id, gap_type: "presence", evidence_refs: refs, detail: {}, is_inferred: false }) as unknown as Gap;

describe("evidence filters", () => {
  const all = [
    obs("a"),
    obs("b", { provider_id: "groq", mentions: [mention("self")] }),
    obs("c", { intent_type: "problem_first", response_text: "Gajanan is great", mentions: [mention("competitor")] }),
  ];

  it("passes everything with no filter", () => {
    expect(filterObservations(all, NO_FILTER)).toHaveLength(3);
    expect(isFiltered(NO_FILTER)).toBe(false);
  });

  it("combines intent, provider, brand-only and case-insensitive text", () => {
    expect(filterObservations(all, { ...NO_FILTER, intent: "problem_first" }).map((o) => o.observation_id)).toEqual(["c"]);
    expect(filterObservations(all, { ...NO_FILTER, provider: "groq" }).map((o) => o.observation_id)).toEqual(["b"]);
    expect(filterObservations(all, { ...NO_FILTER, onlyBrand: true }).map((o) => o.observation_id)).toEqual(["b"]);
    expect(filterObservations(all, { ...NO_FILTER, text: "  GAJANAN " }).map((o) => o.observation_id)).toEqual(["c"]);
    expect(isFiltered({ ...NO_FILTER, text: " x " })).toBe(true);
  });

  it("scopes to refs in original order", () => {
    expect(scopeObservations(all, new Set(["c", "a", "zzz"])).map((o) => o.observation_id)).toEqual(["a", "c"]);
    expect(scopeObservations(all, null)).toBe(all);
  });

  it("lists distinct sorted options", () => {
    expect(distinct(all, (o) => o.intent_type)).toEqual(["local_contextual", "problem_first"]);
  });
});

describe("gap selection", () => {
  it("parses ?refs=", () => {
    expect(parseRefs(null)).toBeNull();
    expect(parseRefs(" , ")).toBeNull();
    expect([...(parseRefs("a, b,,a") ?? [])]).toEqual(["a", "b"]);
  });

  it("matches a gap only on the exact evidence set", () => {
    expect(sameRefs(gap(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameRefs(gap(["a", "b"]), new Set(["a"]))).toBe(false);
    expect(sameRefs(gap(["a"]), new Set(["a", "b"]))).toBe(false);
  });

  it("keys gaps by id, else position", () => {
    expect(gapKey(gap([]), 3)).toBe("g1");
    expect(gapKey(gap([], null), 3)).toBe("idx-3");
  });
});

describe("evidenceHref", () => {
  it("points at the Gaps & evidence module", () => {
    expect(evidenceHref("gajanan", "run-1")).toBe("/brands/gajanan/gaps?run=run-1");
    const href = evidenceHref("va mayekar", "r/2", ["o1", "o2"]);
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/brands/va%20mayekar/gaps");
    expect(url.searchParams.get("run")).toBe("r/2");
    expect(url.searchParams.get("refs")).toBe("o1,o2");
  });
});
