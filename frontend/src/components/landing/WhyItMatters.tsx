import { useT } from "../../i18n";
import { Reveal } from "./Reveal";

/** "Why this matters": before / now / the gap, three short columns. */
export function WhyItMatters() {
  const t = useT();
  const cols = [
    { tag: t("pages.landing.context.before.tag"), body: t("pages.landing.context.before.body") },
    { tag: t("pages.landing.context.now.tag"), body: t("pages.landing.context.now.body") },
    { tag: t("pages.landing.context.gap.tag"), body: t("pages.landing.context.gap.body") },
  ];
  return (
    <section id="context" className="lp-band-light lp-section">
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">{t("pages.landing.context.eyebrow")}</p>
          <h2 className="lp-h2 lp-context-title">{t("pages.landing.context.title")}</h2>
        </Reveal>
        <div className="lp-context-grid">
          {cols.map((col, i) => (
            <Reveal key={col.tag} delay={i * 90}>
              <div className="lp-context-col">
                <p className="lp-context-tag">{col.tag}</p>
                <p>{col.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
