/* oxlint-disable react/only-export-components -- provider and hook belong together */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { prefersReducedMotion } from "./motion";

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
  return "dark";
}

function media(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
}

function subscribeSystem(onChange: () => void) {
  const m = media();
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
}

/** The page background as a hex colour: `--bg` is oklch, which theme-color meta tags don't all parse. */
function pageBackground(): string {
  const fallback = "#20201f";
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    const ctx = document.createElement("canvas").getContext("2d");
    if (!bg || !ctx) return fallback;
    ctx.canvas.width = ctx.canvas.height = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return fallback;
  }
}

const systemIsDark = () => media()?.matches ?? false;

const ThemeContext = createContext<ThemeCtx>({
  pref: "dark",
  resolved: "dark",
  setPref: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false);
  const resolved: ResolvedTheme = pref === "system" ? (systemDark ? "dark" : "light") : pref;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved;
    // Phone status bar / browser chrome matches the page behind the (transparent) header.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", pageBackground());
  }, [resolved]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Cross-fade the whole page between themes where the browser supports view transitions.
  const toggle = useCallback(() => {
    const next = resolved === "dark" ? "light" : "dark";
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (doc.startViewTransition && !prefersReducedMotion()) doc.startViewTransition(() => flushSync(() => setPref(next)));
    else setPref(next);
  }, [resolved, setPref]);

  const value = useMemo(() => ({ pref, resolved, setPref, toggle }), [pref, resolved, setPref, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext);
}
