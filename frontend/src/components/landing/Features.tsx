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

/** "What it does": six feature cards. */
export function Features() {
  const t = useT();
  return (
    <section id="features" className="lp-band-dark lp-section">
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            {t("pages.landing.features.eyebrow")}
          </p>
          <h2 className="lp-h2 lp-features-title">{t("pages.landing.features.title")}</h2>
        </Reveal>
        <div className="lp-feature-grid">
          {CARDS.map((card, i) => (
            <Reveal key={card.title} delay={(i % 3) * 60}>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">{card.icon}</div>
                <h3>{t(card.title)}</h3>
                <p>{t(card.body)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
