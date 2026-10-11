import { useEffect, useRef, useState } from "react";
import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n";
import { useReducedMotion } from "../../settings/motion";
import { useMediaQuery } from "../../settings/useMediaQuery";
import { Reveal } from "../ui/Reveal";

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: "pages.landing.workflow.step1.title", body: "pages.landing.workflow.step1.body" },
  { title: "pages.landing.workflow.step2.title", body: "pages.landing.workflow.step2.body" },
  { title: "pages.landing.workflow.step3.title", body: "pages.landing.workflow.step3.body" },
  { title: "pages.landing.workflow.step4.title", body: "pages.landing.workflow.step4.body" },
  { title: "pages.landing.workflow.step5.title", body: "pages.landing.workflow.step5.body" },
  { title: "pages.landing.workflow.step6.title", body: "pages.landing.workflow.step6.body" },
];

const LAST = STEPS.length - 1;
const label = (i: number) => String(i + 1).padStart(2, "0");

/** Page offset of the sticky frame's top edge while it is pinned (the sticky header's height). */
function headerHeight(): number {
  const h = document.querySelector(".app-header");
  return h instanceof HTMLElement ? h.getBoundingClientRect().height : 0;
}

/**
 * "Workflow": six steps, one on screen at a time. The section is tall; inside it a frame sticks
 * under the header while you scroll — the section's eyebrow and heading ride along in it — and
 * scroll progress picks the step: an index of 01–06 on the left (with a rail that fills as it
 * advances) and the step's title and text on the right.
 * Index entries are buttons that scroll to their step. All six steps stay in the DOM (inactive
 * ones are only faded), so nothing is hidden from assistive tech.
 *
 * Under reduced motion, or on a viewport too short to pin comfortably, the steps are a plain
 * spaced list instead and nothing is tied to scroll.
 */
export function Workflow() {
  const t = useT();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const short = useMediaQuery("(max-height: 560px)");
  const plain = reduced || short;
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (plain) return;
    let raf = 0;
    let ticking = false;
    const update = () => {
      ticking = false;
      const track = trackRef.current;
      const rail = railRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const pinned = headerHeight();
      // Scroll distance over which the frame stays pinned: the track minus the frame itself.
      const span = rect.height - (window.innerHeight - pinned);
      const progress = span > 0 ? Math.min(1, Math.max(0, (pinned - rect.top) / span)) : 0;
      // The rail reaches index entry i exactly when step i becomes the active one.
      rail?.style.setProperty("--lp-rail-progress", String(Math.min(1, (progress * STEPS.length) / LAST)));
      const next = Math.min(LAST, Math.floor(progress * STEPS.length));
      setActive((prev) => (prev === next ? prev : next));
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
  }, [plain]);

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const pinned = headerHeight();
    const span = track.offsetHeight - (window.innerHeight - pinned);
    const top = track.getBoundingClientRect().top + window.scrollY - pinned + span * ((i + 0.5) / STEPS.length);
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <section id="how-it-works" className="lp-section lp-workflow">
      <div className={`lp-workflow-track${plain ? " is-plain" : ""}`} ref={trackRef}>
        <div className="lp-workflow-frame">
          <div className="lp-container lp-workflow-head">
            <Reveal>
              <p className="eyebrow">{t("pages.landing.workflow.eyebrow")}</p>
              <h2 className="h-display">{t("pages.landing.workflow.title")}</h2>
            </Reveal>
          </div>
          <div className="lp-container lp-workflow-stage">
            <div className="lp-workflow-index">
              <div className="lp-workflow-rail" ref={railRef} aria-hidden="true">
                <div className="lp-workflow-rail-fill" />
              </div>
              {STEPS.map((step, i) => (
                <button
                  key={step.title}
                  type="button"
                  className={`lp-workflow-num${i <= active ? " is-lit" : ""}${i === active ? " is-active" : ""}`}
                  aria-label={t(step.title)}
                  aria-current={i === active ? "step" : undefined}
                  onClick={() => goTo(i)}
                >
                  {label(i)}
                </button>
              ))}
            </div>
            <div className="lp-workflow-steps">
              {STEPS.map((step, i) => (
                <div key={step.title} className={`lp-workflow-step${i === active ? " is-active" : ""}`}>
                  <span className="lp-workflow-step-num" aria-hidden="true">
                    {label(i)}
                  </span>
                  <h3>{t(step.title)}</h3>
                  <p>{t(step.body)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
