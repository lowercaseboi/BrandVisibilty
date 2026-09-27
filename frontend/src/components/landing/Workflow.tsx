import { useEffect, useRef, useState } from "react";
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
 * scrolls past — each number lights up amber once the rail reaches it. Progress is tracked with a
 * rAF-throttled scroll listener and written to a CSS var; under reduced motion the rail is simply
 * shown fully drawn.
 */
export function Workflow() {
  const t = useT();
  const listRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const numRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const reduced = prefersReducedMotion();
  const [lit, setLit] = useState<boolean[]>(() => STEPS.map(() => reduced));

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
      const total = rect.height + vh * 0.5;
      const scrolled = vh * 0.75 - rect.top;
      const progress = Math.min(1, Math.max(0, total > 0 ? scrolled / total : 0));
      rail.style.setProperty("--lp-rail-progress", String(progress));
      const railHeight = rail.offsetHeight;
      const fillPx = progress * railHeight;
      setLit((prev) => {
        const next = numRefs.current.map((el) =>
          el ? el.offsetTop - rail.offsetTop + el.offsetHeight / 2 <= fillPx : false,
        );
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
            <Reveal key={step.title} delay={i * 60} className="lp-workflow-item">
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
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
