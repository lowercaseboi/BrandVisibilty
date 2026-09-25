/* oxlint-disable react/only-export-components -- provider, hooks and <T> belong together */
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { common as enCommon } from "./en/common";
import { dashboard as enDashboard } from "./en/dashboard";
import { pages as enPages } from "./en/pages";
import { common as hiCommon } from "./hi/common";
import { dashboard as hiDashboard } from "./hi/dashboard";
import { pages as hiPages } from "./hi/pages";
import { common as mrCommon } from "./mr/common";
import { dashboard as mrDashboard } from "./mr/dashboard";
import { pages as mrPages } from "./mr/pages";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Lang = "en" | "hi" | "mr";

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "hi", label: "हिंदी", short: "हि" },
  { code: "mr", label: "मराठी", short: "म" },
];

type NsKeys<NS extends string, D> = `${NS}.${Extract<keyof D, string>}`;

/** Every translatable string, e.g. "common.nav.shops". Built from the English dictionaries. */
export type MessageKey =
  | NsKeys<"common", typeof enCommon>
  | NsKeys<"dashboard", typeof enDashboard>
  | NsKeys<"pages", typeof enPages>;

/** Base of a plural pair: "common.count.questions" when both "..._one" and "..._other" exist. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer B}_one` ? (`${B}_other` extends MessageKey ? B : never) : never;
}[MessageKey];

export type Vars = Record<string, string | number>;

export type TFunction = ((key: MessageKey, vars?: Vars) => string) & {
  /** Plural helper: looks up `${key}_one` when n === 1, else `${key}_other`, and injects {n}. */
  n: (key: PluralKey, n: number, vars?: Vars) => string;
};

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------

type Flat = Record<string, string | undefined>;

function merge(parts: Record<string, Flat>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [ns, dict] of Object.entries(parts)) {
    for (const [k, v] of Object.entries(dict)) if (typeof v === "string") out.set(`${ns}.${k}`, v);
  }
  return out;
}

const DICTS: Record<Lang, Map<string, string>> = {
  en: merge({ common: enCommon, dashboard: enDashboard, pages: enPages }),
  hi: merge({ common: hiCommon, dashboard: hiDashboard, pages: hiPages }),
  mr: merge({ common: mrCommon, dashboard: mrDashboard, pages: mrPages }),
};

const LOCALES: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

const warned = new Set<string>();

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

function lookup(lang: Lang, key: string): string {
  const hit = DICTS[lang].get(key) ?? DICTS.en.get(key);
  if (hit !== undefined) return hit;
  if (import.meta.env.DEV && !warned.has(key)) {
    warned.add(key);
    console.warn(`[i18n] missing English string for "${key}"`);
  }
  return key;
}

const T_CACHE = new Map<Lang, TFunction>();

function getT(lang: Lang): TFunction {
  const cached = T_CACHE.get(lang);
  if (cached) return cached;
  const t = ((key: MessageKey, vars?: Vars) => interpolate(lookup(lang, key), vars)) as TFunction;
  t.n = (key, n, vars) => interpolate(lookup(lang, `${key}_${n === 1 ? "one" : "other"}`), { ...vars, n });
  T_CACHE.set(lang, t);
  return t;
}

// ---------------------------------------------------------------------------
// Provider + hooks
// ---------------------------------------------------------------------------

const STORAGE_KEY = "bv.lang";

function isLang(v: unknown): v is Lang {
  return v === "en" || v === "hi" || v === "mr";
}

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isLang(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return "en";
}

type LangCtx = { lang: Lang; setLang(l: Lang): void };

const LanguageContext = createContext<LangCtx>({ lang: "en", setLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LangCtx {
  return useContext(LanguageContext);
}

/** Translate: `t("common.nav.shops")`, `t("pages.x", { name })`, `t.n("common.count.questions", 17)`. */
export function useT(): TFunction {
  return getT(useLang().lang);
}

/** Renders a translated string; `**bold**` segments become <strong>. Never injects HTML. */
export function T({ k, vars }: { k: MessageKey; vars?: Vars }) {
  const parts = useT()(k, vars).split("**");
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Formatting (Western digits in every language)
// ---------------------------------------------------------------------------

export type Formatter = {
  /** 1234.5 -> "1,234.5"; `digits` fixes the number of decimals. */
  number(n: number, digits?: number): string;
  /** 0.42 -> "42%". */
  percent(x: number, digits?: number): string;
  /** ISO timestamp -> "2 days ago" / "2 दिन पहले". Empty string for invalid input. */
  relativeTime(iso: string): string;
  /** ISO timestamp -> "25 Sept 2026". Empty string for invalid input. */
  date(iso: string): string;
};

const RT_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

function makeFormatter(lang: Lang): Formatter {
  const locale = `${LOCALES[lang]}-u-nu-latn`;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const dtf = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  return {
    number(n, digits) {
      const opts: Intl.NumberFormatOptions =
        digits === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits };
      return new Intl.NumberFormat(locale, opts).format(n);
    },
    percent(x, digits = 0) {
      return new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(x);
    },
    relativeTime(iso) {
      const at = new Date(iso).getTime();
      if (Number.isNaN(at)) return "";
      const diff = (at - Date.now()) / 1000;
      for (const [unit, secs] of RT_UNITS) {
        if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
      }
      return rtf.format(0, "second");
    },
    date(iso) {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? "" : dtf.format(d);
    },
  };
}

const FMT_CACHE = new Map<Lang, Formatter>();

export function useFormat(): Formatter {
  const { lang } = useLang();
  let f = FMT_CACHE.get(lang);
  if (!f) {
    f = makeFormatter(lang);
    FMT_CACHE.set(lang, f);
  }
  return f;
}
