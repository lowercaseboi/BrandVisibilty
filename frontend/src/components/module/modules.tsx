/* oxlint-disable react/only-export-components -- the module registry and its icon belong together */
import type { MessageKey } from "../../i18n";

/** The four modules around the brand hub, in hub reading order (TL, TR, BL, BR). */
export type ModuleId = "details" | "analysis" | "gaps" | "recommendations";

export interface ModuleDef {
  id: ModuleId;
  titleKey: MessageKey;
  blurbKey: MessageKey;
}

export const MODULES: ModuleDef[] = [
  { id: "details", titleKey: "hub.module.details.title", blurbKey: "hub.module.details.blurb" },
  { id: "analysis", titleKey: "hub.module.analysis.title", blurbKey: "hub.module.analysis.blurb" },
  { id: "gaps", titleKey: "hub.module.gaps.title", blurbKey: "hub.module.gaps.blurb" },
  { id: "recommendations", titleKey: "hub.module.recommendations.title", blurbKey: "hub.module.recommendations.blurb" },
];

export function moduleDef(id: ModuleId): ModuleDef {
  return MODULES.find((m) => m.id === id)!;
}

/** `/brands/<key>` (the hub) or `/brands/<key>/<module>`. */
export function brandHref(brandKey: string, module?: ModuleId): string {
  const base = `/brands/${encodeURIComponent(brandKey)}`;
  return module ? `${base}/${module}` : base;
}

/** Gaps & evidence deep link: optional run, evidence refs filter and a gap to select. */
export function gapsHref(brandKey: string, opts: { runId?: string; refs?: string[]; gapId?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.runId) q.set("run", opts.runId);
  if (opts.refs?.length) q.set("refs", opts.refs.join(","));
  if (opts.gapId) q.set("gap", opts.gapId);
  const qs = q.toString();
  return brandHref(brandKey, "gaps") + (qs ? `?${qs}` : "");
}

const cssIdent = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Shared view-transition-name: the brand list card, the hub's centre card (and back). */
export function brandVtName(brandKey: string): string {
  return `brand-${cssIdent(brandKey)}`;
}

/** Shared view-transition-name: a hub module card ↔ that module's ModuleShell header. */
export function moduleVtName(id: ModuleId): string {
  return `module-${id}`;
}

/** Line icons in the drafted style (currentColor, 1.6 stroke). */
export function ModuleIcon({ id, size = 20 }: { id: ModuleId; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (id) {
    case "details":
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
          <circle cx="12" cy="9.5" r="2.6" />
          <path d="M7.5 17c.9-2.2 2.5-3.2 4.5-3.2s3.6 1 4.5 3.2" />
        </svg>
      );
    case "analysis":
      return (
        <svg {...common}>
          <path d="M4 20V4" />
          <path d="M4 20h16" />
          <path d="M7 15l3.5-4 3 2.5L19 7" />
          <circle cx="19" cy="7" r="1.2" />
        </svg>
      );
    case "gaps":
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15l5 5" />
          <path d="M8 10.5h5" strokeDasharray="1.5 1.8" />
        </svg>
      );
    case "recommendations":
      return (
        <svg {...common}>
          <rect x="3.5" y="4" width="5" height="16" rx="1" />
          <rect x="9.5" y="4" width="5" height="11" rx="1" />
          <rect x="15.5" y="4" width="5" height="7" rx="1" />
        </svg>
      );
  }
}
