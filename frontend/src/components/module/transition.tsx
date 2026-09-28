/* oxlint-disable react/only-export-components -- hook and link component belong together */
import { useCallback } from "react";
import type { MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import type { LinkProps } from "react-router-dom";

type VTDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/**
 * Navigate inside a View Transition, so elements sharing a `view-transition-name` on both pages
 * morph between them (brand list card → hub centre card, hub module card → module header) and
 * everything else cross-fades. Same pattern as the theme toggle (settings/theme.tsx). Falls back
 * to a plain navigation without the API or under prefers-reduced-motion.
 *
 * While the transition runs, `<html data-vt>` is set so the regular `.page-enter` rise animation
 * doesn't fight the morph (base.css / modules.css).
 */
export function useTransitionNavigate(): (to: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (to: string) => {
      const doc = document as VTDocument;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!doc.startViewTransition || reduce) {
        navigate(to);
        return;
      }
      const root = document.documentElement;
      root.dataset.vt = "nav";
      const vt = doc.startViewTransition(() => flushSync(() => navigate(to)));
      vt.finished.finally(() => {
        delete root.dataset.vt;
      });
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
