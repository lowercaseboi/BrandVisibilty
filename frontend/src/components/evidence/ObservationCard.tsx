import type { Observation } from "../../api/types";
import { useT } from "../../i18n";
import { Details } from "../../settings/details";
import { mentionsBrand } from "./filter";
import { highlightMentions, mentionLabel, rankedEntities } from "./mentions";

/** One verbatim AI response: the question, which AI, whether it named you, every brand in rank order, and the highlighted text. */
export function ObservationCard({
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
  const named = mentionsBrand(obs);
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
          <span className={`badge ${named ? "badge-ok" : "badge-muted"}`}>
            {named ? t("pages.answers.named") : t("pages.answers.notNamed")}
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
      <div className="obs-response">{highlightMentions(obs.response_text ?? "", obs.mentions ?? [], entities, t)}</div>
    </article>
  );
}
