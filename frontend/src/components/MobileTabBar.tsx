import { useLayoutEffect } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n";
import { prefersReducedMotion } from "../settings/motion";
import { tabForPath } from "./mobileTabs";
import type { TabId } from "./mobileTabs";
import { MODULES, ModuleIcon, brandHref } from "./module/modules";
import { TransitionLink } from "./module/transition";

/** Short labels where the module's full title is too long for a fifth of a phone screen. */
const TAB_LABEL: Record<TabId, MessageKey> = {
  hub: "hub.tab.hub",
  details: "hub.module.details.title",
  analysis: "hub.module.analysis.title",
  gaps: "hub.tab.gaps",
  recommendations: "hub.tab.board",
};

const TABS: TabId[] = ["hub", ...MODULES.map((m) => m.id)];

/** The hub: a house, in the module icons' line style. */
function HubIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </svg>
  );
}

/**
 * Phones only (tabbar.css hides it above 640px): a brand's hub and its four modules as a bottom
 * tab bar, like a native app. It replaces the module switcher chips and the long way round through
 * the hub. The active tab sits on a pill that slides between tabs; tab hops cross-fade (direction
 * "tab") while the bar itself, with its own view-transition-name, stays put.
 *
 * Portalled to <body>: the page wrapper animates `transform` on entry, which would otherwise turn
 * `position: fixed` into "fixed to the wrapper". While shown it sets `<html data-tabbar>`, so other
 * fixed / bottom things (the footer here, toasts) can leave room for it.
 *
 * Hidden in Campaign Studio, whose sticky action bar owns the bottom of the screen.
 */
export function MobileTabBar({ brandKey }: { brandKey: string }) {
  const t = useT();
  const { pathname } = useLocation();
  const active = tabForPath(pathname);
  const shown = active !== null;

  useLayoutEffect(() => {
    if (!shown) return;
    const root = document.documentElement;
    root.dataset.tabbar = "";
    return () => {
      delete root.dataset.tabbar;
    };
  }, [shown]);

  if (!shown || typeof document === "undefined") return null;

  const toTop = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "instant" : "smooth" });
  };

  return createPortal(
    <nav
      className="tabbar"
      aria-label={t("hub.tabs.label")}
      style={{ "--tabs": TABS.length, "--tab-i": TABS.indexOf(active) } as CSSProperties}
    >
      <span className="tabbar-pill" aria-hidden="true" />
      <ul className="tabbar-list">
        {TABS.map((id) => {
          const current = id === active;
          return (
            <li key={id}>
              <TransitionLink
                to={id === "hub" ? brandHref(brandKey) : brandHref(brandKey, id)}
                direction="tab"
                className="tabbar-link"
                aria-current={current ? "page" : undefined}
                // Re-tapping the tab you're on scrolls it back to the top, as in a native app.
                onClick={current ? toTop : undefined}
              >
                <span className="tabbar-icon">{id === "hub" ? <HubIcon /> : <ModuleIcon id={id} size={22} />}</span>
                <span className="tabbar-label">{t(TAB_LABEL[id])}</span>
              </TransitionLink>
            </li>
          );
        })}
      </ul>
    </nav>,
    document.body,
  );
}
