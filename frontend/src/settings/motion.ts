import { useSyncExternalStore } from "react";

// The single source of truth for "does the user prefer reduced motion?". Components must use this
// hook (or prefersReducedMotion() outside React) instead of calling matchMedia themselves: it
// subscribes to changes, so toggling the OS setting while the page is open takes effect at once.
const QUERY = "(prefers-reduced-motion: reduce)";

function media(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
}

/** Non-React read (event handlers, animation setup). Always current — no caching. */
export function prefersReducedMotion(): boolean {
  return media()?.matches ?? false;
}

function subscribe(onChange: () => void): () => void {
  const m = media();
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
}

/** true when the user asks for reduced motion; re-renders when the preference changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
