import { useId } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { useFormat, useT } from "../../i18n";
import { ModuleIcon, brandHref, moduleVtName } from "../module/modules";
import type { ModuleDef } from "../module/modules";
import { TiltCard } from "../module/tilt";
import { TransitionLink } from "../module/transition";
import { CORNER_OF } from "./wireGeometry";

/**
 * One of the four 3D glass module cards around the hub's centre card: icon, title, blurb and a
 * live preview, the whole card one link into the module. It carries the module's
 * view-transition-name, so opening it grows the card into the module page's header.
 *
 * The outer `.hub-module` box is the grid item the live wires measure (it never transforms); the
 * TiltCard inside does the entrance (emerging from the centre card) and the lean toward the cursor.
 *
 * `named` drops the view-transition-name while the list → hub morph is still running: as a named
 * element the card would be a separate snapshot clipped to its own box, so it couldn't emerge from
 * the centre card (it sits in the page layer, under the morphing card, instead).
 */
export function ModuleCard({
  def,
  index,
  brandKey,
  onActive,
  cardRef,
  named = true,
  children,
}: {
  def: ModuleDef;
  index: number;
  brandKey: string;
  onActive: (active: boolean) => void;
  cardRef: Ref<HTMLDivElement>;
  named?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const fmt = useFormat();
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const on = () => onActive(true);
  const off = () => onActive(false);

  return (
    <div
      ref={cardRef}
      className={`hub-module hub-module-${CORNER_OF[def.id]}`}
      data-module={def.id}
      style={{ "--i": index, viewTransitionName: named ? moduleVtName(def.id) : "none" } as CSSProperties}
      onPointerEnter={on}
      onPointerLeave={off}
    >
      <TiltCard className="hub-module-tilt" innerClassName="hub-module-glass" maxDeg={9} maxShift={5}>
        <TransitionLink
          to={brandHref(brandKey, def.id)}
          className="hub-module-link"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onFocus={on}
          onBlur={off}
        >
          <span className="hub-module-top">
            <span className="hub-module-icon">
              <ModuleIcon id={def.id} size={22} />
            </span>
            <span className="eyebrow hub-module-index">
              {t("hub.card.index", { n: fmt.number(index + 1).padStart(2, "0") })}
            </span>
            <span className="hub-module-go" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </span>
          <span className="hub-module-titles">
            <span className="hub-module-title" id={titleId} role="heading" aria-level={2}>
              {t(def.titleKey)}
            </span>
            <span className="hub-module-blurb">{t(def.blurbKey)}</span>
          </span>
          <span className="hub-module-preview" id={descId}>
            {children}
          </span>
        </TransitionLink>
      </TiltCard>
    </div>
  );
}
