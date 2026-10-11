/* oxlint-disable react/only-export-components -- provider, hook and wrappers belong together */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "../components/Toaster";
import { useT } from "../i18n";
import { readFlag, writeFlag } from "./persisted";

// The Analytical view: off by default, so brand owners get the simple view.
// When on, <Details> blocks render the technical panels (CI, admission, gap IDs, per-AI tables).

type DetailsCtx = { showDetails: boolean; setShowDetails(v: boolean): void };

const STORAGE_KEY = "bv.details";

const DetailsContext = createContext<DetailsCtx>({ showDetails: false, setShowDetails: () => {} });

export function DetailsProvider({ children }: { children: ReactNode }) {
  const [showDetails, setState] = useState<boolean>(() => readFlag(STORAGE_KEY, false));

  const setShowDetails = useCallback((v: boolean) => {
    setState(v);
    writeFlag(STORAGE_KEY, v);
  }, []);

  const value = useMemo(() => ({ showDetails, setShowDetails }), [showDetails, setShowDetails]);
  return <DetailsContext.Provider value={value}>{children}</DetailsContext.Provider>;
}

export function useDetails(): DetailsCtx {
  return useContext(DetailsContext);
}

/** Renders its children only while the Analytical view is on. */
export function Details({ children, block = false }: { children: ReactNode; block?: boolean }) {
  const { showDetails } = useDetails();
  if (!showDetails) return null;
  // `block` wraps the content in an element that eases in (fade + small rise) instead of popping.
  return block ? <div className="details-in">{children}</div> : <>{children}</>;
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

/**
 * The switch itself. `header` is a compact icon-only button (the tooltip and accessible name carry the text);
 * `inline` is a full-width-friendly switch with the whole sentence as its label.
 * Both expose role="switch" + aria-checked and the full sentence as the accessible name.
 */
export function DetailsToggle({ variant = "inline" }: { variant?: "header" | "inline" }) {
  const { showDetails, setShowDetails } = useDetails();
  const t = useT();
  const label = t("common.details.label");
  const onClick = () => {
    setShowDetails(!showDetails);
    // The extra panels are often below the fold, so confirm the switch where the user is looking.
    toast(t(showDetails ? "common.details.off" : "common.details.on"));
  };

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
