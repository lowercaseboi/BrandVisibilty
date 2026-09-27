import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "../i18n";

const STORAGE_PREFIX = "bv.open.";

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

function writeOpen(id: string, open: boolean) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, open ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * A page section with a clickable header (title · muted summary · round chevron) whose body
 * collapses/expands with a `grid-template-rows` animation. Open state persists per-`id` in
 * localStorage (`bv.open.<id>`); a first scroll into view plays a light rise-in once.
 */
export function CollapsibleSection({
  id,
  title,
  summary,
  children,
  defaultOpen = false,
  forceOpen,
}: {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState<boolean>(() => readOpen(id, defaultOpen));
  // No IntersectionObserver (very old browsers): treat as already revealed, no animation to wait for.
  const [revealed, setRevealed] = useState<boolean>(() => typeof IntersectionObserver === "undefined");
  const headingId = useId();
  const bodyId = useId();
  const rootRef = useRef<HTMLElement | null>(null);

  // A deep link (e.g. #gap-x) can force this section open regardless of the remembered state.
  // Adjusted during render (React's "adjusting state when a prop changes" pattern) rather than in
  // an effect, since it only needs to react to forceOpen actually flipping to true.
  const [prevForceOpen, setPrevForceOpen] = useState(!!forceOpen);
  if (!!forceOpen !== prevForceOpen) {
    setPrevForceOpen(!!forceOpen);
    if (forceOpen) {
      setOpen(true);
      writeOpen(id, true);
    }
  }

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      writeOpen(id, next);
      return next;
    });
  };

  const titleText = typeof title === "string" ? title : undefined;
  const toggleLabel = titleText
    ? t(open ? "dashboard.collapsible.hideNamed" : "dashboard.collapsible.showNamed", { title: titleText })
    : t(open ? "dashboard.collapsible.hide" : "dashboard.collapsible.show");

  return (
    <section
      ref={rootRef}
      id={id}
      className={`dash-section collapsible${revealed ? " is-revealed" : ""}`}
      aria-labelledby={headingId}
    >
      {/* The whole row is a mouse-click target; the round button is the keyboard/AT-accessible control. */}
      <div className="collapsible-head" onClick={toggle}>
        <h2 id={headingId} className="collapsible-title">
          {title}
        </h2>
        {summary !== undefined && summary !== null && <span className="collapsible-summary muted">{summary}</span>}
        <button
          type="button"
          className="collapsible-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={toggleLabel}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <ChevronIcon />
        </button>
      </div>
      <div className={`collapsible-body-outer${open ? " is-open" : ""}`}>
        <div className="collapsible-body-inner" id={bodyId}>
          {children}
        </div>
      </div>
    </section>
  );
}
