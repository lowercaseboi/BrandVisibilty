import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { getObservations } from "../../api/client";
import type { Mention, Observation } from "../../api/types";
import { useAsync } from "../../api/useAsync";
import { evidenceHref } from "../../format";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";

const MAX_CHARS = 600;

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
function pickSample(observations: Observation[]): Observation | null {
  const scored = observations.filter((o) => o.scored !== false && (o.response_text ?? "").trim() !== "");
  const outranked = scored.find((o) => {
    const self = bestRank(o, "self");
    const comp = bestRank(o, "competitor");
    return comp !== null && (self === null || comp < self);
  });
  return outranked ?? scored.find((o) => bestRank(o, "self") !== null) ?? null;
}

const KIND_KEY: Record<Mention["entity_kind"], MessageKey> = {
  self: "dashboard.sample.markSelf",
  competitor: "dashboard.sample.markCompetitor",
  discovered: "dashboard.sample.markOther",
};

// Markdown bold markers from the model ("**Name**") are noise here; drop them per piece so
// the character offsets of the mentions stay valid.
const clean = (s: string) => s.replace(/\*\*/g, "");

/** Wraps each mention span in a coloured <mark>, up to `limit` characters. */
function highlight(text: string, mentions: Mention[], limit: number, kindLabel: (k: Mention["entity_kind"]) => string): ReactNode[] {
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
function cutPoint(text: string, mentions: Mention[]): number {
  if (text.length <= MAX_CHARS + 80) return text.length;
  let cut = text.lastIndexOf(" ", MAX_CHARS);
  if (cut < MAX_CHARS * 0.6) cut = MAX_CHARS;
  for (const m of mentions) if (m.char_start < cut && m.char_end > cut) cut = m.char_end;
  return cut;
}

/** "What AI actually said": one real answer, with your shop and competitors highlighted. */
export function SampleAnswer({
  brandKey,
  runId,
  labelOf,
}: {
  brandKey: string;
  runId: string;
  labelOf: (id: string) => string;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const state = useAsync(() => getObservations(brandKey, runId), [brandKey, runId]);
  if (state.status !== "ready") return null;
  const obs = pickSample(state.data.observations);
  if (!obs) return null;

  const text = obs.response_text ?? "";
  const mentions = obs.mentions ?? [];
  const cut = cutPoint(text, mentions);
  const truncated = cut < text.length;
  const kindLabel = (k: Mention["entity_kind"]) => t(KIND_KEY[k] ?? "dashboard.sample.markOther");
  const kinds = new Set(mentions.map((m) => m.entity_kind));

  return (
    <section className="dash-section" aria-labelledby="sample-title">
      <h2 id="sample-title">{t("dashboard.sample.title")}</h2>
      <p className="section-note">{t("dashboard.sample.caption")}</p>
      <figure className="card sample-card">
        <p className="sample-label">{t("dashboard.sample.asked")}</p>
        <blockquote className="sample-question">{obs.query_text}</blockquote>
        <p className="sample-label">{t("dashboard.sample.answeredBy", { ai: labelOf(obs.provider_id) })}</p>
        <div className="sample-answer" id={bodyId}>
          {highlight(text, mentions, expanded ? text.length : cut, kindLabel)}
          {truncated && !expanded && <span aria-hidden="true">…</span>}
        </div>
        {truncated && (
          <button
            type="button"
            className="btn-link sample-more"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t("dashboard.sample.readLess") : t("dashboard.sample.readMore")}
          </button>
        )}
        <figcaption className="sample-foot">
          <span className="sample-legend">
            <span className="muted">{t("dashboard.sample.legend")}</span>
            {(["self", "competitor", "discovered"] as const)
              .filter((k) => kinds.has(k))
              .map((k) => (
                <mark key={k} className={`hl hl-${k}`}>
                  {kindLabel(k)}
                </mark>
              ))}
          </span>
          <Link to={evidenceHref(brandKey, runId)} className="sample-all">
            {t("dashboard.sample.seeAll")}
          </Link>
        </figcaption>
      </figure>
    </section>
  );
}
