import { Link } from "react-router-dom";
import { Logo, LanguageToggle, ThemeButton } from "../headerControls";
import { useScrolled } from "../../settings/useScrolled";
import { useT } from "../../i18n";

/** Sticky landing nav: wordmark, a pill of section anchors, then theme/language and the CTA. */
export function LandingNav() {
  const t = useT();
  const scrolled = useScrolled();
  return (
    <header className={`lp-nav${scrolled ? " is-scrolled" : ""}`}>
      <div className="lp-nav-inner">
        <a href="#top" className="lp-nav-brand">
          <Logo />
          <span>BrandVisibility</span>
        </a>
        <ul className="lp-nav-links">
          <li>
            <a href="#context">{t("pages.landing.nav.why")}</a>
          </li>
          <li>
            <a href="#how-it-works">{t("pages.landing.nav.workflow")}</a>
          </li>
          <li>
            <a href="#demo">{t("pages.landing.nav.sample")}</a>
          </li>
          <li>
            <a href="#features">{t("pages.landing.nav.features")}</a>
          </li>
        </ul>
        <div className="lp-nav-tools">
          <ThemeButton />
          <LanguageToggle />
          <Link to="/app" className="btn lp-btn-signal lp-btn-nav">
            {t("pages.landing.cta")}
          </Link>
        </div>
      </div>
    </header>
  );
}
