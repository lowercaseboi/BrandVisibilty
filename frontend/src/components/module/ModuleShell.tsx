import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { useBrandData } from "../../pages/brand/BrandContext";
import { MODULES, ModuleIcon, brandHref, moduleDef, moduleVtName } from "./modules";
import type { ModuleId } from "./modules";
import { TransitionLink } from "./transition";

/**
 * The frame every brand module renders in, so all four look and behave the same: a band header
 * (back to the hub, brand eyebrow, module icon + title + blurb, optional actions), a module
 * switcher to hop between modules without going back through the hub, then the module body.
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
        <p className="crumbs">
          <TransitionLink to={brandHref(brandKey)}>← {t("hub.back.hub")}</TransitionLink>
        </p>
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
