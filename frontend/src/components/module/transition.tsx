/* oxlint-disable react/only-export-components -- hook and link component belong together */
import { useCallback } from "react";
import type { MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import type { LinkProps } from "react-router-dom";
import { prefersReducedMotion } from "../../settings/motion";

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
 * Navigate inside a View Transition, so elements sharing a `view-transition-name` on both pages
 * morph between them (brand list card → hub centre card, hub module card → module header) and
 * everything else cross-fades. Same pattern as the theme toggle (settings/theme.tsx). Falls back
 * to a plain navigation without the API or under prefers-reduced-motion.
 *
 * While the transition runs, `<html data-vt="…">` is set — to `kind`, "nav" by default — so the
 * regular `.page-enter` rise animation doesn't fight the morph (base.css / modules.css) and a
 * particular kind of morph can have its own timing (e.g. "pick", the brand list's picked card
 * being set down in the hub: hub.css).
 */
export function useTransitionNavigate(): (to: string, kind?: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (to: string, kind = "nav") => {
      const doc = document as VTDocument;
      if (!doc.startViewTransition || !canMorph()) {
        navigate(to);
        return;
      }
      const root = document.documentElement;
      root.dataset.vt = kind;
      const vt = doc.startViewTransition(() => flushSync(() => navigate(to)));
      const done = vt.finished.catch(() => {}).finally(() => {
        delete root.dataset.vt;
        if (running === done) running = null;
      });
      running = done;
    },
    [navigate],
  );
}

/** A normal <Link> (real href, middle-click/cmd-click still open a tab) that navigates with a View Transition. */
export function TransitionLink({ to, onClick, ...rest }: LinkProps & { to: string }) {
  const go = useTransitionNavigate();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(to);
  };
  return <Link to={to} onClick={handle} {...rest} />;
}
