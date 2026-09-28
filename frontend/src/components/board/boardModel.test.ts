import { describe, expect, it } from "vitest";
import type { BoardState, Gap, Recommendation } from "../../api/types";
import { groupSuggestions, parseSuggestionKey } from "../dashboard/helpers";
import {
  buildBoard,
  clearLegacyDone,
  emptyBoardState,
  filterCounts,
  findCard,
  legacyDoneKey,
  migrateLegacyDone,
  moveCard,
  readLegacyDone,
  listCards,
  matchesFilter,
  removeCard,
  setStatus,
  summarizeBoard,
} from "./boardModel";
import type { BoardColumnView, StorageLike } from "./boardModel";

const T0 = "2026-09-01T00:00:00.000Z";
const NOW = "2026-09-28T12:00:00.000Z";

function gap(id: string, type: string, detail: Record<string, unknown> = {}): Gap {
  return { gap_id: id, gap_type: type, evidence_refs: [], detail, is_inferred: false };
}

function rec(id: string, action: string, gapId: string, priority: number, refs: string[] = []): Recommendation {
  return {
    recommendation_id: id,
    gap_id: gapId,
    action,
    action_class: "content",
    priority,
    delta_composite: priority * 10,
    confidence: 0.8,
    effort: 3,
    reasoning: "",
    evidence_refs: refs,
    drafted_by: "template",
  };
}

const GAPS = [
  gap("g1", "presence", { scope: "provider", provider_id: "gemini" }),
  gap("g2", "presence", { scope: "provider", provider_id: "groq" }),
  gap("g3", "competitive", { competitor_id: "rival" }),
  gap("g4", "prominence"),
];

const RECS = [
  rec("r1", "submit_to_directory", "g1", 0.5, ["o1"]),
  rec("r2", "submit_to_directory", "g2", 0.4, ["o2", "o1"]),
  rec("r3", "comparison_page", "g3", 0.9, ["o3"]),
  rec("r4", "faq_page", "g4", 0.2),
];

const ENTITIES = { self: "Us", rival: "Rival Perfumes" };

const keys = (cols: BoardColumnView[], id: string) => cols.find((c) => c.id === id)!.cards.map((c) => c.key);

function state(cards: BoardState["cards"]): BoardState {
  return { brand_key: "b", cards };
}

function memoryStorage(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe("groupSuggestions", () => {
  it("groups by action|competitor, highest priority first, merging gaps and refs", () => {
    const groups = groupSuggestions(RECS, new Map(GAPS.map((g) => [g.gap_id, g])));
    expect(groups.map((g) => g.key)).toEqual(["comparison_page|rival", "submit_to_directory|", "faq_page|"]);
    const listing = groups[1];
    expect(listing.lead.recommendation_id).toBe("r1");
    expect(listing.gaps.map((g) => g.gap_id)).toEqual(["g1", "g2"]);
    expect(listing.refs).toEqual(["o1", "o2"]);
  });

  it("parses keys back into action and competitor", () => {
    expect(parseSuggestionKey("comparison_page|rival")).toEqual({ action: "comparison_page", competitorId: "rival" });
    expect(parseSuggestionKey("faq_page|")).toEqual({ action: "faq_page", competitorId: null });
  });
});

describe("buildBoard", () => {
  it("returns five columns; with no saved state every group is Suggested by priority", () => {
    const cols = buildBoard(RECS, GAPS, ENTITIES, null);
    expect(cols.map((c) => c.id)).toEqual(["suggested", "saved", "in_progress", "done", "rejected"]);
    expect(keys(cols, "suggested")).toEqual(["comparison_page|rival", "submit_to_directory|", "faq_page|"]);
    const first = cols[0].cards[0];
    expect(first.competitor).toBe("Rival Perfumes");
    expect(first.suggestion?.lead.recommendation_id).toBe("r3");
    expect(first.updatedAt).toBeNull();
  });

  it("places saved cards by column and order; unsaved ones append to Suggested", () => {
    const cols = buildBoard(
      RECS,
      GAPS,
      ENTITIES,
      state({
        "faq_page|": { column: "in_progress", order: 1, updated_at: T0 },
        "comparison_page|rival": { column: "in_progress", order: 0, updated_at: T0 },
      }),
    );
    expect(keys(cols, "in_progress")).toEqual(["comparison_page|rival", "faq_page|"]);
    expect(keys(cols, "suggested")).toEqual(["submit_to_directory|"]);
  });

  it("keeps saved order in Suggested ahead of new suggestions", () => {
    const cols = buildBoard(RECS, GAPS, ENTITIES, state({ "faq_page|": { column: "suggested", order: 0, updated_at: T0 } }));
    expect(keys(cols, "suggested")).toEqual(["faq_page|", "comparison_page|rival", "submit_to_directory|"]);
  });

  it("shows keys with no current recommendation as resolved ghosts, except in Suggested", () => {
    const cols = buildBoard(
      RECS,
      GAPS,
      ENTITIES,
      state({
        "video|": { column: "done", order: 0, updated_at: T0 },
        "comparison_page|other": { column: "rejected", order: 0, updated_at: T0 },
        "pitch_listicle|": { column: "suggested", order: 0, updated_at: T0 },
      }),
    );
    const done = cols.find((c) => c.id === "done")!.cards;
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ key: "video|", suggestion: null, action: "video", competitor: null, updatedAt: T0 });
    const rejected = cols.find((c) => c.id === "rejected")!.cards[0];
    expect(rejected).toMatchObject({ suggestion: null, competitorId: "other", competitor: "Other" });
    expect(keys(cols, "suggested")).not.toContain("pitch_listicle|");
  });

  it("ignores entries with an unknown column and tolerates missing inputs", () => {
    const bad = state({ "faq_page|": { column: "archived" as never, order: 0, updated_at: T0 } });
    expect(keys(buildBoard(RECS, GAPS, ENTITIES, bad), "suggested")).toContain("faq_page|");
    const empty = buildBoard(undefined, undefined, undefined, undefined);
    expect(empty.every((c) => c.cards.length === 0)).toBe(true);
  });
});

