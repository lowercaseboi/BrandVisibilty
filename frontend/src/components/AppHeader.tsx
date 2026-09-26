import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, NavLink } from "react-router-dom";
import { LANGS, useLang, useT } from "../i18n";
import type { Lang } from "../i18n";
import { DetailsToggle } from "../settings/details";
import { useTheme } from "../settings/theme";

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

const menuItems = (menu: HTMLElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);

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

function LanguageMenu() {
  const { lang, setLang } = useLang();
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  useEffect(() => {
    if (!open) return;
    const idx = LANGS.findIndex((l) => l.code === lang);
    menuItems(menuRef.current)[Math.max(0, idx)]?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, lang]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const choose = (code: Lang) => {
    setLang(code);
    close(true);
  };

  const onMenuKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    const list = menuItems(menuRef.current);
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (n: number) => list[(n + list.length) % list.length]?.focus();
    if (e.key === "ArrowDown") focusAt(i + 1);
    else if (e.key === "ArrowUp") focusAt(i - 1);
    else if (e.key === "Home") focusAt(0);
    else if (e.key === "End") focusAt(list.length - 1);
    else if (e.key === "Escape") {
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
      return;
    } else return;
    e.preventDefault();
  };

  const onButtonKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const label = t("common.lang.button", { lang: current.label });

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
      >
        <GlobeIcon />
      </button>
      {open && (
        <ul className="menu" role="menu" aria-label={t("common.lang.label")} ref={menuRef} onKeyDown={onMenuKey}>
          {LANGS.map((l) => (
            <li role="none" key={l.code}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={l.code === lang}
                lang={l.code}
                className="menu-item"
                tabIndex={-1}
                onClick={() => choose(l.code)}
              >
                <span>{l.label}</span>
                <span className="menu-item-check" aria-hidden="true">
                  ✓
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AppHeader() {
  const t = useT();
  const connections = t("common.nav.providers");
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="brand-mark" aria-label={t("common.app.home")}>
          <Logo />
          <span className="brand-mark-name">{t("common.app.name")}</span>
        </Link>
        <div className="header-tools">
          <ThemeButton />
          <LanguageMenu />
          <DetailsToggle variant="header" />
          <NavLink to="/providers" className="icon-btn icon-btn-round" aria-label={connections} title={connections}>
            <GearIcon />
          </NavLink>
        </div>
      </div>
    </header>
  );
}
