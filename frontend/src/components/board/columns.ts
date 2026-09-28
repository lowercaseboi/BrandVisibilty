import type { BoardColumn } from "../../api/types";
import type { MessageKey } from "../../i18n";
import type { BoardFilter } from "./boardModel";

/** Status names (board.status.*) — a card's saved column. The tone per status lives in board.css. */
export const STATUS_LABEL: Record<BoardColumn, MessageKey> = {
  suggested: "board.status.suggested",
  saved: "board.status.saved",
  in_progress: "board.status.in_progress",
  done: "board.status.done",
  rejected: "board.status.rejected",
};

export const FILTER_LABEL: Record<BoardFilter, MessageKey> = {
  all: "board.filter.all",
  open: "board.filter.open",
  in_progress: "board.filter.in_progress",
  done: "board.filter.done",
  rejected: "board.filter.rejected",
};

/** Recommendation classes (DESIGN §5.4) — reuses the translated dashboard labels. */
export const CLASS_LABEL: Record<string, MessageKey> = {
  content: "dashboard.recs.class.content",
  messaging: "dashboard.recs.class.messaging",
  distribution: "dashboard.recs.class.distribution",
};
