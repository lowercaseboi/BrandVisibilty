import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import type { BoardColumn } from "../../api/types";
import { Board } from "../../components/board/Board";
import { buildBoard, clearLegacyDone, migrateLegacyDone, moveCard, removeCard } from "../../components/board/boardModel";
import { useBoardState } from "../../components/board/useBoardState";
import type { BoardStatus } from "../../components/board/useBoardState";
import { groupSuggestions, useShortDate } from "../../components/dashboard/helpers";
import { ModuleShell } from "../../components/module/ModuleShell";
import { brandHref } from "../../components/module/modules";
import { TransitionLink } from "../../components/module/transition";
import { toast } from "../../components/Toaster";
import { useT } from "../../i18n";
import { useBrandData } from "./BrandContext";

function EmptyBoard({ brandKey, noneFound }: { brandKey: string; noneFound: boolean }) {
  const t = useT();
  return (
    <div className="card board-empty-state">
      <p className="eyebrow">{t("board.eyebrow")}</p>
      <h2>{noneFound ? t("board.empty.noneTitle") : t("board.empty.title")}</h2>
      <p className="muted">{noneFound ? t("board.empty.noneBody") : t("board.empty.body")}</p>
      <TransitionLink to={brandHref(brandKey, "analysis")} className="btn btn-primary">
        {t("board.empty.cta")}
      </TransitionLink>
    </div>
  );
}

/**
 * Recommendation engine: the latest run's suggestions as a kanban (Suggested · Saved for later ·
 * In progress · Done · Rejected — PRD §11.4's approve / reject / save-for-later). Column and order
 * per suggestion group are saved to the backend board; every card links back to its gap (AC-7).
 */
export function BoardModule() {
  const t = useT();
  const { brandKey, latest, labelOf } = useBrandData();
  const { state, status, retrying, commit, retry } = useBoardState(brandKey);
  const shortDate = useShortDate();
  const headingId = useId();
  const hintId = useId();

  const recs = latest?.recommendations;
  const gaps = latest?.gaps;
  const entities = latest?.entities;
  const columns = useMemo(() => buildBoard(recs, gaps, entities, state), [recs, gaps, entities, state]);
  const groups = useMemo(
    () => groupSuggestions(recs ?? [], new Map((gaps ?? []).map((g) => [g.gap_id, g]))),
    [recs, gaps],
  );

  // One-time import of the old checklist's "done" ticks (localStorage). Runs once the board has
  // loaded (again if a retry turns "offline" into "ready"); storage is cleared only after a save.
  const migratedIn = useRef<BoardStatus | null>(null);
  useEffect(() => {
    if (status === "loading" || !latest || migratedIn.current === status) return;
    migratedIn.current = status;
    const m = migrateLegacyDone(brandKey, state, groups);
    if (!m) return;
    if (m.migrated.length === 0) {
      if (status === "ready") clearLegacyDone(brandKey);
      return;
    }
    commit(m.state)
      .then((r) => {
        if (r !== "saved") return;
        clearLegacyDone(brandKey);
        toast(t.n("board.toast.migrated", m.migrated.length));
      })
      .catch(() => {});
  }, [status, latest, brandKey, state, groups, commit, t]);

  const onMove = useCallback(
    (key: string, to: BoardColumn, index: number) => {
      commit(moveCard(state, columns, key, to, index)).catch(() => {});
    },
    [commit, state, columns],
  );

  const onRemove = useCallback(
    (key: string) => {
      commit(removeCard(state, key)).catch(() => {});
    },
    [commit, state],
  );

  const hasCards = columns.some((c) => c.cards.length > 0);
  const runDate = latest ? shortDate(latest.collection_completed_at || latest.collection_started_at) : "";

  let body;
  if (!latest) body = <EmptyBoard brandKey={brandKey} noneFound={false} />;
  else if (status === "loading") body = <p className="status">{t("board.loading")}</p>;
  else if (!hasCards) body = <EmptyBoard brandKey={brandKey} noneFound />;
  else
    body = (
      <section className="board-section" aria-labelledby={headingId}>
        <div className="module-section-head">
          <div>
            <p className="eyebrow">{t("board.eyebrow")}</p>
            <h2 id={headingId}>{t("board.title")}</h2>
            <p>{t("board.intro")}</p>
          </div>
          {runDate && <p className="board-run">{t("board.meta.run", { date: runDate })}</p>}
        </div>
        {status === "offline" && (
          <p className="board-notice" role="status">
            <span className="board-notice-dot" aria-hidden="true" />
            {t("board.offline.notice")}{" "}
            <button type="button" className="btn-link" onClick={retry} disabled={retrying}>
              {retrying ? t("board.offline.retrying") : t("board.offline.retry")}
            </button>
          </p>
        )}
        <p id={hintId} className="board-hint">
          {t("board.hint")}
        </p>
        <Board
          columns={columns}
          brandKey={brandKey}
          runId={latest.run_id}
          entities={entities}
          labelOf={labelOf}
          hintId={hintId}
          onMove={onMove}
          onRemove={onRemove}
        />
      </section>
    );

  return <ModuleShell id="recommendations">{body}</ModuleShell>;
}
