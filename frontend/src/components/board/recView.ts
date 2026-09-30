// Pure helpers behind a recommendation card's plain-language face: effort in words, the evidence
// count, the "showing the top N of M" line, the impact wording, the translated reasoning and the
// one-sentence "Why" built from the gap and the responses behind it. No React, no network.
import type { Gap, Observation, Recommendation } from "../../api/types";
import { dashboard as enDashboard } from "../../i18n/en/dashboard";
import type { Formatter, MessageKey, TFunction, Vars } from "../../i18n";
import { gapTypeText, humanizeId } from "../dashboard/helpers";

export interface Msg {
  key: MessageKey;
  vars?: Vars;
}

/** Effort as time (the engine's 1 / 3 / 5 / 8 scale): about an hour … a week or more. */
export function effortWordKey(effort: number | null | undefined): MessageKey {
  if (typeof effort !== "number" || !Number.isFinite(effort) || effort <= 1) return "board.effort.hour";
  if (effort <= 3) return "board.effort.halfDay";
  if (effort <= 5) return "board.effort.days";
  return "board.effort.week";
}

/** Full confidence is reached at this many supporting responses (engine `_confidence`). */
export const FULL_EVIDENCE = 10;

/**
 * How many AI responses back a recommendation: `evidence_count` when the snapshot has it, else
 * derived from `confidence` (= n / 10, capped at 1), so older snapshots still show a number.
 */
export function evidenceCount(rec: Pick<Recommendation, "evidence_count" | "confidence">): number {
  const n = rec.evidence_count;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.round(n);
  const c = rec.confidence;
  if (typeof c === "number" && Number.isFinite(c)) return Math.max(0, Math.min(FULL_EVIDENCE, Math.round(c * FULL_EVIDENCE)));
  return 0;
}

/** "Showing the top {n} of {total}" — only when the engine found more than the snapshot kept. */
export function capLine(total: number | null | undefined, shown: number): { n: number; total: number } | null {
  if (typeof total !== "number" || !Number.isFinite(total) || shown <= 0) return null;
  const all = Math.round(total);
  return all > shown ? { n: shown, total: all } : null;
}

export type Impact =
  | { kind: "points"; n: number }
  | { kind: "small" }
  /** A scored gap whose simulated fix barely moves the score. */
  | { kind: "flat" }
  /** A gap the visibility score doesn't measure (how the brand is described / which sites AI reads). */
  | { kind: "notScored"; reason: "representation" | "source" };

/**
 * What a recommendation could change, from its simulated score gain, the engine's impact sentence
 * (`assumption.unscored` = the gap type isn't in the score model) and, for older snapshots without
 * it, the gap's type.
 */
export function impactOf(
  delta: number | null | undefined,
  gapType: string | null | undefined,
  assumptionKey?: unknown,
): Impact {
  const d = typeof delta === "number" && Number.isFinite(delta) ? delta : 0;
  if (d > 0) {
    const n = Math.round(d);
    return n >= 1 ? { kind: "points", n } : { kind: "small" };
  }
  if (gapType === "source") return { kind: "notScored", reason: "source" };
  if (assumptionKey === "assumption.unscored") return { kind: "notScored", reason: "representation" };
  if (typeof assumptionKey === "string" && assumptionKey.startsWith("assumption.")) return { kind: "flat" };
  if (gapType === "presence" || gapType === "prominence" || gapType === "competitive") return { kind: "flat" };
  return { kind: "notScored", reason: "representation" };
}

/** Actions whose campaign is copy to paste somewhere else (listings, pitches, forum answers). */
const EXPORT_ONLY = new Set(["submit_to_directory", "pitch_listicle", "community_answer"]);

export function isExportOnly(action: string): boolean {
  return EXPORT_ONLY.has(action);
}

// ---------------------------------------------------------------------------------------------
// Translated reasoning. The engine sends three keys (backend recommendation/REASONING_KEYS.md):
// `reasoning_key` (the finding), `reasoning_params.action_key` (the action) and
// `reasoning_params.assumption_key` (the simulated impact), each rendered as
// `dashboard.recs.why.<key>` from the same params.
// ---------------------------------------------------------------------------------------------

