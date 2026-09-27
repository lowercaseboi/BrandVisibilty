import { Link } from "react-router-dom";
import { Logo } from "../headerControls";
import { useT } from "../../i18n";

/** Landing footer: wordmark, a few anchor links, and a last "Try it out" link. */
export function LandingFooter() {
  const t = useT();
  return (
    <footer className="lp-band-dark lp-footer">
      <div className="lp-container lp-footer-inner">
        <div className="lp-footer-brand">
          <div className="lp-footer-word">
            <Logo />
            <span>BrandVisibility</span>
          </div>
          <p className="lp-footer-tagline">{t("common.app.tagline")}</p>
        </div>
        <nav className="lp-footer-links">
          <a href="#context">{t("pages.landing.nav.why")}</a>
          <a href="#how-it-works">{t("pages.landing.nav.workflow")}</a>
          <a href="#demo">{t("pages.landing.nav.sample")}</a>
          <a href="#features">{t("pages.landing.nav.features")}</a>
        </nav>
        <Link to="/app" className="lp-footer-cta">
          {t("pages.landing.cta")}
        </Link>
      </div>
    </footer>
  );
}
