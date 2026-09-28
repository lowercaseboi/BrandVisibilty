import { Link, useLocation } from "react-router-dom";
import { useT } from "../i18n";
import { DetailsToggle, useDetails } from "../settings/details";
import { useScrolled } from "../settings/useScrolled";
import { LanguageToggle, Logo, ThemeButton } from "./headerControls";

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

/**
 * Round Connections button. It toggles: from any page it opens Connections; on Connections it
 * returns to the page you came from (carried in the link's state), or home.
 */
function ConnectionsToggle() {
  const t = useT();
  const location = useLocation();
  const onConnections = location.pathname === "/providers";
  const from = (location.state as { from?: string } | null)?.from;
  const to = onConnections ? from || "/app" : "/providers";
  const label = onConnections ? t("common.nav.providersClose") : t("common.nav.providers");
  return (
    <Link
      to={to}
      state={onConnections ? undefined : { from: location.pathname + location.search + location.hash }}
      className={`icon-btn icon-btn-round${onConnections ? " active" : ""}`}
      aria-label={label}
      aria-current={onConnections ? "page" : undefined}
      title={label}
    >
      <GearIcon />
    </Link>
  );
}

/**
 * The one header for the whole product. `app`: logo → landing, then all tools. `landing`: the same
 * logo and slogan, the section anchors, theme + language only, and a "Try it out" CTA. On the landing it always
 * sits on the dark band; in the app it turns into a navy bar in light theme.
 */
export function AppHeader({ variant = "app" }: { variant?: "app" | "landing" }) {
  const t = useT();
  const scrolled = useScrolled();
  const { showDetails } = useDetails();
  const landing = variant === "landing";
  const cls = [
    "app-header",
    landing ? "app-header-landing on-band" : "app-header-app on-band-light",
    scrolled ? "is-scrolled" : "",
    !landing && showDetails ? "is-analyst" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    // Its own view-transition-name keeps the header still while brand pages morph beneath it
    // (otherwise it cross-fades with the rest of the page).
    <header className={cls} style={landing ? undefined : { viewTransitionName: "app-header" }}>
      <div className="app-header-inner">
        <Link to={landing ? "/app" : "/"} className="brand-mark" aria-label={landing ? t("common.nav.app") : t("common.app.home")}>
          <Logo />
          <span className="brand-mark-text">
            <span className="brand-mark-name">{t("common.app.name")}</span>
            <span className="brand-mark-sub">{t("common.app.tagline")}</span>
          </span>
        </Link>
        {landing && (
          <ul className="header-links">
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
        )}
        <div className="header-tools">
          {/* Numbers view is a distinct mode: say so while it's on. */}
          {!landing && showDetails && <span className="analyst-tag eyebrow">{t("common.details.analyst")}</span>}
          <ThemeButton />
          <LanguageToggle />
          {/* The landing keeps only theme + language; numbers and connections belong to the app. */}
          {!landing && <DetailsToggle variant="header" />}
          {!landing && <ConnectionsToggle />}
          {landing && (
            <Link to="/app" className="btn btn-primary header-cta">
              {t("pages.landing.cta")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
