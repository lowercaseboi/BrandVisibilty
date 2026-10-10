import { Link } from "react-router-dom";
import { useT } from "../../i18n";
import { Reveal } from "./Reveal";

/**
 * Hero: the pitch and two CTAs on the left, the illustrative "AI assistant" answer beside them (under
 * them on narrow screens). The answer plays its typing sequence once it scrolls into view
 * (landing.css starts the animations from `.is-visible`).
 */
export function Hero() {
  const t = useT();
  return (
    <section id="top" className="lp-section lp-hero">
      <div className="lp-container lp-hero-grid">
        <Reveal className="lp-hero-copy">
          <p className="lp-eyebrow">{t("pages.landing.hero.eyebrow")}</p>
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
            <a href="#how-it-works" className="lp-link-quiet">
              {t("pages.landing.hero.workflowCta")} <span aria-hidden="true">↓</span>
            </a>
          </div>
        </Reveal>
        <Reveal className="lp-hero-example">
          <div className="lp-hero-card">
            <p className="lp-hero-card-label">{t("pages.landing.hero.cardLabel")}</p>
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
