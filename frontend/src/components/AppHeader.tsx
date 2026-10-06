import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useT } from "../i18n";
import { DetailsToggle, useDetails } from "../settings/details";
import { useTheme } from "../settings/theme";
import { useScrolled } from "../settings/useScrolled";
import { LanguageToggle, Logo, ThemeButton, useLanguageCycle } from "./headerControls";
import { Sheet } from "./Sheet";
import { toast } from "./Toaster";

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/**
 * Where the Connections control leads. It toggles: from any page it opens Connections; on
 * Connections it returns to the page you came from (carried in the link's state), or home.
 */
function useConnectionsLink() {
  const t = useT();
  const location = useLocation();
  const onConnections = location.pathname === "/providers";
  const from = (location.state as { from?: string } | null)?.from;
  return {
    onConnections,
    to: onConnections ? from || "/app" : "/providers",
    state: onConnections ? undefined : { from: location.pathname + location.search + location.hash },
    label: onConnections ? t("common.nav.providersClose") : t("common.nav.providers"),
  };
}

/** Round Connections button (desktop header). */
function ConnectionsToggle() {
  const { onConnections, to, state, label } = useConnectionsLink();
  return (
    <Link
      to={to}
      state={state}
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
 * The phone header's "⋯" sheet: theme, language, numbers view and Connections as full-width rows,
 * each with its label spelled out and its current value on the right. The toggles act in place
 * (the sheet stays open, so you see the value change); Connections navigates, so it closes it.
 */
function SettingsRows({ onNavigate }: { onNavigate: () => void }) {
  const t = useT();
  const { resolved, toggle } = useTheme();
  const lang = useLanguageCycle();
  const { showDetails, setShowDetails } = useDetails();
  const conn = useConnectionsLink();
  const toggleDetails = () => {
    setShowDetails(!showDetails);
    toast(t(showDetails ? "common.details.off" : "common.details.on"));
  };
  return (
    <ul className="sheet-list">
      <li>
        <button type="button" className="sheet-row" onClick={toggle}>
          <span>{t("hub.menu.theme")}</span>
          <span className="sheet-row-value">{t(resolved === "dark" ? "common.theme.dark" : "common.theme.light")}</span>
        </button>
      </li>
      <li>
        <button type="button" className="sheet-row" onClick={lang.cycle} aria-label={lang.label}>
          <span>{t("common.lang.label")}</span>
          <span className="sheet-row-value">{lang.current.label}</span>
        </button>
      </li>
      <li>
        <button type="button" role="switch" aria-checked={showDetails} className="sheet-row" onClick={toggleDetails}>
          <span>{t("common.details.label")}</span>
          <span className="sheet-row-value">{t(showDetails ? "common.on" : "common.off")}</span>
        </button>
      </li>
      <li>
        <Link
          to={conn.to}
          state={conn.state}
          className="sheet-row"
          aria-current={conn.onConnections ? "page" : undefined}
          onClick={onNavigate}
        >
          {conn.label}
        </Link>
      </li>
    </ul>
  );
}

/**
 * The one header for the whole product. `app`: logo → landing, then all tools. `landing`: the same
 * logo and slogan, the section anchors, theme + language only, and a "Try it out" CTA. On the landing it always
 * sits on the dark band; in the app it turns into a navy bar in light theme.
 *
 * On phones (components.css) the app header is just the logo mark and one "⋯" button: the four
 * tools move into a bottom sheet as labelled rows, each showing its current value.
 */
export function AppHeader({ variant = "app" }: { variant?: "app" | "landing" }) {
  const t = useT();
  const scrolled = useScrolled();
  const { showDetails } = useDetails();
  const [menuOpen, setMenuOpen] = useState(false);
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
          {/* Phones swap these for the "⋯" sheet (app header only; the landing keeps them). */}
          <span className="header-tools-full">
            <ThemeButton />
            <LanguageToggle />
            {/* The landing keeps only theme + language; numbers and connections belong to the app. */}
            {!landing && <DetailsToggle variant="header" />}
            {!landing && <ConnectionsToggle />}
          </span>
          {!landing && (
            <button
              type="button"
              className="icon-btn header-more"
              aria-label={t("hub.menu.more")}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <MoreIcon />
            </button>
          )}
          {landing && (
            <Link to="/app" className="btn btn-primary header-cta">
              {t("pages.landing.cta")}
            </Link>
          )}
        </div>
      </div>
      {menuOpen && (
        <Sheet title={t("hub.menu.title")} onClose={() => setMenuOpen(false)}>
          {/* Connections navigates away: drop the sheet at once rather than animate it out. */}
          <SettingsRows onNavigate={() => setMenuOpen(false)} />
        </Sheet>
      )}
    </header>
  );
}
