import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Details } from "../../settings/details";
import { getObservations } from "../../api/client";
import type { Mention } from "../../api/types";
import { cutPoint, highlight, KIND_KEY, pickSample } from "./answerHighlight";
import { useAsync } from "../../api/useAsync";
import { evidenceHref } from "../../format";
import { useT } from "../../i18n";

/**
 * "What AI actually said": one real answer, with your brand and competitors highlighted. Body
 * only — the caller (BrandDashboardPage) supplies the heading via CollapsibleSection.
 * `onSample` reports the responding AI's name upward once loaded, for the section's summary.
 */
export function SampleAnswer({
  brandKey,
  runId,
  labelOf,
  onSample,
}: {
  brandKey: string;
  runId: string;
  labelOf: (id: string) => string;
  onSample?: (aiName: string) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const state = useAsync(() => getObservations(brandKey, runId), [brandKey, runId]);
  const obs = state.status === "ready" ? pickSample(state.data.observations) : null;

  useEffect(() => {
    if (obs) onSample?.(labelOf(obs.provider_id));
  }, [obs, labelOf, onSample]);

  if (!obs) return <p className="muted">{t("dashboard.sample.empty")}</p>;

  const text = obs.response_text ?? "";
  const mentions = obs.mentions ?? [];
  const cut = cutPoint(text, mentions);
  const truncated = cut < text.length;
  const kindLabel = (k: Mention["entity_kind"]) => t(KIND_KEY[k] ?? "dashboard.sample.markOther");
  const kinds = new Set(mentions.map((m) => m.entity_kind));

  return (
    <>
      <p className="section-note">{t("dashboard.sample.caption")}</p>
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
          <Link to={evidenceHref(brandKey, runId)} className="sample-all">
            {t("dashboard.sample.seeAll")}
          </Link>
        </figcaption>
      </figure>
    </>
  );
}
