import { useT } from "../../i18n";
import { Reveal } from "../ui/Reveal";

/** "Why this matters": before / now / the gap, as three quiet rows — a small label, one large sentence. */
export function WhyItMatters() {
  const t = useT();
  const rows = [
    { tag: t("pages.landing.context.before.tag"), body: t("pages.landing.context.before.body") },
    { tag: t("pages.landing.context.now.tag"), body: t("pages.landing.context.now.body") },
    { tag: t("pages.landing.context.gap.tag"), body: t("pages.landing.context.gap.body") },
  ];
  return (
    <section id="context" className="lp-section">
      <div className="lp-container">
        <Reveal>
          <p className="eyebrow">{t("pages.landing.context.eyebrow")}</p>
          <h2 className="h-display">{t("pages.landing.context.title")}</h2>
        </Reveal>
        <div className="lp-context-list">
          {rows.map((row, i) => (
            <Reveal key={row.tag} delay={i * 90} className="lp-context-row">
              <p className="lp-context-tag">{row.tag}</p>
              <p className="lp-context-body">{row.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
