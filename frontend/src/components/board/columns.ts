import type { BoardColumn } from "../../api/types";
import type { MessageKey } from "../../i18n";

/** Column names (board.column.*). The tone per column lives in board.css ([data-column]). */
export const COLUMN_LABEL: Record<BoardColumn, MessageKey> = {
  suggested: "board.column.suggested",
  saved: "board.column.saved",
  in_progress: "board.column.in_progress",
  done: "board.column.done",
  rejected: "board.column.rejected",
};

/** Recommendation classes (DESIGN §5.4) — reuses the translated dashboard labels. */
export const CLASS_LABEL: Record<string, MessageKey> = {
  content: "dashboard.recs.class.content",
  messaging: "dashboard.recs.class.messaging",
  distribution: "dashboard.recs.class.distribution",
};
