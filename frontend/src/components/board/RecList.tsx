import { useCallback, useMemo, useRef, useState } from "react";
import type { BoardColumn, Observation } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import { actionTitle } from "../dashboard/actions";
import { BOARD_FILTERS, filterCounts, listCards, matchesFilter } from "./boardModel";
import type { BoardCard, BoardColumnView, BoardFilter } from "./boardModel";
import { FILTER_LABEL, STATUS_LABEL } from "./columns";
import { RecCard } from "./RecCard";

export interface RecListProps {
  columns: BoardColumnView[];
  brandKey: string;
  runId: string | null;
  entities?: Record<string, string>;
  labelOf: (providerId: string) => string;
  /** The run's responses by id (for each card's plain "Why"); null until loaded. */
  observations: ReadonlyMap<string, Observation> | null;
  campaignsReady: boolean;
  onStatus: (key: string, to: BoardColumn) => void;
  onRemove: (key: string) => void;
}

/**
 * The recommendations as one priority-sorted grid of cards (side by side, one per suggestion
 * group), with a slim filter bar over it. Status changes never reorder the grid; when a change takes
 * a card out of the current filter, focus returns to that filter's button. Changes are announced in
 * a polite live region.
 */
export function RecList(props: RecListProps) {
  const { columns, brandKey, runId, entities, labelOf, observations, campaignsReady, onStatus, onRemove } = props;
  const t = useT();
  const fmt = useFormat();
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [message, setMessage] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const filterBtns = useRef(new Map<BoardFilter, HTMLButtonElement>());

  const cards = useMemo(() => listCards(columns), [columns]);
  const counts = useMemo(() => filterCounts(cards), [cards]);
  const shown = cards.filter((c) => matchesFilter(c, filter));

  const titleOf = useCallback((card: BoardCard) => actionTitle(card.action, card.competitor, t), [t]);
  const announce = (text: string) => setMessage((m) => ({ text, n: m.n + 1 }));
  const refocusFilter = () => window.setTimeout(() => filterBtns.current.get(filter)?.focus(), 0);

  const changeStatus = (card: BoardCard, to: BoardColumn) => {
    if (card.column === to) return;
    onStatus(card.key, to);
    announce(t("board.announce.status", { title: titleOf(card), status: t(STATUS_LABEL[to]) }));
    if (!matchesFilter({ ...card, column: to }, filter)) refocusFilter();
  };

  const remove = (card: BoardCard) => {
    onRemove(card.key);
    announce(t("board.announce.removed", { title: titleOf(card) }));
    refocusFilter();
  };

  return (
    <>
      <div className="rec-filters" role="group" aria-label={t("board.filter.label")}>
        {BOARD_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            ref={(el) => {
              if (el) filterBtns.current.set(f, el);
              else filterBtns.current.delete(f);
            }}
            className={`rec-filter${filter === f ? " is-active" : ""}`}
            data-filter={f}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {t(FILTER_LABEL[f])}
            <span className="rec-filter-count">{fmt.number(counts[f])}</span>
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ol className="rec-grid">
          {shown.map((card) => (
            <RecCard
              key={card.key}
              card={card}
              title={titleOf(card)}
              brandKey={brandKey}
              runId={runId}
              entities={entities}
              labelOf={labelOf}
              observations={observations}
              campaignsReady={campaignsReady}
              onStatus={(to) => changeStatus(card, to)}
              onRemove={() => remove(card)}
            />
          ))}
        </ol>
      ) : (
        <p className="rec-filter-empty">
          {t("board.filter.empty")}{" "}
          <button type="button" className="btn-link" onClick={() => setFilter("all")}>
            {t("board.filter.showAll")}
          </button>
        </p>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={message.n}>{message.text}</span>
      </p>
    </>
  );
}
