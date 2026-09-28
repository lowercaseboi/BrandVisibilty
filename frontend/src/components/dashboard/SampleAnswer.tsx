import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Details } from "../../settings/details";
import type { Mention, Observation } from "../../api/types";
import { cutPoint, highlight, KIND_KEY } from "./answerHighlight";
import { useT } from "../../i18n";

/**
 * One real AI answer, shown as a recorded artefact: which AI and model, the question, and the
 * response with your brand and competitors highlighted (long answers collapse). Presentational —
 * the caller picks the answer (`pickSample`) from observations it already loaded; the Gaps &
 * evidence module uses it as the evidence pane's spotlight.
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
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();

  const text = obs.response_text ?? "";
  const mentions = obs.mentions ?? [];
  const cut = cutPoint(text, mentions);
  const truncated = cut < text.length;
  const kindLabel = (k: Mention["entity_kind"]) => t(KIND_KEY[k] ?? "dashboard.sample.markOther");
  const kinds = new Set(mentions.map((m) => m.entity_kind));

  return (
    <>
      <p className="section-note">{caption ?? t("dashboard.sample.caption")}</p>
      <figure className="card answer-card">
        {/* Source strip: which AI and model produced this exact response. */}
        <div className="answer-source">
          <span className="badge badge-live">{labelOf(obs.provider_id)}</span>
          {obs.model_version && <code className="answer-model">{obs.model_version}</code>}
        </div>
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
          <Details>
            <code className="answer-run">{runId}</code>
          </Details>
        </figcaption>
      </figure>
    </>
  );
}
