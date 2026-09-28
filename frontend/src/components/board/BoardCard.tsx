import { useId, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { BOARD_COLUMNS } from "../../api/types";
import type { BoardColumn } from "../../api/types";
import { T, useFormat, useT } from "../../i18n";
import { actionCopy } from "../dashboard/actions";
import { effortKey, effortLevel, gapFinding, gapTypeText, humanizeId } from "../dashboard/helpers";
import { gapsHref } from "../module/modules";
import { TransitionLink } from "../module/transition";
import type { BoardCard as BoardCardModel } from "./boardModel";
import { CLASS_LABEL, COLUMN_LABEL } from "./columns";

export interface BoardCardProps {
  card: BoardCardModel;
  title: string;
  brandKey: string;
  runId: string | null;
  entities?: Record<string, string>;
  labelOf: (providerId: string) => string;
  /** id of the keyboard/drag hint, read after the card's title. */
  hintId: string;
  dragging: boolean;
  cardRef: (el: HTMLLIElement | null) => void;
  onDragStart: (e: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onMoveTo: (to: BoardColumn) => void;
  onReorder: (delta: -1 | 1) => void;
  onRemove: () => void;
}

/**
 * One kanban card. A live card is a suggestion group from the latest run: title, class, impact,
 * effort, confidence, "Why?" (translated gap findings + steps + the engine's rationale) and — PRD
 * AC-7 — a link to every gap it traces to plus its supporting responses. A ghost card (no current
 * recommendation) is shown faded as "resolved in latest run" and can be removed.
 */
export function BoardCard({
  card,
  title,
  brandKey,
  runId,
  entities,
  labelOf,
  hintId,
  dragging,
  cardRef,
  onDragStart,
  onDragEnd,
  onMoveTo,
  onReorder,
  onRemove,
}: BoardCardProps) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const whyId = useId();

  const col = BOARD_COLUMNS.indexOf(card.column);
  const prev = col > 0 ? BOARD_COLUMNS[col - 1] : null;
  const next = col < BOARD_COLUMNS.length - 1 ? BOARD_COLUMNS[col + 1] : null;

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey) return;
    const plain = !e.altKey && !e.shiftKey;
    let handled = true;
    if ((e.altKey && e.key === "ArrowLeft") || (plain && e.key === "[")) {
      if (prev) onMoveTo(prev);
    } else if ((e.altKey && e.key === "ArrowRight") || (plain && e.key === "]")) {
      if (next) onMoveTo(next);
    } else if (e.altKey && e.key === "ArrowUp") onReorder(-1);
    else if (e.altKey && e.key === "ArrowDown") onReorder(1);
    else handled = false;
    if (handled) e.preventDefault();
  };

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
    <li
      ref={cardRef}
      className={`card board-card${s ? "" : " is-resolved"}${dragging ? " is-dragging" : ""}`}
      data-card-key={card.key}
      draggable
      tabIndex={0}
      aria-labelledby={titleId}
      aria-describedby={hintId}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
    >
      <div className="board-card-top">
        {rec ? (
          <span className="badge badge-accent">{classKey ? t(classKey) : humanizeId(rec.action_class)}</span>
        ) : (
          <span className="badge badge-ok">{t("board.card.resolved")}</span>
        )}
        {rec && points > 0 && (
          <span className="board-impact" title={t("board.card.impactLabel", { n: fmt.number(points) })}>
            {t("board.card.impact", { n: fmt.number(points) })}
          </span>
        )}
      </div>

      <h4 id={titleId} className="board-card-title">
        {title}
      </h4>

      {rec ? (
        <>
          <dl className="board-card-meta">
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

          <div className="board-card-links">
            {traces.map((g) => (
              <TransitionLink
                key={g.id}
                to={gapsHref(brandKey, { gapId: g.id, runId: runId ?? undefined })}
                className="board-trace"
                title={t("board.card.traceTitle", { id: g.id })}
                draggable={false}
              >
                <span aria-hidden="true">↳ </span>
                {t("board.card.trace", { type: g.type })}
              </TransitionLink>
            ))}
            {s && s.refs.length > 0 && (
              <TransitionLink
                to={gapsHref(brandKey, { runId: runId ?? undefined, refs: s.refs })}
                className="board-evidence"
                draggable={false}
              >
                {t.n("board.card.evidence", s.refs.length)}
              </TransitionLink>
            )}
          </div>

          <div className="board-why">
            <button
              type="button"
              className="btn-link board-why-toggle"
              aria-expanded={open}
              aria-controls={whyId}
              onClick={() => setOpen((o) => !o)}
            >
              <span className="disclosure-caret" aria-hidden="true" />
              {t("board.card.why")}
            </button>
            <div id={whyId} className="board-why-body" hidden={!open}>
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
                  <p className="eyebrow board-why-label">{t("board.card.how")}</p>
                  <ol className="board-steps">
                    {copy.steps.map((k) => (
                      <li key={k}>{t(k, { competitor: card.competitor ?? "" })}</li>
                    ))}
                  </ol>
                </>
              )}
              {rec.reasoning && (
                <>
                  <p className="eyebrow board-why-label">{t("board.card.rationale")}</p>
                  <p className="board-rationale" lang="en">
                    {rec.reasoning}
                  </p>
                </>
              )}
              <p className="board-drafted">
                {rec.drafted_by === "template"
                  ? t("board.card.draftedTemplate")
                  : t("board.card.draftedOther", { by: rec.drafted_by })}
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="board-card-note">{t("board.card.resolvedNote")}</p>
      )}

      <div className="board-card-foot">
        <button
          type="button"
          className="board-step"
          disabled={!prev}
          aria-label={prev ? t("board.card.movePrev", { column: t(COLUMN_LABEL[prev]) }) : undefined}
          title={prev ? t("board.card.movePrev", { column: t(COLUMN_LABEL[prev]) }) : undefined}
          onClick={() => prev && onMoveTo(prev)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <select
          className="board-move"
          value={card.column}
          aria-label={t("board.card.moveTo", { title })}
          draggable={false}
          onChange={(e) => onMoveTo(e.target.value as BoardColumn)}
        >
          {BOARD_COLUMNS.map((c) => (
            <option key={c} value={c}>
              {t(COLUMN_LABEL[c])}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="board-step"
          disabled={!next}
          aria-label={next ? t("board.card.moveNext", { column: t(COLUMN_LABEL[next]) }) : undefined}
          title={next ? t("board.card.moveNext", { column: t(COLUMN_LABEL[next]) }) : undefined}
          onClick={() => next && onMoveTo(next)}
        >
          <span aria-hidden="true">›</span>
        </button>
        {!s && (
          <button
            type="button"
            className="btn-link board-remove"
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