describe("moveCard", () => {
  const base = emptyBoardState("b");
  const cols = buildBoard(RECS, GAPS, ENTITIES, base);

  it("moves a card to another column and renumbers the destination", () => {
    const next = moveCard(base, cols, "faq_page|", "in_progress", 0, NOW);
    expect(next.cards["faq_page|"]).toEqual({ column: "in_progress", order: 0, updated_at: NOW });
    const after = buildBoard(RECS, GAPS, ENTITIES, next);
    expect(keys(after, "in_progress")).toEqual(["faq_page|"]);
    expect(keys(after, "suggested")).toEqual(["comparison_page|rival", "submit_to_directory|"]);
  });

  it("inserts at the index and clamps out-of-range indexes", () => {
    let s = moveCard(base, cols, "faq_page|", "done", 0, NOW);
    let c = buildBoard(RECS, GAPS, ENTITIES, s);
    s = moveCard(s, c, "comparison_page|rival", "done", 0, NOW);
    c = buildBoard(RECS, GAPS, ENTITIES, s);
    s = moveCard(s, c, "submit_to_directory|", "done", 99, NOW);
    c = buildBoard(RECS, GAPS, ENTITIES, s);
    expect(keys(c, "done")).toEqual(["comparison_page|rival", "faq_page|", "submit_to_directory|"]);
    expect(Object.values(s.cards).map((x) => x.order)).toEqual(expect.arrayContaining([0, 1, 2]));
  });

  it("reorders within a column, materialising never-saved suggestions", () => {
    const next = moveCard(base, cols, "faq_page|", "suggested", 0, NOW);
    expect(keys(buildBoard(RECS, GAPS, ENTITIES, next), "suggested")).toEqual([
      "faq_page|",
      "comparison_page|rival",
      "submit_to_directory|",
    ]);
    expect(Object.keys(next.cards)).toHaveLength(3);
  });

  it("keeps updated_at of cards that only shifted position; drops hidden Suggested ghosts", () => {
    const s = state({
      "comparison_page|rival": { column: "done", order: 0, updated_at: T0 },
      "gone|": { column: "suggested", order: 0, updated_at: T0 },
      "video|": { column: "rejected", order: 0, updated_at: T0 },
    });
    const c = buildBoard(RECS, GAPS, ENTITIES, s);
    const next = moveCard(s, c, "faq_page|", "done", 0, NOW);
    expect(next.cards["comparison_page|rival"]).toEqual({ column: "done", order: 1, updated_at: T0 });
    expect(next.cards["gone|"]).toBeUndefined();
    expect(next.cards["video|"]).toEqual({ column: "rejected", order: 0, updated_at: T0 });
  });

  it("finds a card's position", () => {
    expect(findCard(cols, "submit_to_directory|")).toEqual({ column: "suggested", index: 1 });
    expect(findCard(cols, "nope|")).toBeNull();
  });

  it("removes a card", () => {
    const s = state({ "video|": { column: "done", order: 0, updated_at: T0 } });
    expect(removeCard(s, "video|").cards).toEqual({});
  });
});

