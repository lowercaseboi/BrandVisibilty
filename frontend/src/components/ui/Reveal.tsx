import type { ReactNode } from "react";
import { useReducedMotion } from "../../settings/motion";
import { useReveal } from "./useReveal";

/**
 * Wraps a block so it rises into view once, the first time it scrolls into the viewport. Use it for
 * groups below the fold: above-the-fold content is already animated by `.page-enter`.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** Stagger delay in ms, applied as a CSS transition-delay. */
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const reduced = useReducedMotion(); // the global CSS rule zeroes durations, not transition-delays
  return (
    <div
      ref={ref}
      className={`reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={delay && !reduced ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
