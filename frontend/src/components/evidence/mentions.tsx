import type { ReactNode } from "react";
import type { EntityKind, Mention, Observation } from "../../api/types";
import { humanize } from "../../format";
import type { MessageKey, TFunction } from "../../i18n";

// Mention highlighting for the evidence view: every brand span in a verbatim AI response, coloured
// by kind (you / listed competitor / other brand), with its position in the answer.

export const KIND_KEY: Record<EntityKind, MessageKey> = {
  self: "pages.answers.legend.self",
  competitor: "pages.answers.legend.competitor",
  discovered: "pages.answers.legend.discovered",
};

/** Display name for a mention: the tracked entity's name, else the text span itself. */
export function mentionLabel(m: Mention, text: string, entities: Record<string, string>): string {
  if (entities[m.entity_id]) return entities[m.entity_id];
  const span = text.slice(m.char_start, m.char_end).trim();
  return span || humanize(m.entity_id);
}

/** Wraps each mention span (char_start..char_end) in a coloured <mark>. */
export function highlightMentions(
  text: string,
  mentions: Mention[],
  entities: Record<string, string>,
  t: TFunction,
): ReactNode[] {
  const spans = [...mentions]
    .filter((m) => Number.isFinite(m.char_start) && Number.isFinite(m.char_end) && m.char_end > m.char_start)
    .sort((a, b) => a.char_start - b.char_start);
  const out: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((m, i) => {
    const start = Math.max(m.char_start, cursor);
    const end = Math.min(m.char_end, text.length);
    if (end <= start) return; // overlapping or out of range
    if (start > cursor) out.push(text.slice(cursor, start));
    out.push(
      <mark
        key={i}
        className={`hl hl-${m.entity_kind}`}
        title={t("pages.answers.markTitle", {
          name: mentionLabel(m, text, entities),
          kind: t(KIND_KEY[m.entity_kind] ?? KIND_KEY.discovered),
          n: m.rank,
        })}
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/** One entry per distinct entity, at its best (lowest) rank in this answer, best first. */
export function rankedEntities(obs: Observation): Mention[] {
  const best = new Map<string, Mention>();
  for (const m of obs.mentions ?? []) {
    const cur = best.get(m.entity_id);
    if (!cur || m.rank < cur.rank) best.set(m.entity_id, m);
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank);
}
