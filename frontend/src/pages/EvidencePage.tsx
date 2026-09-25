import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getObservations, listProviders } from "../api/client";
import type { EntityKind, Mention, Observation } from "../api/types";
import { useAsync } from "../api/useAsync";
import { humanize, useIntentLabel } from "../format";
import { T, useFormat, useT } from "../i18n";
import type { MessageKey, TFunction } from "../i18n";
import { Details } from "../settings/details";

const KIND_KEY: Record<EntityKind, MessageKey> = {
  self: "pages.answers.legend.self",
  competitor: "pages.answers.legend.competitor",
  discovered: "pages.answers.legend.discovered",
};

function mentionLabel(m: Mention, text: string, entities: Record<string, string>): string {
  if (entities[m.entity_id]) return entities[m.entity_id];
  const span = text.slice(m.char_start, m.char_end).trim();
  return span || humanize(m.entity_id);
}

// Wrap each mention span (char_start..char_end) in a colored <mark>.
function highlight(text: string, mentions: Mention[], entities: Record<string, string>, t: TFunction): ReactNode[] {
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

// One chip per distinct entity, at its best (lowest) rank in this answer.
function rankedEntities(obs: Observation): Mention[] {
  const best = new Map<string, Mention>();
  for (const m of obs.mentions ?? []) {
    const cur = best.get(m.entity_id);
    if (!cur || m.rank < cur.rank) best.set(m.entity_id, m);
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank);
}

function ObservationCard({
  obs,
  entities,
  aiName,
}: {
  obs: Observation;
  entities: Record<string, string>;
  aiName: string;
}) {
  const t = useT();
  const ranked = rankedEntities(obs);
  const mentionsBrand = ranked.some((m) => m.entity_kind === "self");
  return (
    <article className="card obs-card">
      <header className="obs-head">
        <div className="obs-query">
          <span className="muted small">{t("pages.answers.question")}</span>
          <p>“{obs.query_text}”</p>
        </div>
        <div className="obs-meta">
          <span className="badge badge-live">{aiName}</span>
          {obs.scored === false && <span className="badge badge-job-partial">{t("pages.answers.notCounted")}</span>}
          <span className={`badge ${mentionsBrand ? "badge-ok" : "badge-muted"}`}>
            {mentionsBrand ? t("pages.answers.named") : t("pages.answers.notNamed")}
          </span>
        </div>
      </header>
      <Details>
        <div className="obs-sub muted small pg-tech">
          {obs.intent_type && <code>{obs.intent_type}</code>}
          <code>{obs.provider_id}</code>
          <code>{obs.observation_id}</code>
          <span>
            {t("pages.answers.modelLabel")} <code>{obs.model_version || "—"}</code>
          </span>
        </div>
      </Details>
      {ranked.length > 0 && (
        <div className="obs-ranks">
          {ranked.map((m) => {
            const name = mentionLabel(m, obs.response_text, entities);
            return (
              <span
                key={m.entity_id}
                className={`rank-chip rank-${m.entity_kind}`}
                title={t("pages.answers.rankTitle", { name, n: m.rank })}
              >
                <span className="rank-num">{t("pages.answers.rank", { n: m.rank })}</span>
                {name}
              </span>
            );
          })}
        </div>
      )}
      <div className="obs-response">{highlight(obs.response_text ?? "", obs.mentions ?? [], entities, t)}</div>
    </article>
  );
}

export function EvidencePage() {
  const t = useT();
  const fmt = useFormat();
  const intentLabel = useIntentLabel();
  const { brandKey = "", runId = "" } = useParams<{ brandKey: string; runId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const refsParam = searchParams.get("refs");
  const refs = useMemo(
    () => (refsParam ? new Set(refsParam.split(",").map((r) => r.trim()).filter(Boolean)) : null),
    [refsParam],
  );

  const state = useAsync(() => getObservations(brandKey, runId), [brandKey, runId]);
  const providersState = useAsync(listProviders, []);
  const [intent, setIntent] = useState("all");
  const [provider, setProvider] = useState("all");
  const [onlyBrand, setOnlyBrand] = useState(false);
  const [text, setText] = useState("");

  const aiNames = useMemo(() => {
    const map: Record<string, string> = {};
    if (providersState.status === "ready") for (const p of providersState.data) map[p.provider_id] = p.label || p.provider_id;
    return map;
  }, [providersState]);
  // Offline "AIs" get plain names: practice data / saved answers.
  const aiName = (id: string) =>
    id === "synthetic"
      ? t("pages.origin.synthetic")
      : id === "replay"
        ? t("pages.origin.replay")
        : (aiNames[id] ?? humanize(id));

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
  const selfName = entities.self;

  return (
    <div>
      <p className="crumbs">
        <Link to={`/brands/${encodeURIComponent(brandKey)}`}>
          {selfName ? t("pages.answers.back", { shop: selfName }) : t("pages.answers.backGeneric")}
        </Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{t("pages.answers.title")}</h1>
          <p className="lede">{t("pages.answers.lede")}</p>
          <Details>
            <p className="small muted pg-tech">
              {t("pages.answers.runLabel")} <code>{runId}</code>
            </p>
          </Details>
        </div>
      </div>

      {refs && (
        <div className="alert alert-info filter-note">
          <span>
            <T k={refs.size === 1 ? "pages.answers.refs_one" : "pages.answers.refs_other"} vars={{ n: fmt.number(refs.size) }} />
            {state.status === "ready" && scoped.length !== refs.size && (
              <> {t("pages.answers.refsFound", { found: fmt.number(scoped.length) })}</>
            )}
          </span>
          <button type="button" className="btn btn-link" onClick={() => setSearchParams({})}>
            {t("pages.answers.showAll")}
          </button>
        </div>
      )}

      <div className="card legend-card">
        <span className="legend-title">{t("pages.answers.legendTitle")}</span>
        <mark className="hl hl-self">{t("pages.answers.legend.self")}</mark>
        <mark className="hl hl-competitor">{t("pages.answers.legend.competitor")}</mark>
        <mark className="hl hl-discovered">{t("pages.answers.legend.discovered")}</mark>
        <span className="legend-item">
          <span className="rank-chip rank-self">
            <span className="rank-num">{t("pages.answers.rank", { n: 1 })}</span>
          </span>
          {t("pages.answers.legend.rank")}
        </span>
      </div>

      <div className="filters pg-filters">
        <label>
          <span className="small">{t("pages.answers.search")}</span>
          <input
            className="search-input search-inline"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("pages.answers.searchPlaceholder")}
          />
        </label>
        <label>
          <span>{t("pages.answers.type")}</span>
          <select value={intent} onChange={(e) => setIntent(e.target.value)}>
            <option value="all">{t("pages.answers.allTypes")}</option>
            {intents.map((i) => (
              <option key={i} value={i}>
                {intentLabel(i)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("pages.answers.ai")}</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="all">{t("pages.answers.allAis")}</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {aiName(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={onlyBrand} onChange={(e) => setOnlyBrand(e.target.checked)} />
          <span>{t("pages.answers.onlyMine")}</span>
        </label>
        {state.status === "ready" && (
          <span className="muted small filters-count" aria-live="polite">
            {t.n("pages.answers.count", scoped.length, {
              shown: fmt.number(visible.length),
              mentioning: fmt.number(mentioningCount),
            })}
          </span>
        )}
      </div>

      {state.status === "loading" && <p className="status">{t("pages.answers.loading")}</p>}
      {state.status === "error" && (
        <div className="alert alert-error" role="alert">
          <p>{t("pages.answers.loadError")}</p>
          <Details>
            <p className="small">{state.error instanceof Error ? state.error.message : String(state.error)}</p>
          </Details>
        </div>
      )}
      {state.status === "ready" && visible.length === 0 && <p className="empty">{t("pages.answers.empty")}</p>}

      <div className="obs-list">
        {visible.map((o) => (
          <ObservationCard key={o.observation_id} obs={o} entities={entities} aiName={aiName(o.provider_id)} />
        ))}
      </div>
    </div>
  );
}
