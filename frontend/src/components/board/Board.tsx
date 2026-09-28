import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import type { BoardColumn } from "../../api/types";
import { useT } from "../../i18n";
import { actionTitle } from "../dashboard/actions";
import { BoardCard } from "./BoardCard";
import { findCard } from "./boardModel";
import type { BoardCard as BoardCardModel, BoardColumnView } from "./boardModel";
import { COLUMN_LABEL } from "./columns";

/** Private drag payload type, so a card dropped on some other app or text field carries nothing. */
const DND_TYPE = "application/x-bv-board-card";

const hasCardPayload = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(DND_TYPE);

/** Drop position inside a column list: how many (non-dragged) cards sit above the pointer. */
function indexAt(list: HTMLElement | null, clientY: number, dragKey: string | null): number {
  if (!list) return 0;
  let i = 0;
  for (const el of list.querySelectorAll<HTMLElement>(":scope > [data-card-key]")) {
    if (el.dataset.cardKey === dragKey) continue;
    const r = el.getBoundingClientRect();
    if (clientY > r.top + r.height / 2) i++;
    else break;
  }
  return i;
}

export interface BoardProps {
  columns: BoardColumnView[];
  brandKey: string;
  runId: string | null;
  entities?: Record<string, string>;
  labelOf: (providerId: string) => string;
  /** id of the visible "how to move cards" hint; every card is described by it. */
  hintId: string;
  /** Move `key` to `to` at `index` (index among that column's cards, not counting the moved one). */
  onMove: (key: string, to: BoardColumn, index: number) => void;
  onRemove: (key: string) => void;
}

/**
 * The kanban itself. Three ways to move a card, all ending in onMove:
 * - HTML5 drag and drop between columns and within one (a drop line shows where it lands);
 * - the card's ‹ / › buttons and "Move to" select (to the top of that column);
 * - the keyboard on a focused card: Alt+←/→ or [ / ] change column, Alt+↑/↓ reorder.
 * Every move is announced in a polite live region, and keyboard/button moves keep focus on the card.
 */
