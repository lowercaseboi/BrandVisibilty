/* oxlint-disable react/only-export-components -- provider, hook and wrappers belong together */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "../i18n";

// "Show the numbers behind this": off by default, so shop owners get the simple view.
// When on, <Details> blocks render the technical panels (CI, admission, gap IDs, per-AI tables).

type DetailsCtx = { showDetails: boolean; setShowDetails(v: boolean): void };

const STORAGE_KEY = "bv.details";

function readDetails(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const DetailsContext = createContext<DetailsCtx>({ showDetails: false, setShowDetails: () => {} });

export function DetailsProvider({ children }: { children: ReactNode }) {
  const [showDetails, setState] = useState<boolean>(readDetails);

  const setShowDetails = useCallback((v: boolean) => {
    setState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo(() => ({ showDetails, setShowDetails }), [showDetails, setShowDetails]);
  return <DetailsContext.Provider value={value}>{children}</DetailsContext.Provider>;
}

export function useDetails(): DetailsCtx {
  return useContext(DetailsContext);
}

/** Renders its children only while "Show the numbers behind this" is on. */
export function Details({ children }: { children: ReactNode }) {
  const { showDetails } = useDetails();
  return showDetails ? <>{children}</> : null;
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

/**
 * The switch itself. `header` is a compact outlined button (icon + "Numbers", icon only on phones);
 * `inline` is a full-width-friendly switch with the whole sentence as its label.
 * Both expose role="switch" + aria-checked and the full sentence as the accessible name.
 */
export function DetailsToggle({ variant = "inline" }: { variant?: "header" | "inline" }) {
  const { showDetails, setShowDetails } = useDetails();
  const t = useT();
  const label = t("common.details.label");
  const onClick = () => setShowDetails(!showDetails);

  if (variant === "header") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={showDetails}
        aria-label={label}
        title={`${label} — ${t("common.details.hint")}`}
        className="icon-btn details-toggle-header"
        onClick={onClick}
      >
        <ChartIcon />
        <span className="icon-btn-label">{t("common.details.short")}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={showDetails}
      title={t("common.details.hint")}
      className="details-toggle details-toggle-inline"
      onClick={onClick}
    >
      <span className="switch-track" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
