import type { Question } from "../../api/types";
import { clean } from "./listFields";

/** Column id for questions that don't mention any of the brand's tracked cities. */
export const GENERAL_COLUMN = "__general__";

export interface CoverageCell {
  count: number;
  /** count === 0 — an intent × city combination with no question covering it. */
  blind: boolean;
}

export interface CoverageMatrixData {
  /** Row labels: each enabled question's intent_type, in first-seen order. */
  intents: string[];
  /** Column labels: the brand's tracked cities (deduplicated, in the order given), then
   * `GENERAL_COLUMN` last for questions that don't mention any of them. */
  cities: string[];
  /** cells[i][j] is the count for intents[i] × cities[j]. */
  cells: CoverageCell[][];
}

const diacritics = /[̀-ͯ]/g;

/** Case/diacritic-insensitive form for substring matching ("Mumbai" ~ "in mumbai?"). */
function normalize(s: string): string {
  return s.normalize("NFKD").replace(diacritics, "").toLowerCase();
}

/**
 * A small intent × city grid so blind spots in local coverage show at a glance: every enabled
 * question's intent_type labels a row, and the first tracked city its text mentions (matched
 * case/diacritic-insensitively) labels a column. A question that names none of the tracked
 * cities falls into a trailing "general" column instead.
 *
 * Only the `local_contextual` intent (querysets/templates.py) is actually expected to vary by
 * city — the others ask the same thing regardless of market. A zero cell for those rows is
 * therefore normal, not a gap: the matrix is a lens over what's asked, not a to-do list. It's
 * pure and deterministic (same inputs -> same grid), computed only from the current question set
 * and the brand's own city list — no network calls.
 */
export function buildCoverageMatrix(questions: Question[], cities: string[]): CoverageMatrixData {
  const normCities: string[] = [];
  const seen = new Set<string>();
  for (const raw of cities) {
    const c = clean(raw);
    const key = normalize(c);
    if (c && !seen.has(key)) {
      seen.add(key);
      normCities.push(c);
    }
  }
  const columns = [...normCities, GENERAL_COLUMN];
  const needles = normCities.map(normalize);

  const enabled = questions.filter((q) => q.enabled);
  const intents: string[] = [];
  for (const q of enabled) if (!intents.includes(q.intent_type)) intents.push(q.intent_type);
  const rowIndex = new Map(intents.map((intent, i) => [intent, i]));

  const cells: CoverageCell[][] = intents.map(() => columns.map(() => ({ count: 0, blind: true })));

  for (const q of enabled) {
    const row = rowIndex.get(q.intent_type)!;
    const text = normalize(q.text);
    const col = needles.findIndex((needle) => needle.length > 0 && text.includes(needle));
    const j = col === -1 ? columns.length - 1 : col;
    cells[row][j].count += 1;
  }
  for (const row of cells) for (const cell of row) cell.blind = cell.count === 0;

  return { intents, cities: columns, cells };
}
