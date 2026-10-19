/* oxlint-disable react/only-export-components -- the toggles and the hook they share belong together */
import { useId } from "react";
import { getT, LANGS, useLang, useT } from "../i18n";
import { useTheme } from "../settings/theme";
import { toast } from "./Toaster";

// Logo and the theme / language toggles, shared by the app header and the landing nav.

/** Mark: a rising graph on a dark-maroon tile, with a yellow spark where the line peaks. */
export function Logo() {
  const id = useId();
  const fill = `bv-logo-${id}`;
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a0808" />
          <stop offset="1" stopColor="#160303" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${fill})`} />
      <path d="M7 23 L12.5 16 L17.5 19 L22.5 11.5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M24.5 3.6 Q25.4 8.1 29.9 9 Q25.4 9.9 24.5 14.4 Q23.6 9.9 19.1 9 Q23.6 8.1 24.5 3.6 Z"
        fill="#ffd84d"
        stroke="#fff6cf"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
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

export function ThemeButton() {
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

/**
 * The language cycle (EN → हिंदी → मराठी → EN) shared by the header button and the phone settings
 * sheet: the current language, the button's full label, and `cycle`, which moves on and confirms
 * it in the new language.
 */
export function useLanguageCycle() {
  const { lang, setLang } = useLang();
  const t = useT();
  const i = Math.max(0, LANGS.findIndex((l) => l.code === lang));
  const current = LANGS[i];
  const next = LANGS[(i + 1) % LANGS.length];
  const label = t("common.lang.button", { lang: current.label, next: next.label });
  const cycle = () => {
    setLang(next.code);
    toast(getT(next.code)("common.lang.changed", { lang: next.label }));
  };
  return { lang, current, label, cycle };
}

/** One click moves to the next language and confirms it in that language. */
export function LanguageToggle() {
  const { lang, label, cycle } = useLanguageCycle();

  return (
    <button type="button" className="icon-btn" onClick={cycle} aria-label={label} title={label}>
      <span className="icon-swap" key={lang}>
        <GlobeIcon />
      </span>
    </button>
  );
}
