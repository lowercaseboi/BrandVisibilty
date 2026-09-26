import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getT, LANGS, useLang, useT } from "../i18n";
import { DetailsToggle, useDetails } from "../settings/details";
import { useTheme } from "../settings/theme";
import { toast } from "./Toaster";

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="bv-logo-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a45" />
          <stop offset="1" stopColor="#c2360f" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#bv-logo-fill)" />
      <path d="M8 22 L13 15 L18 18 L24 9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="9" r="2.4" fill="#fff" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function ThemeButton() {
  const { resolved, toggle } = useTheme();
  const t = useT();
  const action = resolved === "dark" ? t("common.theme.toLight") : t("common.theme.toDark");
  const current = t("common.theme.current", { theme: t(resolved === "dark" ? "common.theme.dark" : "common.theme.light") });
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={action} title={`${current} — ${action}`}>
      <span className="icon-swap" key={resolved}>
        {resolved === "dark" ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

/** One click moves to the next language (EN → हिंदी → मराठी → EN) and confirms it in that language. */
function LanguageToggle() {
  const { lang, setLang } = useLang();
  const t = useT();
  const i = Math.max(0, LANGS.findIndex((l) => l.code === lang));
  const current = LANGS[i];
  const next = LANGS[(i + 1) % LANGS.length];
  const label = t("common.lang.button", { lang: current.label, next: next.label });

  const onClick = () => {
    setLang(next.code);
    toast(getT(next.code)("common.lang.changed", { lang: next.label }));
  };

  return (
    <button type="button" className="icon-btn" onClick={onClick} aria-label={label} title={label}>
      <span className="icon-swap" key={lang}>
        <GlobeIcon />
      </span>
    </button>
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
  const to = onConnections ? from || "/" : "/providers";
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

/** True once the page is scrolled, so the header can frost only when content passes under it. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

export function AppHeader() {
  const t = useT();
  const scrolled = useScrolled();
  const { showDetails } = useDetails();
  return (
    <header className={`app-header${scrolled ? " is-scrolled" : ""}${showDetails ? " is-analyst" : ""}`}>
      <div className="app-header-inner">
        <Link to="/" className="brand-mark" aria-label={t("common.app.home")}>
          <Logo />
          <span className="brand-mark-text">
            <span className="brand-mark-name">{t("common.app.name")}</span>
            <span className="brand-mark-sub">{t("common.app.tagline")}</span>
          </span>
        </Link>
        <div className="header-tools">
          {/* Numbers view is a distinct mode: say so while it's on. */}
          {showDetails && <span className="analyst-tag eyebrow">{t("common.details.analyst")}</span>}
          <ThemeButton />
          <LanguageToggle />
          <DetailsToggle variant="header" />
          <ConnectionsToggle />
        </div>
      </div>
    </header>
  );
}