const DASHBOARD_KEYS: Record<string, string> = enDashboard;

type Params = Record<string, string | number>;

/**
 * Params for display: the AI product name for `provider`, the translated example question for
 * `intent_example` (by `intent`), the translated gap type name for `gap_type`, numbers formatted.
 */
export function localizeReasoningParams(
  params: Params,
  t: TFunction,
  fmt: Pick<Formatter, "number">,
  labelOf: (providerId: string) => string,
): Vars {
  const out: Vars = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "number" && Number.isFinite(value)) out[name] = fmt.number(value);
    else if (typeof value === "string") out[name] = value;
  }
  if (typeof params.provider === "string") out.provider = labelOf(params.provider);
  const intent = typeof params.intent === "string" ? params.intent : "";
  const exampleKey = `intent.${intent}`;
  if (intent && typeof DASHBOARD_KEYS[exampleKey] === "string") out.intent_example = t(`dashboard.${exampleKey}` as MessageKey);
  else if (!("intent_example" in out) && typeof params.intent_label === "string") out.intent_example = `“${params.intent_label}”`;
  if (typeof params.gap_type === "string") out.gap_type = gapTypeText(params.gap_type, t);
  return out;
}

/** One reasoning sentence, or null when the key is unknown here or a placeholder has no value. */
function sentence(key: unknown, vars: Vars): Msg | null {
  if (typeof key !== "string" || !key) return null;
  const path = `recs.why.${key}`;
  const template = DASHBOARD_KEYS[path];
  if (typeof template !== "string") return null;
  const needed = template.match(/\{(\w+)\}/g) ?? [];
  if (needed.some((p) => !(p.slice(1, -1) in vars))) return null;
  return { key: `dashboard.${path}` as MessageKey, vars };
}

/**
 * The reasoning as translatable sentences (finding, action, impact), or null — then the caller
 * shows the English `reasoning` string marked lang="en". All three must be known here with every
 * placeholder filled, so a card never mixes a translated sentence with an English one or shows a
 * half-filled template. `localize` prepares the params for display (localizeReasoningParams).
 */
export function reasoningMessages(
  rec: Pick<Recommendation, "reasoning_key" | "reasoning_params">,
  localize: (params: Params) => Vars = (p) => ({ ...p }),
): Msg[] | null {
  const params = rec.reasoning_params ?? {};
  const vars = localize(params);
  const parts = [sentence(rec.reasoning_key, vars), sentence(params.action_key, vars), sentence(params.assumption_key, vars)];
  return parts.every((m): m is Msg => m !== null) ? parts : null;
}

// ---------------------------------------------------------------------------------------------
// The one-sentence "Why": a real customer question from the gap's evidence, plus who the AI named.
// ---------------------------------------------------------------------------------------------

const SELF = "self";
const QUESTION_MAX = 110;

function clip(q: string): string {
  const s = q.trim().replace(/\s+/g, " ");
  return s.length > QUESTION_MAX ? `${s.slice(0, QUESTION_MAX - 1).trimEnd()}…` : s;
}

function rankOf(o: Observation, entityId: string): number | null {
  let best: number | null = null;
  for (const m of o.mentions ?? []) if (m.entity_id === entityId && (best === null || m.rank < best)) best = m.rank;
  return best;
}

/** The best-ranked listed competitor in a response (optionally only those ahead of `before`). */
function topCompetitor(o: Observation, competitors: Set<string>, before = Infinity): string | null {
  let id: string | null = null;
  let rank = before;
  for (const m of o.mentions ?? []) {
    if (competitors.has(m.entity_id) && m.rank < rank) {
      id = m.entity_id;
      rank = m.rank;
    }
  }
  return id;
}

