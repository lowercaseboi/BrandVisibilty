// Pure board model for the recommendation board (kanban). No React, no network: the module feeds
// it the latest snapshot's recommendations/gaps plus the saved BoardState, and gets back columns of
// cards. Saved state is keyed by the stable suggestion group key `action|competitor_id`, so a card
// keeps its column across runs even though recommendation IDs change every run.
//
// Ghost cards: a saved key with no recommendation in the latest run is shown as "resolved in
// latest run" (faded) in its saved column, titled from the key itself (action + competitor). A
// ghost saved in "suggested" is hidden and dropped on the next save — it was only ever a
// suggestion, and if it comes back it lands in Suggested anyway. Ghosts elsewhere (saved, in
// progress, done, rejected) stay until the user removes them, so a rejection or a finished task is
// remembered if the same suggestion reappears in a later run.
import { BOARD_COLUMNS } from "../../api/types";
import type { BoardCardState, BoardColumn, BoardState, Gap, Recommendation } from "../../api/types";
import { groupSuggestions, humanizeId, parseSuggestionKey } from "../dashboard/helpers";
import type { Suggestion } from "../dashboard/helpers";

export interface BoardCard {
  /** Stable group key, `action|competitor_id`. */
  key: string;
  column: BoardColumn;
  /** The current suggestion group, or null for a ghost card (resolved in the latest run). */
  suggestion: Suggestion | null;
  action: string;
  competitorId: string | null;
  /** Competitor display name (snapshot entities, else the humanized id); null when there is none. */
  competitor: string | null;
  /** When the user last moved the card; null for a suggestion that has never been placed. */
  updatedAt: string | null;
}

export interface BoardColumnView {
  id: BoardColumn;
  cards: BoardCard[];
}

export interface BoardSummary {
  /** Cards per column, ghosts included. */
  counts: Record<BoardColumn, number>;
  total: number;
  /** Ghost cards ("resolved in latest run"). */
  resolved: number;
}

export function emptyBoardState(brandKey: string): BoardState {
  return { brand_key: brandKey, cards: {} };
}

export function isBoardColumn(value: unknown): value is BoardColumn {
  return typeof value === "string" && (BOARD_COLUMNS as string[]).includes(value);
}

/** Saved entries with a known column, in no particular order. */
function savedEntries(state: BoardState | null | undefined): [string, BoardCardState][] {
  const cards = state?.cards;
  if (!cards || typeof cards !== "object") return [];
  return Object.entries(cards).filter(([, c]) => c && isBoardColumn(c.column));
}

const orderOf = (c: BoardCardState) => (typeof c.order === "number" && Number.isFinite(c.order) ? c.order : Infinity);

function makeCard(
  key: string,
  column: BoardColumn,
  suggestion: Suggestion | null,
  entities: Record<string, string> | undefined,
  updatedAt: string | null,
): BoardCard {
  const { action, competitorId } = parseSuggestionKey(key);
  const competitor = competitorId ? (entities?.[competitorId] ?? humanizeId(competitorId)) : null;
  return { key, column, suggestion, action, competitorId, competitor, updatedAt };
}

/**
 * The board to render: all five columns in BOARD_COLUMNS order, each an ordered list of cards.
 * One card per suggestion group (groupSuggestions). Saved cards sit in their saved column by
 * ascending `order`; groups with no saved state are appended to Suggested in priority order
 * (sortByPriority); saved keys with no current recommendation become ghost cards (see top).
 */
export function buildBoard(
  recommendations: Recommendation[] | null | undefined,
  gaps: Gap[] | null | undefined,
  entities: Record<string, string> | null | undefined,
  state: BoardState | null | undefined,
): BoardColumnView[] {
  const groups = groupSuggestions(recommendations ?? [], new Map((gaps ?? []).map((g) => [g.gap_id, g])));
  const byKey = new Map(groups.map((s) => [s.key, s]));
  const ents = entities ?? undefined;

  const placed = new Set<string>();
  const saved = new Map<BoardColumn, { card: BoardCard; order: number }[]>(BOARD_COLUMNS.map((c) => [c, []]));
  for (const [key, cs] of savedEntries(state)) {
    const suggestion = byKey.get(key) ?? null;
    if (!suggestion && cs.column === "suggested") continue;
    const updatedAt = typeof cs.updated_at === "string" && cs.updated_at ? cs.updated_at : null;
    saved.get(cs.column)!.push({ card: makeCard(key, cs.column, suggestion, ents, updatedAt), order: orderOf(cs) });
    placed.add(key);
  }

  return BOARD_COLUMNS.map((id) => {
    const cards = saved
      .get(id)!
      .sort((a, b) => a.order - b.order || a.card.key.localeCompare(b.card.key))
      .map((x) => x.card);
    if (id === "suggested") {
      for (const s of groups) if (!placed.has(s.key)) cards.push(makeCard(s.key, "suggested", s, ents, null));
    }
    return { id, cards };
  });
}

