import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useT } from "../../i18n";
import { prefersReducedMotion } from "../../settings/motion";
import { BOARD_FILTERS } from "./boardModel";
import type { BoardFilter } from "./boardModel";
import { laneIndexFromScroll, lanesInView } from "./lanes";

export interface RecLanesProps {
  filter: BoardFilter;
  onFilter: (f: BoardFilter) => void;
  /** The filter buttons by filter (shared with RecList, which refocuses them). */
  buttons: RefObject<Map<BoardFilter, HTMLButtonElement>>;
  /** A tab's content: label and count. */
  chip: (f: BoardFilter) => ReactNode;
  /** A lane's content: its cards, or the empty message. */
  lane: (f: BoardFilter) => ReactNode;
}

const N = BOARD_FILTERS.length;

/** Distance between two lanes' starts (lane width + gap); the scroller's width before layout. */
function laneStride(el: HTMLElement): number {
  const [a, b] = el.children as HTMLCollectionOf<HTMLElement>;
  return a && b ? b.offsetLeft - a.offsetLeft : el.clientWidth;
}

/**
 * Phones: the filters as a sticky, swipeable strip of tabs over one full-width lane per filter
 * (horizontal scroll-snap). Tapping a tab scrolls to its lane; swiping moves the active tab.
 * Lanes flow with the page (no inner vertical scroll): the scroller is as tall as the lane on
 * screen (both neighbours mid-swipe), and landing on a lane scrolled past brings its top back
 * under the strip. Lanes that aren't active are inert, so keyboard and screen-reader users meet
 * each card once.
 */
export function RecLanes({ filter, onFilter, buttons, chip, lane }: RecLanesProps) {
  const t = useT();
  const uid = useId();
  const strip = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const index = BOARD_FILTERS.indexOf(filter);
  const current = useRef(index);
  // A tapped tab's lane while the scroll glides there; passing lanes don't steal the tab meanwhile.
  const steering = useRef<number | null>(null);
  // The filter this component itself just reported from a swipe (no scroll back needed).
  const reported = useRef<BoardFilter | null>(null);
  const landed = useRef(index);
  const frame = useRef(0);
  const mounted = useRef(false);
  const tabId = (f: BoardFilter) => `${uid}-tab-${f}`;
  const laneId = (f: BoardFilter) => `${uid}-lane-${f}`;

  const syncHeight = (el: HTMLElement) => {
    const lanes = el.children as HTMLCollectionOf<HTMLElement>;
    const [a, b] = lanesInView(el.scrollLeft, laneStride(el), lanes.length);
    const h = Math.max(lanes[a]?.offsetHeight ?? 0, lanes[b]?.offsetHeight ?? 0);
    if (h > 0) el.style.height = `${h}px`;
  };

  // Landed on a lane while scrolled down into the lanes: bring its top back under the strip.
  const revealTop = (el: HTMLElement) => {
    const below = strip.current?.getBoundingClientRect().bottom ?? 0;
    const top = el.getBoundingClientRect().top;
    if (top >= below) return;
    const gap = parseFloat(getComputedStyle(el.parentElement ?? el).rowGap) || 0;
    window.scrollBy({ top: top - below - gap, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = scroller.current;
      if (!el) return;
      syncHeight(el);
      const w = laneStride(el);
      const [a, b] = lanesInView(el.scrollLeft, w, N);
      const settled = a === b ? a : null;
      if (steering.current !== null) {
        if (settled !== steering.current) return;
        steering.current = null;
      }
      const i = laneIndexFromScroll(el.scrollLeft, w, N);
      if (i !== current.current) {
        current.current = i;
        reported.current = BOARD_FILTERS[i];
        onFilter(BOARD_FILTERS[i]);
      }
      if (settled !== null && settled !== landed.current) {
        landed.current = settled;
        revealTop(el);
      }
    });
  };

  // A finger or wheel on the lanes takes over from a tab's glide.
  const takeOver = () => {
    steering.current = null;
  };

  // The filter changed (tab tap, keyboard, "Show all", or a swipe): keep its tab in view in the
  // strip and, unless the swipe already got there, scroll its lane into view.
  useLayoutEffect(() => {
    const el = scroller.current;
    const first = !mounted.current;
    mounted.current = true;
    current.current = index;
    const behavior: ScrollBehavior = first || prefersReducedMotion() ? "auto" : "smooth";

    const tab = buttons.current.get(filter);
    const s = strip.current;
    if (tab && s && s.scrollWidth > s.clientWidth) {
      s.scrollTo({ left: tab.offsetLeft - (s.clientWidth - tab.offsetWidth) / 2, behavior });
    }

    if (reported.current === filter) {
      reported.current = null;
      return;
    }
    reported.current = null;
    if (!el) return;
    const w = laneStride(el);
    const [a, b] = lanesInView(el.scrollLeft, w, N);
    if (a === b && a === index) {
      if (first) syncHeight(el);
      return;
    }
    steering.current = index;
    if (first) landed.current = index;
    el.scrollTo({ left: index * w, behavior });
    if (first) syncHeight(el);
  }, [filter, index, buttons]);

  // Cards growing (details opened, status changes) and width changes (rotation): keep the height
  // in step, and stay on the active lane when the stride changes.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        el.scrollTo({ left: current.current * laneStride(el), behavior: "auto" });
      }
      syncHeight(el);
    });
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  // Tabs pattern: arrows / Home / End move between tabs (and their lanes); only the active tab is
  // in the Tab order.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let j: number;
    if (e.key === "ArrowRight") j = (index + 1) % N;
    else if (e.key === "ArrowLeft") j = (index - 1 + N) % N;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = N - 1;
    else return;
    e.preventDefault();
    onFilter(BOARD_FILTERS[j]);
    buttons.current.get(BOARD_FILTERS[j])?.focus({ preventScroll: true });
  };

  return (
    <>
      <div ref={strip} className="rec-filters rec-tabs" role="tablist" aria-label={t("board.lanes.label")} onKeyDown={onKeyDown}>
        {BOARD_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            id={tabId(f)}
            ref={(el) => {
              if (el) buttons.current.set(f, el);
              else buttons.current.delete(f);
            }}
            className={`rec-filter${filter === f ? " is-active" : ""}`}
            data-filter={f}
            aria-selected={filter === f}
            aria-controls={laneId(f)}
            tabIndex={filter === f ? 0 : -1}
            onClick={() => onFilter(f)}
          >
            {chip(f)}
          </button>
        ))}
      </div>

      <div ref={scroller} className="rec-lanes" onScroll={onScroll} onPointerDown={takeOver} onWheel={takeOver}>
        {BOARD_FILTERS.map((f, i) => (
          <section key={f} id={laneId(f)} className="rec-lane" role="tabpanel" aria-labelledby={tabId(f)} inert={i !== index}>
            {lane(f)}
          </section>
        ))}
      </div>
    </>
  );
}
