/* oxlint-disable react/only-export-components -- the pure focus rules live beside the component that applies them */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { viewTransitionFinished } from "./module/transition";

/** Give a late page (lazy route, data still loading) this many frames to render its <h1>. */
const MAX_WAIT_FRAMES = 90;

/** The DOM surface the rules below need — narrow, so they can be unit-tested without a browser. */
export interface NodeLike {
  contains(other: NodeLike | null): boolean;
}

/**
 * Should route focus move to the new page's heading? Yes unless the page already put focus
 * somewhere on purpose: an element inside <main> that isn't the link/button that started the
 * navigation (e.g. a form that focuses its first field on mount). Focus left on the body, on
 * <main>, on the trigger itself, or in the header (outside <main>) is fair game.
 */
export function shouldTakeFocus(
  active: NodeLike | null,
  { body, main, trigger }: { body: NodeLike | null; main: NodeLike | null; trigger: NodeLike | null },
): boolean {
  if (!active || active === body || active === main) return true;
  if (trigger && (active === trigger || trigger.contains(active) || active.contains(trigger))) return true;
  if (!main) return true;
  return !main.contains(active);
}

/** Only a new pathname counts as a new page: hash-only and query-only changes keep focus where it is. */
export function isNewPage(prev: string | null, next: string): boolean {
  return prev !== null && prev !== next;
}

/** The words announced for the new page: its heading, else the document title. */
export function pageLabel(heading: string | null | undefined, title: string): string {
  const h = (heading ?? "").replace(/\s+/g, " ").trim();
  return h || title.trim();
}

function findHeading(): HTMLElement | null {
  const main = document.getElementById("main");
  const h1 = (main ?? document).querySelector<HTMLElement>("h1");
  return h1 && (h1.textContent ?? "").trim() ? h1 : null;
}

/**
 * Route-change focus management for keyboard and screen-reader users. When the pathname changes
 * (not on the first load, not for hash/query-only changes) it waits for any View Transition morph
 * to finish, then moves focus to the new page's <h1> (made focusable with tabIndex=-1 for the
 * moment) — or to <main> if there is none — without scrolling, and announces the page title in a
 * polite live region. It leaves focus alone when the new page already moved it somewhere itself.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const [message, setMessage] = useState("");
  const prevPath = useRef<string | null>(null);
  const trigger = useRef<Element | null>(null);

  // Remember what the user last activated: if focus is still on it after the navigation, it's
  // not a page's own focus decision, so moving to the heading won't steal anything.
  useEffect(() => {
    const note = () => {
      trigger.current = document.activeElement;
    };
    const onPointer = (e: Event) => {
      trigger.current = e.target instanceof Element ? e.target : document.activeElement;
    };
    document.addEventListener("click", onPointer, true);
    document.addEventListener("keydown", note, true);
    return () => {
      document.removeEventListener("click", onPointer, true);
      document.removeEventListener("keydown", note, true);
    };
  }, []);

  useEffect(() => {
    const prev = prevPath.current;
    prevPath.current = pathname;
    if (!isNewPage(prev, pathname)) return;

    let cancelled = false;
    let frame = 0;
    let frames = 0;

    const apply = () => {
      if (cancelled) return;
      const heading = findHeading();
      if (!heading && frames++ < MAX_WAIT_FRAMES) {
        frame = requestAnimationFrame(apply);
        return;
      }
      const main = document.getElementById("main");
      const target = heading ?? main;
      if (
        target &&
        shouldTakeFocus(document.activeElement, { body: document.body, main, trigger: trigger.current })
      ) {
        if (target === heading && !heading.hasAttribute("tabindex")) {
          heading.setAttribute("tabindex", "-1");
          heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
        }
        target.focus({ preventScroll: true });
      }
      // Clear first so the same title twice in a row (e.g. brand A hub → brand B hub named alike)
      // is still announced.
      setMessage("");
      frame = requestAnimationFrame(() => {
        if (!cancelled) setMessage(pageLabel(heading?.textContent, document.title));
      });
    };

    // Run after the navigation commit and after any View Transition morph: focusing mid-morph would
    // paint a focus ring into the new snapshot and can make the browser skip the transition.
    const start = () => {
      if (!cancelled) frame = requestAnimationFrame(apply);
    };
    const vt = viewTransitionFinished();
    if (vt) vt.then(start, start);
    else start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
