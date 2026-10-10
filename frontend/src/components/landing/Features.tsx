import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n";
import { Reveal } from "./Reveal";

function iconProps() {
  return {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function EyeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function RangeIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </svg>
  );
}

function BenchmarkIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 21V11M12 21V3M20 21v-7" />
    </svg>
  );
}

function TraceIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M9 18h6M10 22h4M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M16 7h6v6" />
      <path d="M22 7l-8.5 8.5-5-5L2 17" />
    </svg>
  );
}

const CARDS: { icon: ReactNode; title: MessageKey; body: MessageKey }[] = [
  { icon: <EyeIcon />, title: "pages.landing.features.f1.title", body: "pages.landing.features.f1.body" },
  { icon: <CompareIcon />, title: "pages.landing.features.f2.title", body: "pages.landing.features.f2.body" },
  { icon: <RangeIcon />, title: "pages.landing.features.f3.title", body: "pages.landing.features.f3.body" },
  { icon: <BenchmarkIcon />, title: "pages.landing.features.f4.title", body: "pages.landing.features.f4.body" },
  { icon: <TraceIcon />, title: "pages.landing.features.f5.title", body: "pages.landing.features.f5.body" },
  { icon: <TrendIcon />, title: "pages.landing.features.f6.title", body: "pages.landing.features.f6.body" },
];

const matches = (q: string) => typeof window !== "undefined" && !!window.matchMedia?.(q).matches;
/** Wide layout: the detail sits beside the list instead of opening under its title. */
const isWide = () => matches("(min-width: 901px)");
/** Hover only selects there, with a real pointer — never in the accordion, where it would shift rows. */
const hoverSelects = () => matches("(min-width: 901px) and (hover: hover) and (pointer: fine)");

/**
 * "What it does": six features as a quiet index. Wide screens: the titles stay put on the left and
 * the picked feature's text shows beside them (hover, focus or click — nothing moves under the
 * pointer). Narrow screens: the same markup is an accordion, the text opening under its title.
 */
export function Features() {
  const t = useT();
  const uid = useId();
  const [open, setOpen] = useState<number | null>(0);
  // Wide screens always show one feature; only the accordion layout lets the open one close again.
  const toggle = (i: number) => setOpen((cur) => (cur === i && !isWide() ? null : i));
  return (
    <section id="features" className="lp-section">
      <div className="lp-container lp-features">
        <Reveal className="lp-features-head">
          <p className="lp-eyebrow">{t("pages.landing.features.eyebrow")}</p>
          <h2 className="lp-h2">{t("pages.landing.features.title")}</h2>
        </Reveal>
        <Reveal delay={80}>
          <div className="lp-acc">
            {CARDS.map((card, i) => {
              const isOpen = open === i;
              const headId = `${uid}-h${i}`;
              const panelId = `${uid}-p${i}`;
              return (
                <div key={card.title} className={`lp-acc-item${isOpen ? " is-open" : ""}`}>
                  <h3 className="lp-acc-title">
                    <button
                      type="button"
                      id={headId}
                      className="lp-acc-head"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => toggle(i)}
                      onMouseEnter={() => hoverSelects() && setOpen(i)}
                    >
                      <span className="lp-acc-icon">{card.icon}</span>
                      <span className="lp-acc-label">{t(card.title)}</span>
                      <span className="lp-acc-mark" aria-hidden="true" />
                    </button>
                  </h3>
                  <div id={panelId} role="region" aria-labelledby={headId} className="lp-acc-panel">
                    <div className="lp-acc-panel-inner">
                      <p>{t(card.body)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
