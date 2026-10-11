import type { ReactNode } from "react";
import { Details } from "../../settings/details";
import type { Mention, Observation } from "../../api/types";
import { KIND_KEY } from "./answerHighlight";
import { useT } from "../../i18n";
import { ReadMoreCut } from "../ui/ReadMore";

/**
 * One real AI answer, shown as a recorded artefact: which AI, the question, and the response with
 * your brand and competitors highlighted (long answers collapse). The model name and run ID are for
 * the Analytical view. Presentational — the caller picks the answer (`pickSample`) from
 * observations it already loaded; the Gaps module uses it as the evidence pane's spotlight.
 */
export function SampleAnswer({
  obs,
  runId,
  labelOf,
  caption,
}: {
  obs: Observation;
  runId: string;
  labelOf: (id: string) => string;
  /** Short line above the card saying why this answer was picked. */
  caption?: ReactNode;
}) {
  const t = useT();

  const text = obs.response_text ?? "";
  const mentions = obs.mentions ?? [];
  const kindLabel = (k: Mention["entity_kind"]) => t(KIND_KEY[k] ?? "dashboard.sample.markOther");
  const kinds = new Set(mentions.map((m) => m.entity_kind));

  return (
    <>
      <p className="section-note">{caption ?? t("dashboard.sample.caption")}</p>
      <figure className="card answer-card">
        <div className="answer-source">
          <span className="badge badge-live">{labelOf(obs.provider_id)}</span>
          <Details>{obs.model_version && <code className="answer-model">{obs.model_version}</code>}</Details>
        </div>
        <p className="sample-label">{t("dashboard.sample.asked")}</p>
        <blockquote className="sample-question">{obs.query_text}</blockquote>
        <p className="sample-label">
          {/* Simulated data isn't an AI ("Response from Simulated data"); the badge above says what it is. */}
          {obs.provider_id === "synthetic" ? t("dashboard.sample.response") : t("dashboard.sample.answeredBy", { ai: labelOf(obs.provider_id) })}
        </p>
        <ReadMoreCut key={obs.observation_id} className="sample-answer" text={text} mentions={mentions} kindLabel={kindLabel} />
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
          <Details>
            <code className="answer-run">{runId}</code>
          </Details>
        </figcaption>
      </figure>
    </>
  );
}
