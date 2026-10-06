import { useSyncExternalStore } from "react";

// Width queries must use the standard breakpoints (tokens.css; enforced by
// scripts/check-breakpoints.mjs, which also scans matchMedia strings here).
const PHONE_QUERY = "(max-width: 640px)";

function media(query: string): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
}

/** Non-React read: is the viewport phone-sized right now? */
export function isPhone(): boolean {
  return media(PHONE_QUERY)?.matches ?? false;
}

function subscribePhone(onChange: () => void): () => void {
  const m = media(PHONE_QUERY);
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
}

/**
 * true on phone-width viewports (≤640px); re-renders when the width crosses the breakpoint.
 * Prefer plain CSS for layout — use this only where phones get a different component tree
 * (the Board's swipe lanes, sheets instead of selects).
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, isPhone, () => false);
}
