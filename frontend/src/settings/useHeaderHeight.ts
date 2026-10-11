import { useLayoutEffect } from "react";
import type { RefObject } from "react";

/**
 * Publishes the sticky header's real height as `--header-h` on <html>. The CSS default (base.css)
 * assumes a one-line header, but a wrapped slogan, a bigger scale or a safe-area inset make it
 * taller — and everything that sticks or snaps under the header (pinned sections, sticky lists,
 * anchor offsets) should use the real number. Called by AppHeader, so it follows whichever header
 * is mounted.
 */
export function useHeaderHeight(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty("--header-h", `${header.getBoundingClientRect().height}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--header-h");
    };
  }, [ref]);
}
