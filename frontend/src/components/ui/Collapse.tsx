import type { ReactNode } from "react";

/**
 * Animated show/hide (grid rows 0fr→1fr, so height needn't be known). Closed content is also
 * `visibility: hidden` once the collapse finishes, so it leaves the tab order and the accessibility
 * tree — unlike a bare `overflow: hidden` collapse. The one disclosure primitive for the whole
 * product: pair it with a button carrying `aria-expanded` / `aria-controls={id}`.
 */
export function Collapse({
  open,
  id,
  className = "",
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className={`collapse${className ? ` ${className}` : ""}`} data-open={open}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}