/** Most frequent value (first seen wins a tie); null for none. */
function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestN = 0;
  for (const v of values) {
    if (!v) continue;
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

interface Example {
  question: string;
  competitor: string | null;
  obs: Observation[];
}

/**
 * Picks the question to quote from `hits` (the responses that show the problem): the one where a
 * competitor is named most often, then the most frequent one; `competitorOf` says who is named in
 * each response. The competitor returned is the most frequent one for that question.
 */
function pickExample(hits: Observation[], competitorOf: (o: Observation) => string | null): Example | null {
  const byQuestion = new Map<string, { obs: Observation[]; named: number }>();
  for (const o of hits) {
    const q = typeof o.query_text === "string" ? o.query_text.trim() : "";
    if (!q) continue;
    const entry = byQuestion.get(q) ?? { obs: [], named: 0 };
    entry.obs.push(o);
    if (competitorOf(o)) entry.named += 1;
    byQuestion.set(q, entry);
  }
  let pick: [string, { obs: Observation[]; named: number }] | null = null;
  for (const e of byQuestion) {
    if (!pick || e[1].named > pick[1].named || (e[1].named === pick[1].named && e[1].obs.length > pick[1].obs.length)) pick = e;
  }
  if (!pick) return null;
  const [question, { obs }] = pick;
  return { question: clip(question), competitor: mostCommon(obs.map(competitorOf)), obs };
}

/**
 * The card's "Why" in one plain sentence — e.g. "AI assistants name X instead of you when people
 * ask “best vada pav in Dadar”" — from the gap's type and the responses behind it. Null when the
 * responses aren't loaded or show no usable example (the caller falls back to the gap finding).
 */
export function plainWhy(
  gap: Gap,
  observations: ReadonlyMap<string, Observation> | null | undefined,
  entities: Record<string, string> | undefined,
  labelOf: (providerId: string) => string,
): Msg | null {
  if (!observations || observations.size === 0) return null;
  const evidence = (gap.evidence_refs ?? []).map((id) => observations.get(id)).filter((o): o is Observation => !!o);
  if (evidence.length === 0) return null;
  const competitors = new Set(Object.keys(entities ?? {}).filter((id) => id !== SELF));
  const name = (id: string) => entities?.[id] ?? humanizeId(id);
  const d = gap.detail ?? {};

  switch (gap.gap_type) {
    case "presence": {
      const misses = evidence.filter((o) => rankOf(o, SELF) === null);
      const ex = pickExample(misses, (o) => topCompetitor(o, competitors));
      if (!ex) return null;
      const byAi = d.scope === "provider" && typeof d.provider_id === "string" && d.provider_id;
      const ai = byAi ? labelOf(d.provider_id as string) : null;
      if (ex.competitor) {
        const vars = { competitor: name(ex.competitor), question: ex.question };
        return ai
          ? { key: "dashboard.recs.plain.nameInsteadAi", vars: { ...vars, ai } }
          : { key: "dashboard.recs.plain.nameInstead", vars };
      }
      return ai
        ? { key: "dashboard.recs.plain.missingAi", vars: { ai, question: ex.question } }
        : { key: "dashboard.recs.plain.missing", vars: { question: ex.question } };
    }
    case "competitive": {
      const cid = typeof d.competitor_id === "string" ? d.competitor_id : "";
      if (!cid) return null;
      const behind = evidence.filter((o) => {
        const them = rankOf(o, cid);
        const us = rankOf(o, SELF);
        return them !== null && us !== null && them < us;
      });
      const ex = pickExample(behind, () => cid);
      if (!ex) return null;
      return { key: "dashboard.recs.plain.ahead", vars: { competitor: name(cid), question: ex.question } };
    }
    case "prominence": {
      const low = evidence.filter((o) => (rankOf(o, SELF) ?? 1) > 1);
      const ex = pickExample(low, (o) => topCompetitor(o, competitors, rankOf(o, SELF) ?? Infinity));
      if (!ex) return null;
      if (ex.competitor) return { key: "dashboard.recs.plain.low", vars: { competitor: name(ex.competitor), question: ex.question } };
      const ranks = ex.obs.map((o) => rankOf(o, SELF) ?? 1).sort((a, b) => a - b);
      return { key: "dashboard.recs.plain.lowGeneric", vars: { rank: ranks[Math.floor(ranks.length / 2)], question: ex.question } };
    }
    default:
      return null;
  }
}
