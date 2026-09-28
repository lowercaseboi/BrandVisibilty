import { useId, useState } from "react";
import { BOARD_COLUMNS } from "../../api/types";
import type { BoardColumn } from "../../api/types";
import { T, useFormat, useT } from "../../i18n";
import { actionCopy } from "../dashboard/actions";
import { effortKey, effortLevel, gapFinding, gapTypeText, humanizeId } from "../dashboard/helpers";
import { gapsHref } from "../module/modules";
import { TransitionLink } from "../module/transition";
import type { BoardCard } from "./boardModel";
import { CLASS_LABEL, STATUS_LABEL } from "./columns";

export interface RecCardProps {
  card: BoardCard;
  title: string;
  brandKey: string;
  runId: string | null;
  entities?: Record<string, string>;
  labelOf: (providerId: string) => string;
  onStatus: (to: BoardColumn) => void;
  onRemove: () => void;
}

/**
 * One recommendation. A live card is a suggestion group from the latest run: class, impact, title,
 * effort, confidence, "Why?" (translated gap findings + steps + the engine's rationale) and — PRD
 * AC-7 — a link to every gap it traces to plus its supporting responses. The status select saves
 * the user's decision. A ghost card (no current recommendation) is shown faded as "resolved in
 * latest run" and can be removed.
 */
export function RecCard({ card, title, brandKey, runId, entities, labelOf, onStatus, onRemove }: RecCardProps) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const whyId = useId();

  const s = card.suggestion;
  const rec = s?.lead ?? null;
  const copy = actionCopy(card.action);
  const points = Math.round(rec?.delta_composite ?? 0);
  const traces = s
    ? s.gaps.length > 0
      ? s.gaps.map((g) => ({ id: g.gap_id, type: gapTypeText(g.gap_type, t) }))
      : [{ id: s.lead.gap_id, type: humanizeId(s.lead.gap_id) }]
    : [];
  const classKey = rec ? CLASS_LABEL[rec.action_class] : undefined;

  return (
    <li className={`card rec-card${s ? "" : " is-resolved"}`} data-status={card.column} aria-labelledby={titleId}>
      <div className="rec-card-top">
        {rec ? (
          <span className="badge badge-accent">{classKey ? t(classKey) : humanizeId(rec.action_class)}</span>
        ) : (
          <span className="badge badge-ok">{t("board.card.resolved")}</span>
        )}
        {rec && points > 0 && (
          <span className="rec-impact" title={t("board.card.impactLabel", { n: fmt.number(points) })}>
            {t("board.card.impact", { n: fmt.number(points) })}
          </span>
        )}
      </div>

      <h3 id={titleId} className="rec-card-title">
        {title}
      </h3>

      {rec ? (
        <>
          <dl className="rec-card-meta">
            <div>
              <dt className="eyebrow">{t("board.card.effort")}</dt>
              <dd>
                <span className={`effort-meter effort-${effortLevel(rec.effort)}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {t(effortKey(rec.effort))}
              </dd>
            </div>
            {typeof rec.confidence === "number" && (
              <div>
                <dt className="eyebrow">{t("board.card.confidence")}</dt>
                <dd>{fmt.percent(rec.confidence)}</dd>
              </div>
            )}
          </dl>

          <div className="rec-card-links">
            {traces.map((g) => (
              <TransitionLink
                key={g.id}
                to={gapsHref(brandKey, { gapId: g.id, runId: runId ?? undefined })}
                className="rec-trace"
                title={t("board.card.traceTitle", { id: g.id })}
              >
                <span aria-hidden="true">↳ </span>
                {t("board.card.trace", { type: g.type })}
              </TransitionLink>
            ))}
            {s && s.refs.length > 0 && (
              <TransitionLink to={gapsHref(brandKey, { runId: runId ?? undefined, refs: s.refs })} className="rec-evidence">
                {t.n("board.card.evidence", s.refs.length)}
              </TransitionLink>
            )}
          </div>

          <div className="rec-why">
            <button
              type="button"
              className="btn-link rec-why-toggle"
              aria-expanded={open}
              aria-controls={whyId}
              onClick={() => setOpen((o) => !o)}
            >
              <span className="disclosure-caret" aria-hidden="true" />
              {t("board.card.why")}
            </button>
            <div id={whyId} className="rec-why-body" hidden={!open}>
              {s && s.gaps.length > 0 ? (
                s.gaps.map((g) => {
                  const f = gapFinding(g, t, fmt, entities, labelOf);
                  return (
                    <p key={g.gap_id}>
                      <T k={f.key} vars={f.vars} />
                    </p>
                  );
                })
              ) : (
                <p>{t("dashboard.why.unknown")}</p>
              )}
              {copy && (
                <>
                  <p className="eyebrow rec-why-label">{t("board.card.how")}</p>
                  <ol className="rec-steps">
                    {copy.steps.map((k) => (
                      <li key={k}>{t(k, { competitor: card.competitor ?? "" })}</li>
                    ))}
                  </ol>
                </>
              )}
              {rec.reasoning && (
                <>
                  <p className="eyebrow rec-why-label">{t("board.card.rationale")}</p>
                  <p className="rec-rationale" lang="en">
                    {rec.reasoning}
                  </p>
                </>
              )}
              <p className="rec-drafted">
                {rec.drafted_by === "template"
                  ? t("board.card.draftedTemplate")
                  : t("board.card.draftedOther", { by: rec.drafted_by })}
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="rec-card-note">{t("board.card.resolvedNote")}</p>
      )}

      <div className="rec-card-foot">
        <span className="rec-status">
          <span className="rec-status-dot" aria-hidden="true" />
          <select
            value={card.column}
            aria-label={t("board.card.status", { title })}
            onChange={(e) => onStatus(e.target.value as BoardColumn)}
          >
            {BOARD_COLUMNS.map((c) => (
              <option key={c} value={c}>
                {t(STATUS_LABEL[c])}
              </option>
            ))}
          </select>
        </span>
        {!s && (
          <button
            type="button"
            className="btn-link rec-remove"
            aria-label={t("board.card.removeLabel", { title })}
            onClick={onRemove}
          >
            {t("board.card.remove")}
          </button>
        )}
      </div>
    </li>
  );
}