describe("list view", () => {
  const saved = state({
    "faq_page|": { column: "done", order: 0, updated_at: T0 },
    "video|": { column: "rejected", order: 0, updated_at: T0 },
    "comparison_page|rival": { column: "in_progress", order: 0, updated_at: T0 },
  });
  const cols = buildBoard(RECS, GAPS, ENTITIES, saved);

  it("lists live cards by priority whatever their status, ghosts last", () => {
    expect(listCards(cols).map((c) => c.key)).toEqual([
      "comparison_page|rival",
      "submit_to_directory|",
      "faq_page|",
      "video|",
    ]);
  });

  it("counts cards per filter; open means Suggested or Saved for later", () => {
    const cards = listCards(cols);
    expect(filterCounts(cards)).toEqual({ all: 4, open: 1, in_progress: 1, done: 1, rejected: 1 });
    expect(matchesFilter({ ...cards[0], column: "saved" }, "open")).toBe(true);
  });

  it("sets a status by moving the card to the end of that column; no-op when unchanged", () => {
    const next = setStatus(saved, cols, "submit_to_directory|", "done", NOW);
    expect(next.cards["submit_to_directory|"]).toEqual({ column: "done", order: 1, updated_at: NOW });
    expect(next.cards["faq_page|"]).toEqual({ column: "done", order: 0, updated_at: T0 });
    expect(setStatus(saved, cols, "faq_page|", "done", NOW)).toBe(saved);
    expect(setStatus(saved, cols, "missing|", "done", NOW)).toBe(saved);
  });
});

describe("summarizeBoard", () => {
  it("counts cards per column and resolved ghosts", () => {
    const cols = buildBoard(
      RECS,
      GAPS,
      ENTITIES,
      state({
        "faq_page|": { column: "done", order: 0, updated_at: T0 },
        "video|": { column: "done", order: 1, updated_at: T0 },
      }),
    );
    expect(summarizeBoard(cols)).toEqual({
      counts: { suggested: 2, saved: 0, in_progress: 0, done: 2, rejected: 0 },
      total: 4,
      resolved: 1,
    });
  });
});

describe("legacy done migration", () => {
  const groups = groupSuggestions(RECS, new Map(GAPS.map((g) => [g.gap_id, g])));

  it("returns null when nothing is stored", () => {
    expect(migrateLegacyDone("b", emptyBoardState("b"), groups, memoryStorage(), NOW)).toBeNull();
  });

  it("moves ticked keys to Done in priority order, then leftover keys, after existing Done cards", () => {
    const storage = memoryStorage({
      [legacyDoneKey("b")]: JSON.stringify(["old_action|", "faq_page|", "comparison_page|rival", 7]),
    });
    const s = state({ "video|": { column: "done", order: 4, updated_at: T0 } });
    const res = migrateLegacyDone("b", s, groups, storage, NOW)!;
    expect(res.migrated).toEqual(["comparison_page|rival", "faq_page|", "old_action|"]);
    expect(res.state.cards["comparison_page|rival"]).toEqual({ column: "done", order: 5, updated_at: NOW });
    expect(res.state.cards["old_action|"].order).toBe(7);
    expect(res.state.cards["video|"]).toEqual(s.cards["video|"]);
    // Migration never clears storage by itself.
    expect(storage.data[legacyDoneKey("b")]).toBeDefined();
    const cols = buildBoard(RECS, GAPS, ENTITIES, res.state);
    expect(keys(cols, "done")).toEqual(["video|", "comparison_page|rival", "faq_page|", "old_action|"]);
  });

  it("lets saved board state win over a legacy tick", () => {
    const storage = memoryStorage({ [legacyDoneKey("b")]: JSON.stringify(["faq_page|"]) });
    const s = state({ "faq_page|": { column: "rejected", order: 0, updated_at: T0 } });
    const res = migrateLegacyDone("b", s, groups, storage, NOW)!;
    expect(res.migrated).toEqual([]);
    expect(res.state).toBe(s);
  });

  it("reads defensively and clears the key", () => {
    const storage = memoryStorage({ [legacyDoneKey("b")]: "{not json" });
    expect(readLegacyDone("b", storage)).toEqual([]);
    clearLegacyDone("b", storage);
    expect(storage.data).toEqual({});
    expect(readLegacyDone("b", null)).toEqual([]);
  });
});
