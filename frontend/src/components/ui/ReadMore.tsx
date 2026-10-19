import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cutPoint, highlight } from "../dashboard/answerHighlight";
import type { Mention } from "../../api/types";
import { useT } from "../../i18n";

/** The one expand/collapse button for long text: quiet underlined link, "Show more" / "Show less". */
function ReadMoreButton({ expanded, controls, onClick }: { expanded: boolean; controls: string; onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" className="link-quiet read-more-btn" aria-expanded={expanded} aria-controls={controls} onClick={onClick}>
      {expanded ? t("common.showLess") : t("common.showMore")}
    </button>
  );
}

/**
 * Long text, cut at a sensible place (end of a sentence or word, never inside a highlighted brand
 * mention — `cutPoint`) with the highlights kept. For AI answers. Remount it (a `key`) to reset it.
 */
export function ReadMoreCut({
  text,
  mentions,
  kindLabel,
  className = "",
}: {
  text: string;
  mentions: Mention[];
  kindLabel: (kind: Mention["entity_kind"]) => string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const cut = cutPoint(text, mentions);
  const truncated = cut < text.length;
  return (
    <>
      <div id={id} className={className}>
        {highlight(text, mentions, expanded ? text.length : cut, kindLabel)}
        {truncated && !expanded && <span aria-hidden="true">…</span>}
      </div>
      {truncated && <ReadMoreButton expanded={expanded} controls={id} onClick={() => setExpanded((v) => !v)} />}
    </>
  );
}

/**
 * Anything that may run long, clamped to `lines` lines; the toggle appears only when it really
 * overflows (measured, and re-measured on resize), so short content never shows a dead button.
 */
export function ReadMore({ lines = 5, className = "", children }: { lines?: number; className?: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const clamped = !expanded;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !clamped) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clamped, children]);
  return (
    <>
      <div
        ref={ref}
        id={id}
        className={`read-more${clamped ? " is-clamped" : ""}${className ? ` ${className}` : ""}`}
        style={{ "--read-more-lines": lines } as React.CSSProperties}
      >
        {children}
      </div>
      {(expanded || overflows) && <ReadMoreButton expanded={expanded} controls={id} onClick={() => setExpanded((v) => !v)} />}
    </>
  );
}
