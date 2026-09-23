import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getObservations } from "../api/client";
import type { Mention, Observation } from "../api/types";
import { useAsync } from "../api/useAsync";
import { humanize } from "../format";

function mentionLabel(m: Mention, text: string, entities: Record<string, string>): string {
  if (entities[m.entity_id]) return entities[m.entity_id];
  const span = text.slice(m.char_start, m.char_end).trim();
  return span || humanize(m.entity_id);
}

// Wrap each mention span (char_start..char_end) in a colored <mark>.
function highlight(text: string, mentions: Mention[], entities: Record<string, string>): ReactNode[] {
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
        title={`${mentionLabel(m, text, entities)} · ${m.entity_kind} · rank #${m.rank}${m.is_passing_mention ? " · passing mention" : ""}`}
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

// One badge per distinct entity, at its best (lowest) rank in this answer.
function rankedEntities(obs: Observation): Mention[] {
  const best = new Map<string, Mention>();
  for (const m of obs.mentions ?? []) {
    const cur = best.get(m.entity_id);
    if (!cur || m.rank < cur.rank) best.set(m.entity_id, m);
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank);
}

function ObservationCard({ obs, entities }: { obs: Observation; entities: Record<string, string> }) {
  const ranked = rankedEntities(obs);
  const mentionsBrand = ranked.some((m) => m.entity_kind === "self");
  return (
    <article className="card obs-card">
      <header className="obs-head">
        <div className="obs-query">
          <span className="muted small">Question</span>
          <p>"{obs.query_text}"</p>
        </div>
        <div className="obs-meta">
          <span className="badge badge-live">{obs.provider_id}</span>
          {obs.intent_type && <span className="badge">{humanize(obs.intent_type)}</span>}
          <span className={`badge ${mentionsBrand ? "badge-ok" : "badge-muted"}`}>
            {mentionsBrand ? "Brand mentioned" : "Brand absent"}
          </span>
        </div>
      </header>
      <div className="obs-sub muted small">
        <code>{obs.observation_id}</code> · model <code>{obs.model_version || "—"}</code>
      </div>
      {ranked.length > 0 && (
        <div className="obs-ranks">
          {ranked.map((m) => (
            <span key={m.entity_id} className={`rank-chip rank-${m.entity_kind}`}>
              <span className="rank-num">#{m.rank}</span>
              {mentionLabel(m, obs.response_text, entities)}
            </span>
          ))}
        </div>
      )}
      <div className="obs-response">{highlight(obs.response_text ?? "", obs.mentions ?? [], entities)}</div>
    </article>
  );
}

export function EvidencePage() {
  const { brandKey = "", runId = "" } = useParams<{ brandKey: string; runId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const refsParam = searchParams.get("refs");
  const refs = useMemo(
    () => (refsParam ? new Set(refsParam.split(",").map((r) => r.trim()).filter(Boolean)) : null),
    [refsParam],
  );

  const state = useAsync(() => getObservations(brandKey, runId), [brandKey, runId]);
  const [intent, setIntent] = useState("all");
  const [provider, setProvider] = useState("all");
  const [onlyBrand, setOnlyBrand] = useState(false);
  const [text, setText] = useState("");

  const all = state.status === "ready" ? state.data.observations : [];
  const entities = state.status === "ready" ? state.data.entities : {};

  const scoped = refs ? all.filter((o) => refs.has(o.observation_id)) : all;
  const intents = [...new Set(scoped.map((o) => o.intent_type).filter((x): x is string => !!x))].sort();
  const providers = [...new Set(scoped.map((o) => o.provider_id))].sort();
  const visible = scoped.filter(
    (o) =>
      (intent === "all" || o.intent_type === intent) &&
      (provider === "all" || o.provider_id === provider) &&
      (!text.trim() || `${o.query_text} ${o.response_text}`.toLowerCase().includes(text.trim().toLowerCase())) &&
      (!onlyBrand || (o.mentions ?? []).some((m) => m.entity_kind === "self")),
  );
  const mentioningCount = scoped.filter((o) => (o.mentions ?? []).some((m) => m.entity_kind === "self")).length;

  const selfName = entities.self ?? "Brand";
  const competitorNames = Object.entries(entities)
    .filter(([id]) => id !== "self")
    .map(([, name]) => name);

  return (
    <div>
      <p className="crumbs">
        <Link to={`/brands/${encodeURIComponent(brandKey)}`}>← Back to dashboard</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>Evidence</h1>
          <p className="lede">
            The raw LLM answers behind the scores. Detected mentions are highlighted exactly where the mention
            detector found them. Run <code>{runId.slice(0, 8)}</code>.
          </p>
        </div>
      </div>

      {refs && (
        <div className="alert alert-info filter-note">
          <span>
            Showing the <strong>{refs.size}</strong> answer{refs.size === 1 ? "" : "s"} cited as evidence
            {state.status === "ready" && scoped.length !== refs.size && ` (${scoped.length} found in this run)`}.
          </span>
          <button className="btn btn-link" onClick={() => setSearchParams({})}>
            Show all answers
          </button>
        </div>
      )}

      <div className="card legend-card">
        <span className="legend-title">Legend</span>
        <span className="legend-item">
          <mark className="hl hl-self">{selfName}</mark> brand
        </span>
        <span className="legend-item">
          <mark className="hl hl-competitor">{competitorNames.length ? competitorNames.slice(0, 3).join(", ") : "Competitor"}</mark>
          {competitorNames.length > 3 && <span className="muted small">+{competitorNames.length - 3} more</span>} competitor
        </span>
        <span className="legend-item">
          <mark className="hl hl-discovered">Other brand</mark> discovered
        </span>
        <span className="legend-item">
          <span className="rank-chip rank-self">
            <span className="rank-num">#1</span>
          </span>
          = order of first mention in the answer
        </span>
      </div>

      <div className="filters">
        <label>
          <span className="small">Search</span>
          <input
            className="search-input search-inline"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Words in question or answer…"
          />
        </label>
        <label>
          <span>Intent</span>
          <select value={intent} onChange={(e) => setIntent(e.target.value)}>
            <option value="all">All intents</option>
            {intents.map((i) => (
              <option key={i} value={i}>
                {humanize(i)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="all">All providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={onlyBrand} onChange={(e) => setOnlyBrand(e.target.checked)} />
          <span>Only answers mentioning {selfName}</span>
        </label>
        {state.status === "ready" && (
          <span className="muted small filters-count">
            {visible.length} of {scoped.length} shown · {mentioningCount} mention the brand
          </span>
        )}
      </div>

      {state.status === "loading" && <p className="status">Loading responses…</p>}
      {state.status === "error" && (
        <div className="alert alert-error">
          Failed to load observations. {state.error instanceof Error ? state.error.message : ""}
        </div>
      )}
      {state.status === "ready" && visible.length === 0 && <p className="empty">No answers match these filters.</p>}

      <div className="obs-list">
        {visible.map((o) => (
          <ObservationCard key={o.observation_id} obs={o} entities={entities} />
        ))}
      </div>
    </div>
  );
}
