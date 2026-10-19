/* oxlint-disable react/only-export-components -- hooks and link component belong together */
import { useCallback, useEffect, useLayoutEffect } from "react";
import type { MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { LinkProps } from "react-router-dom";
import { prefersReducedMotion } from "../../settings/motion";
import { isPhone } from "../../settings/useMediaQuery";
import { popDirection, shouldAnimatePop } from "./navDirection";
import type { NavDirection } from "./navDirection";

export type { NavDirection } from "./navDirection";

type VTDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

let running: Promise<void> | null = null;

/**
 * Resolves when the navigation View Transition in progress (if any) has finished, or null when
 * none is running — e.g. so the hub can keep its module cards out of the list → hub morph.
 */
export function viewTransitionFinished(): Promise<void> | null {
  return running;
}

/** True when navigations will morph: the View Transitions API exists and motion isn't reduced. */
export function canMorph(): boolean {
  if (typeof document === "undefined") return false;
  return !!(document as VTDocument).startViewTransition && !prefersReducedMotion();
}

/**
 * Runs `update` (a navigation) inside a View Transition with `<html data-vt="kind"
 * data-vt-dir="direction">` set until it finishes. The caller has checked canMorph().
 */
function runTransition(kind: string, direction: NavDirection, update: () => void) {
  const doc = document as VTDocument;
  const root = document.documentElement;
  root.dataset.vt = kind;
  root.dataset.vtDir = direction;
  const vt = doc.startViewTransition!(() => flushSync(update));
  const done: Promise<void> = vt.finished.catch(() => {}).finally(() => {
    // Only the latest transition clears the flags, so one ending can't strip a newer one's.
    if (running !== done) return;
    running = null;
    delete root.dataset.vt;
    delete root.dataset.vtDir;
  });
  running = done;
}

/**
 * Navigate inside a View Transition, so elements sharing a `view-transition-name` on both pages
 * morph between them (brand list card → hub centre card, hub module card → module header) and
 * everything else cross-fades. Same pattern as the theme toggle (settings/theme.tsx). Falls back
 * to a plain navigation without the API or under prefers-reduced-motion.
 *
 * While the transition runs, `<html data-vt="…">` is set — to `kind`, "nav" by default — so the
 * regular `.page-enter` rise animation doesn't fight the morph (base.css / modules.css) and a
 * particular kind of morph can have its own timing (e.g. "pick", the brand list's picked card
 * being set down in the hub: hub.css). `<html data-vt-dir="…">` carries `direction` (forward by
 * default): on phones the pages slide like an app's push / pop, or cross-fade for a tab (modules.css).
 */
export function useTransitionNavigate(): (to: string, kind?: string, direction?: NavDirection) => void {
  const navigate = useNavigate();
  return useCallback(
    (to: string, kind = "nav", direction: NavDirection = "forward") => {
      if (!canMorph()) {
        navigate(to);
        return;
      }
      runTransition(kind, direction, () => navigate(to));
    },
    [navigate],
  );
}

/**
 * A normal <Link> (real href, middle-click/cmd-click still open a tab) that navigates with a View
 * Transition. `direction`: "back" for crumbs and back buttons, "tab" for the phone tab bar.
 */
export function TransitionLink({
  to,
  onClick,
  direction = "forward",
  ...rest
}: LinkProps & { to: string; direction?: NavDirection }) {
  const go = useTransitionNavigate();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(to, "nav", direction);
  };
  return <Link to={to} onClick={handle} {...rest} />;
}

/** React Router's index for the current history entry (it stamps `idx` into history.state). */
function historyIndex(): unknown {
  return (window.history.state as { idx?: unknown } | null)?.idx;
}

let replaying = false;
let lastIdx: unknown = null;

/**
 * Browser back / forward on phones slides too. The popstate is held back (before React Router's
 * own listener sees it), so the old page is still on screen when the View Transition snapshots
 * it; then the same event is re-dispatched inside the transition and the router renders the
 * destination as usual. Direction comes from the history index (popDirection). Desktop, reduced
 * motion and swipes the browser already animated keep the plain, instant behaviour. Mount once (App).
 */
export function usePopTransitions() {
  const { key } = useLocation();
  // The entry we're on now, for the next popstate to compare against.
  useLayoutEffect(() => {
    lastIdx = historyIndex();
  }, [key]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const animate = shouldAnimatePop({
        replaying,
        phone: isPhone(),
        canMorph: canMorph(),
        busy: running !== null,
        uaVisual: !!(e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition,
      });
      if (!animate) return;
      e.stopImmediatePropagation();
      const state = e.state as unknown;
      runTransition("nav", popDirection(lastIdx, historyIndex()), () => {
        replaying = true;
        try {
          window.dispatchEvent(new PopStateEvent("popstate", { state }));
        } finally {
          replaying = false;
        }
      });
    };
    // Capture on window: runs before the router's own (bubble) listener on the same target.
    window.addEventListener("popstate", onPop, true);
    return () => window.removeEventListener("popstate", onPop, true);
  }, []);
}
