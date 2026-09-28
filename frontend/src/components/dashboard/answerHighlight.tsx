import type { ReactNode } from "react";
import type { Mention, Observation } from "../../api/types";
import type { MessageKey } from "../../i18n";

// Picking and highlighting one AI answer: shared by the Gaps & evidence spotlight and the
// landing page's sample section.

export const MAX_CHARS = 600;

function bestRank(obs: Observation, kind: Mention["entity_kind"]): number | null {
  let best: number | null = null;
  for (const m of obs.mentions ?? []) {
    if (m.entity_kind === kind && (best === null || m.rank < best)) best = m.rank;
  }
  return best;
}

/**
 * Deterministic pick: the first scored answer where a competitor comes before you (or where
 * competitors are named and you aren't); otherwise the first answer that names you.
 */
export function pickSample(observations: Observation[]): Observation | null {
  const scored = observations.filter((o) => o.scored !== false && (o.response_text ?? "").trim() !== "");
  const outranked = scored.find((o) => {
    const self = bestRank(o, "self");
    const comp = bestRank(o, "competitor");
    return comp !== null && (self === null || comp < self);
  });
  return outranked ?? scored.find((o) => bestRank(o, "self") !== null) ?? null;
}

/** Why pickSample chose this answer: a competitor is named before you, or it simply names you. */
export function sampleReason(obs: Observation): "outranked" | "named" {
  const self = bestRank(obs, "self");
  const comp = bestRank(obs, "competitor");
  return comp !== null && (self === null || comp < self) ? "outranked" : "named";
}

export const KIND_KEY: Record<Mention["entity_kind"], MessageKey> = {
  self: "dashboard.sample.markSelf",
  competitor: "dashboard.sample.markCompetitor",
  discovered: "dashboard.sample.markOther",
};

// Markdown bold markers from the model ("**Name**") are noise here; drop them per piece so
// the character offsets of the mentions stay valid.
const clean = (s: string) => s.replace(/\*\*/g, "");

/** Wraps each mention span in a coloured <mark>, up to `limit` characters. */
export function highlight(text: string, mentions: Mention[], limit: number, kindLabel: (k: Mention["entity_kind"]) => string): ReactNode[] {
  const spans = [...mentions]
    .filter((m) => Number.isFinite(m.char_start) && Number.isFinite(m.char_end) && m.char_end > m.char_start)
    .sort((a, b) => a.char_start - b.char_start);
  const end = Math.min(limit, text.length);
  const out: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((m, i) => {
    const start = Math.max(m.char_start, cursor);
    const stop = Math.min(m.char_end, text.length);
    if (stop <= start || start >= end) return;
    if (start > cursor) out.push(clean(text.slice(cursor, start)));
    out.push(
      <mark key={i} className={`hl hl-${m.entity_kind}`} title={kindLabel(m.entity_kind)}>
        {clean(text.slice(start, stop))}
      </mark>,
    );
    cursor = stop;
  });
  if (cursor < end) out.push(clean(text.slice(cursor, end)));
  return out;
}

/** Where to cut a long answer: at a space before MAX_CHARS, never inside a highlighted name. */
export function cutPoint(text: string, mentions: Mention[]): number {
  if (text.length <= MAX_CHARS + 80) return text.length;
  let cut = text.lastIndexOf(" ", MAX_CHARS);
  if (cut < MAX_CHARS * 0.6) cut = MAX_CHARS;
  for (const m of mentions) if (m.char_start < cut && m.char_end > cut) cut = m.char_end;
  return cut;
}