/** Where a card currently is: its column and index, or null when it isn't on the board. */
export function findCard(columns: BoardColumnView[], key: string): { column: BoardColumn; index: number } | null {
  for (const col of columns) {
    const index = col.cards.findIndex((c) => c.key === key);
    if (index >= 0) return { column: col.id, index };
  }
  return null;
}

/**
 * New state with `key` moved to `toColumn` at `toIndex` (an index into that column's cards as
 * displayed, not counting the moved card; clamped). The destination column is renumbered 0..n-1
 * (which also places any never-saved suggestions shown there); other entries keep their order.
 * Hidden ghost entries (saved in Suggested, no longer recommended) are dropped. `columns` must be
 * the buildBoard() output for `state`.
 */
export function moveCard(
  state: BoardState,
  columns: BoardColumnView[],
  key: string,
  toColumn: BoardColumn,
  toIndex: number,
  now: string = new Date().toISOString(),
): BoardState {
  const shown = new Set(columns.flatMap((c) => c.cards.map((card) => card.key)));
  const prev = state.cards ?? {};
  const cards: Record<string, BoardCardState> = {};
  for (const [k, cs] of savedEntries(state)) if (shown.has(k)) cards[k] = cs;

  const dest = (columns.find((c) => c.id === toColumn)?.cards ?? []).map((c) => c.key).filter((k) => k !== key);
  const at = Math.max(0, Math.min(Number.isFinite(toIndex) ? Math.trunc(toIndex) : dest.length, dest.length));
  dest.splice(at, 0, key);
  dest.forEach((k, order) => {
    const before = prev[k];
    const unchanged = k !== key && before && before.column === toColumn && typeof before.updated_at === "string";
    cards[k] = { column: toColumn, order, updated_at: unchanged ? before.updated_at : now };
  });
  return { brand_key: state.brand_key, cards };
}

/** New state without `key` (removing a ghost card from the board). */
export function removeCard(state: BoardState, key: string): BoardState {
  const cards = { ...(state.cards ?? {}) };
  delete cards[key];
  return { brand_key: state.brand_key, cards };
}

/** Card counts per column (the hub's board preview). */
export function summarizeBoard(columns: BoardColumnView[]): BoardSummary {
  const counts = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, 0])) as Record<BoardColumn, number>;
  let total = 0;
  let resolved = 0;
  for (const col of columns) {
    counts[col.id] = (counts[col.id] ?? 0) + col.cards.length;
    total += col.cards.length;
    resolved += col.cards.filter((c) => !c.suggestion).length;
  }
  return { counts, total, resolved };
}

// ---------------------------------------------------------------------------
// One-time import of the old checklist's "done" ticks (NextSteps kept them in localStorage under
// `bv.done.<brandKey>` as a JSON array of the same group keys).
// ---------------------------------------------------------------------------

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export const legacyDoneKey = (brandKey: string) => `bv.done.${brandKey}`;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Keys ticked "done" in the old checklist, in stored order ([] when none or unreadable). */
export function readLegacyDone(brandKey: string, storage: StorageLike | null = defaultStorage()): string[] {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(legacyDoneKey(brandKey)) ?? "null");
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0))];
  } catch {
    return [];
  }
}

export function clearLegacyDone(brandKey: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(legacyDoneKey(brandKey));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Moves the old checklist's done ticks into the Done column: keys not already on the saved board
 * are appended to Done — current suggestions first in priority order (`groups`), then the rest
 * (which show as resolved ghosts). Saved board state always wins over a legacy tick.
 *
 * Returns null when there is nothing stored; otherwise the new state and the keys it added (may be
 * empty when every tick was already on the board). It does not clear storage: call
 * clearLegacyDone() once the new state has been saved, so a failed save retries next visit.
 */
export function migrateLegacyDone(
  brandKey: string,
  state: BoardState,
  groups: Suggestion[],
  storage: StorageLike | null = defaultStorage(),
  now: string = new Date().toISOString(),
): { state: BoardState; migrated: string[] } | null {
  const legacy = readLegacyDone(brandKey, storage);
  if (legacy.length === 0) return null;
  const existing = state.cards ?? {};
  const pending = new Set(legacy.filter((k) => !(k in existing)));
  const migrated = [...groups.map((g) => g.key).filter((k) => pending.has(k)), ...legacy.filter((k) => pending.has(k))];
  const ordered = [...new Set(migrated)];
  if (ordered.length === 0) return { state, migrated: [] };

  let next = 0;
  for (const [, cs] of savedEntries(state)) if (cs.column === "done") next = Math.max(next, orderOf(cs) + 1);
  if (!Number.isFinite(next)) next = savedEntries(state).filter(([, cs]) => cs.column === "done").length;
  const cards: Record<string, BoardCardState> = { ...existing };
  ordered.forEach((k, i) => {
    cards[k] = { column: "done", order: next + i, updated_at: now };
  });
  return { state: { brand_key: state.brand_key, cards }, migrated: ordered };
}
