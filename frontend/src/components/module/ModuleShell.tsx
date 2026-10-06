import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { useBrandData } from "../../pages/brand/BrandContext";
import { MODULES, ModuleIcon, brandHref, moduleDef, moduleVtName } from "./modules";
import type { ModuleId } from "./modules";
import { TransitionLink } from "./transition";

/**
 * The "← Brand hub" / "← All brands" crumb above a page. On phones (components.css `.crumbs`) it
 * becomes a 44px back button with a chevron: `iconOnly` shows just the chevron (the label stays
 * the accessible name), otherwise chevron + label. Navigates with the "back" slide.
 */
export function BackLink({
  to,
  label,
  iconOnly = false,
  className = "",
}: {
  to: string;
  label: string;
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <p className={`crumbs${iconOnly ? " crumbs-icon-only" : ""}${className ? ` ${className}` : ""}`}>
      <TransitionLink to={to} direction="back" className="crumbs-back">
        <svg className="crumbs-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        <span className="crumbs-arrow" aria-hidden="true">
          ←
        </span>{" "}
        <span className="crumbs-label">{label}</span>
      </TransitionLink>
    </p>
  );
}

/**
 * The frame every brand module renders in, so all four look and behave the same: a band header
 * (back to the hub, brand eyebrow, module icon + title + blurb, optional actions), a module
 * switcher to hop between modules without going back through the hub, then the module body.
 * On phones (modules.css) the header packs into one row behind a back button, and the switcher
 * and blurb give way to the bottom tab bar (MobileTabBar).
 *
 * The header carries `view-transition-name: module-<id>`, matching the hub's module card, so
 * opening a module grows the card into this header.
 */
export function ModuleShell({ id, actions, children }: { id: ModuleId; actions?: ReactNode; children: ReactNode }) {
  const t = useT();
  const { brandKey, brandName, status, error } = useBrandData();
  const def = moduleDef(id);

  return (
    <div className="module" data-module={id}>
      <div className="on-band-light dash-band module-band">
        <BackLink to={brandHref(brandKey)} label={t("hub.back.hub")} iconOnly />
        <div className="page-head module-head" style={{ viewTransitionName: moduleVtName(id) }}>
          <span className="module-icon">
            <ModuleIcon id={id} size={26} />
          </span>
          <div className="module-titles">
            <p className="eyebrow module-eyebrow">{brandName}</p>
            <h1>{t(def.titleKey)}</h1>
            <p className="module-blurb">{t(def.blurbKey)}</p>
          </div>
          {actions && <div className="page-head-actions">{actions}</div>}
        </div>
        <nav className="module-switcher" aria-label={t("hub.switcher.label")}>
          {MODULES.map((m) => (
            <TransitionLink
              key={m.id}
              to={brandHref(brandKey, m.id)}
              direction="tab"
              className={`module-chip${m.id === id ? " is-active" : ""}`}
              aria-current={m.id === id ? "page" : undefined}
            >
              <ModuleIcon id={m.id} size={15} />
              <span>{t(m.titleKey)}</span>
            </TransitionLink>
          ))}
        </nav>
      </div>

      {status === "error" && (
        <div className="alert alert-error" role="alert">
          {t("hub.error.load")} <span className="small">{error}</span>
        </div>
      )}
      {status === "loading" && <p className="status">{t("hub.loading")}</p>}
      {status === "ready" && <div className="module-body">{children}</div>}
    </div>
  );
}
