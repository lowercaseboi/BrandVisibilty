import type { CSSProperties } from "react";
import type { BoardColumn } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";

/** The board columns the preview draws, left → right (rejected cards are left out of the bar). */
const PREVIEW_COLUMNS: BoardColumn[] = ["suggested", "saved", "in_progress", "done"];

const COLUMN_KEY: Record<BoardColumn, MessageKey> = {
  suggested: "hub.preview.board.col.suggested",
  saved: "hub.preview.board.col.saved",
  in_progress: "hub.preview.board.col.in_progress",
  done: "hub.preview.board.col.done",
  rejected: "hub.preview.board.col.rejected",
};

/**
 * The Recommendation engine card's live preview: how many actions are on the board and a
 * mini-kanban of where they sit. Until the board state is wired in, pass only `total` and every
 * action counts as "Suggested"; pass `columns` (counts per board column) to show real progress.
 */
export function BoardPreview({ total, columns }: { total: number; columns?: Partial<Record<BoardColumn, number>> }) {
  const t = useT();
  const fmt = useFormat();
  if (total === 0) return <p className="hub-pv-empty">{t("hub.preview.board.none")}</p>;

  const counts: Record<BoardColumn, number> = {
    suggested: columns ? (columns.suggested ?? 0) : total,
    saved: columns?.saved ?? 0,
    in_progress: columns?.in_progress ?? 0,
    done: columns?.done ?? 0,
    rejected: columns?.rejected ?? 0,
  };

  return (
    <div className="hub-pv-board">
      <p className="hub-pv-stat">
        <span className="hub-pv-num">{fmt.number(total)}</span>
        <span className="hub-pv-unit">{t.n("hub.preview.board.unit", total)}</span>
      </p>
      <ol className="hub-pv-kanban">
        {PREVIEW_COLUMNS.map((c) => (
          <li key={c} className={`hub-pv-col hub-pv-col-${c}${counts[c] ? "" : " is-empty"}`}>
            <span className="hub-pv-col-bar" aria-hidden="true">
              {/* One chip per card (up to 5), so the column reads as a tiny stack of cards. */}
              {Array.from({ length: Math.min(5, counts[c]) }, (_, i) => (
                <span key={i} className="hub-pv-chip" style={{ "--k": i } as CSSProperties} />
              ))}
              <b className="hub-pv-col-count">{fmt.number(counts[c])}</b>
            </span>
            <span className="hub-pv-col-label">{t(COLUMN_KEY[c])}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
