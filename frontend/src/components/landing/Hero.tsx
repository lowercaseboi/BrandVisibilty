import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../i18n";
import { Reveal } from "./Reveal";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Hero: the pitch, two CTAs, and an illustrative "AI assistant" answer card. */
export function Hero() {
  const t = useT();
  const glowRef = useRef<HTMLDivElement | null>(null);

  // Gentle parallax on the hero glow while it's in view. rAF-throttled; skipped under reduced motion.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const glow = glowRef.current;
    if (!glow) return;
    let raf = 0;
    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = glow.parentElement?.getBoundingClientRect();
      if (rect && rect.bottom < 0) return; // hero scrolled past — stop moving it
      glow.style.transform = `translateY(${window.scrollY * 0.12}px)`;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section id="top" className="lp-band-dark lp-hero">
      <div ref={glowRef} className="lp-hero-glow" aria-hidden="true" />
      <div className="lp-hero-floor" aria-hidden="true" />
      <div className="lp-container lp-hero-grid">
        <Reveal>
          <p className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            {t("pages.landing.hero.eyebrow")}
          </p>
          <h1 className="lp-h1">
            <span className="lp-h1-line lp-h1-line-1">{t("pages.landing.hero.line1")}</span>
            <span className="lp-h1-line lp-h1-line-2">
              <span className="lp-signal">{t("pages.landing.hero.line2")}</span>
            </span>
          </h1>
          <p className="lp-hero-lede">{t("pages.landing.hero.lede")}</p>
          <div className="lp-hero-ctas">
            <Link to="/app" className="btn lp-btn-signal">
              {t("pages.landing.cta")}
            </Link>
            <a href="#how-it-works" className="btn lp-btn-ghost">
              {t("pages.landing.hero.workflowCta")}
            </a>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="lp-hero-card">
            <div className="lp-hero-card-head">
              <span className="lp-hero-dots" aria-hidden="true">
                <i className="lp-dot lp-dot-miss" />
                <i className="lp-dot lp-dot-signal" />
                <i className="lp-dot lp-dot-detected" />
              </span>
              <p className="lp-hero-card-label">{t("pages.landing.hero.cardLabel")}</p>
            </div>
            <p className="lp-hero-prompt">
              <span className="lp-hero-prompt-type">
                <span aria-hidden="true">{"› "}</span>
                {t("pages.landing.hero.prompt")}
              </span>
            </p>
            <p className="lp-hero-answer">{t("pages.landing.hero.answer")}</p>
            <ul className="lp-hero-checks">
              <li>
                <span className="lp-check-icon lp-check-ok" aria-hidden="true">
                  {"✓"}
                </span>
                {t("pages.landing.hero.check1")}
              </li>
              <li>
                <span className="lp-check-icon lp-check-ok" aria-hidden="true">
                  {"✓"}
                </span>
                {t("pages.landing.hero.check2")}
              </li>
              <li>
                <span className="lp-check-icon lp-check-miss" aria-hidden="true">
                  {"✗"}
                </span>
                {t("pages.landing.hero.check3")}
              </li>
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
