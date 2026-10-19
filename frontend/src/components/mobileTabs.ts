import type { ModuleId } from "./module/modules";

// The phone tab bar's (MobileTabBar.tsx) reading of the URL. Pure, so it's unit-tested.

/** The hub, or one of the four modules. */
export type TabId = "hub" | ModuleId;

const MODULE_IDS: readonly string[] = ["details", "analysis", "gaps", "recommendations"];

/**
 * Which tab a brand route belongs to, or null when the tab bar shouldn't show: outside a brand,
 * and in Campaign Studio (`recommendations/:campaignId`), whose own sticky action bar owns the
 * bottom of the screen. Unknown sub-paths (legacy redirects) show no active tab either.
 */
export function tabForPath(pathname: string): TabId | null {
  const m = /^\/brands\/[^/]+(?:\/(.*))?$/.exec(pathname.replace(/\/+$/, ""));
  if (!m) return null;
  const rest = (m[1] ?? "").split("/").filter(Boolean);
  if (rest.length === 0) return "hub";
  if (rest.length === 1 && MODULE_IDS.includes(rest[0])) return rest[0] as ModuleId;
  return null;
}
