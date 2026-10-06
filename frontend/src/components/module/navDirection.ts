// Which way a page navigation slides on phones (transition.tsx sets it as `<html data-vt-dir>`,
// modules.css animates it). Pure, so the rules are unit-tested without a browser.

/**
 * `forward`: drilling in (the new page slides in from the right). `back`: returning (the page
 * slides back out to the right). `tab`: a sideways hop between sibling pages (a quick cross-fade).
 */
export type NavDirection = "forward" | "back" | "tab";

/**
 * A browser back/forward (popstate): which way did it go? React Router stamps every history entry
 * with an increasing `idx`, so a higher index than the page we were on is the forward button;
 * anything else — lower, or unknown (an entry from before the app loaded) — reads as back.
 */
export function popDirection(prevIdx: unknown, nextIdx: unknown): NavDirection {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  return ok(prevIdx) && ok(nextIdx) && nextIdx > prevIdx ? "forward" : "back";
}

export interface PopContext {
  /** This popstate is the one we re-dispatched ourselves inside the transition: let it through. */
  replaying: boolean;
  /** Phone-width viewport: the only place browser back/forward slides (desktop stays instant). */
  phone: boolean;
  /** View Transitions exist and motion isn't reduced (transition.tsx canMorph). */
  canMorph: boolean;
  /** A navigation transition is already running. */
  busy: boolean;
  /** The browser already animated it itself (e.g. Safari's edge-swipe back): don't play it twice. */
  uaVisual: boolean;
}

/** Should this browser back/forward be held back and replayed inside a sliding View Transition? */
export function shouldAnimatePop({ replaying, phone, canMorph, busy, uaVisual }: PopContext): boolean {
  return !replaying && phone && canMorph && !busy && !uaVisual;
}