export function Board({ columns, brandKey, runId, entities, labelOf, hintId, onMove, onRemove }: BoardProps) {
  const t = useT();
  const baseId = useId();
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ column: BoardColumn; index: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const cardEls = useRef(new Map<string, HTMLLIElement>());
  const listEls = useRef(new Map<BoardColumn, HTMLOListElement>());
  const focusKey = useRef<string | null>(null);

  const titleOf = useCallback((card: BoardCardModel) => actionTitle(card.action, card.competitor, t), [t]);
  const announce = (text: string) => setMessage((m) => ({ text, n: m.n + 1 }));

  // Keyboard and button moves remount the card in its new column; put focus back on it.
  useEffect(() => {
    const key = focusKey.current;
    if (!key) return;
    focusKey.current = null;
    cardEls.current.get(key)?.focus();
  }, [columns]);

  const move = (key: string, to: BoardColumn, index: number, keepFocus: boolean) => {
    const from = findCard(columns, key);
    if (!from) return;
    const card = columns.find((c) => c.id === from.column)!.cards[from.index];
    const others = columns.find((c) => c.id === to)!.cards.filter((c) => c.key !== key).length;
    const at = Math.max(0, Math.min(index, others));
    if (from.column === to && from.index === at) return;
    if (keepFocus) focusKey.current = key;
    onMove(key, to, at);
    announce(
      t("board.announce.moved", { title: titleOf(card), column: t(COLUMN_LABEL[to]), pos: at + 1, total: others + 1 }),
    );
  };

  const remove = (key: string) => {
    const from = findCard(columns, key);
    if (!from) return;
    const cards = columns.find((c) => c.id === from.column)!.cards;
    const neighbour = cards[from.index + 1] ?? cards[from.index - 1];
    if (neighbour) focusKey.current = neighbour.key;
    onRemove(key);
    announce(t("board.announce.removed", { title: titleOf(cards[from.index]) }));
  };

  // ---- drag and drop ----

  const endDrag = () => {
    setDrag(null);
    setDrop(null);
  };

  const onDragOver = (e: DragEvent<HTMLElement>, col: BoardColumn) => {
    if (!hasCardPayload(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const index = indexAt(listEls.current.get(col) ?? null, e.clientY, drag);
    setDrop((d) => (d && d.column === col && d.index === index ? d : { column: col, index }));
  };

  const onDragLeave = (e: DragEvent<HTMLElement>, col: BoardColumn) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDrop((d) => (d?.column === col ? null : d));
  };

  const onDrop = (e: DragEvent<HTMLElement>, col: BoardColumn) => {
    if (!hasCardPayload(e)) return;
    e.preventDefault();
    const key = e.dataTransfer.getData(DND_TYPE) || drag;
    const index = drop?.column === col ? drop.index : indexAt(listEls.current.get(col) ?? null, e.clientY, key);
    endDrag();
    if (key) move(key, col, index, false);
  };

  const dragFrom = drag ? findCard(columns, drag) : null;

  return (
    <>
      <div className={`board${drag ? " is-dragging" : ""}`}>
        {columns.map((col) => {
          const headId = `${baseId}-${col.id}`;
          const visible = col.cards.filter((c) => c.key !== drag).length;
          const over = drop?.column === col.id;
          const noop = over && dragFrom?.column === col.id && dragFrom.index === drop.index;
          const showLine = over && !noop && visible > 0;

          const items: ReactNode[] = [];
          let n = 0;
          let lineDrawn = false;
          const line = <li key="__drop" className="board-drop" aria-hidden="true" />;
          for (const card of col.cards) {
            if (showLine && !lineDrawn && card.key !== drag && n === drop.index) {
              items.push(line);
              lineDrawn = true;
            }
            if (card.key !== drag) n++;
            items.push(
              <BoardCard
                key={card.key}
                card={card}
                title={titleOf(card)}
                brandKey={brandKey}
                runId={runId}
                entities={entities}
                labelOf={labelOf}
                hintId={hintId}
                dragging={drag === card.key}
                cardRef={(el) => {
                  if (el) cardEls.current.set(card.key, el);
                  else if (cardEls.current.get(card.key)?.isConnected === false) cardEls.current.delete(card.key);
                }}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(DND_TYPE, card.key);
                  // After the browser has captured the drag image, so the image isn't the faded placeholder.
                  window.setTimeout(() => setDrag(card.key), 0);
                }}
                onDragEnd={endDrag}
                onMoveTo={(to) => move(card.key, to, 0, true)}
                onReorder={(delta) => {
                  const at = findCard(columns, card.key);
                  if (at) move(card.key, col.id, at.index + delta, true);
                }}
                onRemove={() => remove(card.key)}
              />,
            );
          }
          if (showLine && !lineDrawn) items.push(line);

          return (
            <section
              key={col.id}
              className={`board-col${over ? " is-over" : ""}`}
              data-column={col.id}
              aria-labelledby={headId}
              onDragOver={(e) => onDragOver(e, col.id)}
              onDragLeave={(e) => onDragLeave(e, col.id)}
              onDrop={(e) => onDrop(e, col.id)}
            >
              <header className="board-col-head">
                <h3 id={headId} className="board-col-title">
                  {t(COLUMN_LABEL[col.id])}
                </h3>
                <span className="board-col-count">
                  <span aria-hidden="true">{col.cards.length}</span>
                  <span className="sr-only">{t.n("board.column.count", col.cards.length)}</span>
                </span>
              </header>
              <ol
                className="board-list"
                ref={(el) => {
                  if (el) listEls.current.set(col.id, el);
                }}
              >
                {items}
                {col.cards.length === 0 && (
                  <li className="board-empty">
                    {col.id === "suggested" ? t("board.column.emptySuggested") : t("board.column.empty")}
                  </li>
                )}
              </ol>
            </section>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={message.n}>{message.text}</span>
      </p>
    </>
  );
}
