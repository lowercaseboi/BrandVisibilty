import { Link } from "react-router-dom";
import { Logo } from "../headerControls";
import { useT } from "../../i18n";

/** Landing footer: wordmark, one-line pitch, and a last "Try it out" link. */
export function LandingFooter() {
  const t = useT();
  return (
    <footer className="lp-band-dark lp-footer">
      <div className="lp-container lp-footer-inner">
        <div className="lp-footer-word">
          <Logo />
          <span>BrandVisibility</span>
        </div>
        <p className="lp-footer-tagline">{t("pages.landing.footer.tagline")}</p>
        <Link to="/app" className="lp-footer-cta">
          {t("pages.landing.cta")}
        </Link>
      </div>
    </footer>
  );
}
