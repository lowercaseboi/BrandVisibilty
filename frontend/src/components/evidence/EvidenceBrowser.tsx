import { useMemo, useState } from "react";
import type { Observation } from "../../api/types";
import { useIntentLabel } from "../../format";
import { useFormat, useT } from "../../i18n";
import { ObservationCard } from "./ObservationCard";
import { NO_FILTER, distinct, filterObservations, isFiltered, mentionsBrand } from "./filter";
import type { EvidenceFilter } from "./filter";

// Long runs have hundreds of responses; render them a page at a time.
const PAGE = 20;

/** "Which colour means what" — one line above the responses. */
export function EvidenceLegend() {
  const t = useT();
  return (
    <div className="card legend-card evidence-legend">
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
  );
}

/**
 * The browsable list of verbatim AI responses: text search, question type, AI and "only mentioning
 * you" filters over `observations` (already narrowed to a gap's evidence by the caller), then the
 * highlighted response cards. Filter state is local — key this component by the current selection
 * so picking another gap starts from a clean slate.
 */
export function EvidenceBrowser({
  observations,
  entities,
  aiName,
}: {
  observations: Observation[];
  entities: Record<string, string>;
  aiName: (providerId: string) => string;
}) {
  const t = useT();
  const fmt = useFormat();
  const intentLabel = useIntentLabel();
  const [filter, setFilter] = useState<EvidenceFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);

  const intents = useMemo(() => distinct(observations, (o) => o.intent_type), [observations]);
  const providers = useMemo(() => distinct(observations, (o) => o.provider_id), [observations]);
  const visible = useMemo(() => filterObservations(observations, filter), [observations, filter]);
  const mentioning = useMemo(() => observations.filter(mentionsBrand).length, [observations]);

  const update = (patch: Partial<EvidenceFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setLimit(PAGE);
  };
  const shown = visible.slice(0, limit);
  const rest = visible.length - shown.length;

  return (
    <div className="evidence-browser">
      <div className="filters pg-filters evidence-filters">
        <label className="evidence-search">
          <span className="small">{t("pages.answers.search")}</span>
          <input
            className="search-input"
            type="search"
            value={filter.text}
            onChange={(e) => update({ text: e.target.value })}
            placeholder={t("pages.answers.searchPlaceholder")}
          />
        </label>
        <label>
          <span>{t("pages.answers.type")}</span>
          <select value={filter.intent} onChange={(e) => update({ intent: e.target.value })}>
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
          <select value={filter.provider} onChange={(e) => update({ provider: e.target.value })}>
            <option value="all">{t("pages.answers.allAis")}</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {aiName(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={filter.onlyBrand} onChange={(e) => update({ onlyBrand: e.target.checked })} />
          <span>{t("pages.answers.onlyMine")}</span>
        </label>
        <span className="muted small filters-count" aria-live="polite">
          {t.n("pages.answers.count", observations.length, {
            shown: fmt.number(visible.length),
            mentioning: fmt.number(mentioning),
          })}
        </span>
      </div>

      <EvidenceLegend />

      {visible.length === 0 ? (
        <div className="evidence-empty">
          <p className="empty">{t("pages.answers.empty")}</p>
          {isFiltered(filter) && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => update(NO_FILTER)}>
              {t("modules.evidence.resetFilters")}
            </button>
          )}
        </div>
      ) : (
        <div className="obs-list">
          {shown.map((o) => (
            <ObservationCard key={o.observation_id} obs={o} entities={entities} aiName={aiName(o.provider_id)} />
          ))}
        </div>
      )}

      {rest > 0 && (
        <button type="button" className="btn btn-secondary evidence-more" onClick={() => setLimit((n) => n + PAGE)}>
          {t.n("modules.evidence.showMore", Math.min(PAGE, rest))}
        </button>
      )}
    </div>
  );
}
