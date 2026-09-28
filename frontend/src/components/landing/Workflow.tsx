import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n";
import { Reveal } from "./Reveal";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: "pages.landing.workflow.step1.title", body: "pages.landing.workflow.step1.body" },
  { title: "pages.landing.workflow.step2.title", body: "pages.landing.workflow.step2.body" },
  { title: "pages.landing.workflow.step3.title", body: "pages.landing.workflow.step3.body" },
  { title: "pages.landing.workflow.step4.title", body: "pages.landing.workflow.step4.body" },
  { title: "pages.landing.workflow.step5.title", body: "pages.landing.workflow.step5.body" },
  { title: "pages.landing.workflow.step6.title", body: "pages.landing.workflow.step6.body" },
];

/**
 * "Workflow": six numbered steps, [01]–[06], with a connecting rail that draws in as the section
 * scrolls past — each number lights up amber once the rail reaches it. The same rail-progress
 * threshold also drives each step's own reveal: a step fades/rises in once the rail reaches it,
 * and fades back out if the user scrolls back up past it, so the sequence is fully reversible (not
 * a "reveal once" observer). Progress is tracked with a rAF-throttled scroll listener, computed
 * from each number's real offset within the rail, and written to a CSS var; under reduced motion
 * every step starts (and stays) lit, so the section renders fully in place with no motion.
 */
export function Workflow() {
  const t = useT();
  const listRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const numRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const reduced = prefersReducedMotion();
  const [lit, setLit] = useState<boolean[]>(() => STEPS.map(() => reduced));

  // The rail must stop at the [06] marker's center, not run on past it. Its `top` is fixed by CSS
  // (24px), so the marker's offset from that fixed point is also the rail's total length; written
  // to a CSS var the stylesheet uses in place of a `bottom` offset. Re-measured on resize and via
  // ResizeObserver (covers reflow from a language switch or font load changing step heights), and
  // with useLayoutEffect so the rail never flashes full-length before its first measurement.
  useLayoutEffect(() => {
    const list = listRef.current;
    const rail = railRef.current;
    if (!list || !rail) return;
    const measure = () => {
      const lastEl = numRefs.current[STEPS.length - 1];
      if (!lastEl) return;
      const railTop = rail.getBoundingClientRect().top;
      const lastRect = lastEl.getBoundingClientRect();
      const length = lastRect.top - railTop + lastRect.height / 2;
      rail.style.setProperty("--lp-rail-length", `${Math.max(0, length)}px`);
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(list);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (reduced) {
      railRef.current?.style.setProperty("--lp-rail-progress", "1");
      return;
    }
    let raf = 0;
    let ticking = false;
    const update = () => {
      ticking = false;
      const list = listRef.current;
      const rail = railRef.current;
      if (!list || !rail) return;
      const rect = list.getBoundingClientRect();
      const vh = window.innerHeight;
      // Starts as the list enters (top at 90% of the viewport) and completes once its bottom is at
      // 80%, so every step is lit while the whole section is still on screen.
      const total = rect.height + vh * 0.1;
      const scrolled = vh * 0.9 - rect.top;
      const progress = Math.min(1, Math.max(0, total > 0 ? scrolled / total : 0));
      rail.style.setProperty("--lp-rail-progress", String(progress));
      const railHeight = rail.offsetHeight;
      const railTop = rail.getBoundingClientRect().top;
      const fillPx = progress * railHeight;
      setLit((prev) => {
        // Real element offsets, measured viewport-relative (not offsetTop): each number's own
        // offsetParent is its .lp-workflow-item (position: relative, for the z-index stack above
        // the rail), not the shared list, so offsetTop alone would read ~0 for every step and
        // light them all at once instead of one by one.
        const next = numRefs.current.map((el) => {
          if (!el) return false;
          const elRect = el.getBoundingClientRect();
          return elRect.top - railTop + elRect.height / 2 <= fillPx;
        });
        return prev.some((v, i) => v !== next[i]) ? next : prev;
      });
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <section id="how-it-works" className="lp-band-dark lp-section">
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            {t("pages.landing.workflow.eyebrow")}
          </p>
          <h2 className="lp-h2 lp-workflow-title">{t("pages.landing.workflow.title")}</h2>
        </Reveal>
        <div className="lp-workflow-list" ref={listRef}>
          <div className="lp-workflow-rail" ref={railRef} aria-hidden="true">
            <div className="lp-workflow-rail-fill" />
          </div>
          {STEPS.map((step, i) => (
            // Not <Reveal>: that only ever reveals once (IntersectionObserver). Visibility here
            // is driven directly by `lit`, the same rail-progress threshold used to light the
            // number, so it re-evaluates — and can reverse — on every scroll tick.
            <div key={step.title} className={`lp-workflow-item lp-reveal${lit[i] ? " is-visible" : ""}`}>
              <span
                ref={(el) => {
                  numRefs.current[i] = el;
                }}
                className={`lp-workflow-num${lit[i] ? " is-lit" : ""}`}
              >
                [{String(i + 1).padStart(2, "0")}]
              </span>
              <div className="lp-workflow-body">
                <h3>{t(step.title)}</h3>
                <p>{t(step.body)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
