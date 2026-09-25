/* oxlint-disable react/only-export-components -- provider and hook belong together */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeCtx = {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref(p: ThemePref): void;
  toggle(): void;
};

// Keep in sync with the inline script in index.html.
const STORAGE_KEY = "bv.theme";
const QUERY = "(prefers-color-scheme: dark)";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

function media(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
}

function subscribeSystem(onChange: () => void) {
  const m = media();
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
}

const systemIsDark = () => media()?.matches ?? false;

const ThemeContext = createContext<ThemeCtx>({
  pref: "system",
  resolved: "light",
  setPref: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false);
  const resolved: ResolvedTheme = pref === "system" ? (systemDark ? "dark" : "light") : pref;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggle = useCallback(() => setPref(resolved === "dark" ? "light" : "dark"), [resolved, setPref]);

  const value = useMemo(() => ({ pref, resolved, setPref, toggle }), [pref, resolved, setPref, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext);
}
