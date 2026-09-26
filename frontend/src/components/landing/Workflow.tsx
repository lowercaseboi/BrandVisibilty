import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n";
import { Reveal } from "./Reveal";

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: "pages.landing.workflow.step1.title", body: "pages.landing.workflow.step1.body" },
  { title: "pages.landing.workflow.step2.title", body: "pages.landing.workflow.step2.body" },
  { title: "pages.landing.workflow.step3.title", body: "pages.landing.workflow.step3.body" },
  { title: "pages.landing.workflow.step4.title", body: "pages.landing.workflow.step4.body" },
  { title: "pages.landing.workflow.step5.title", body: "pages.landing.workflow.step5.body" },
  { title: "pages.landing.workflow.step6.title", body: "pages.landing.workflow.step6.body" },
];

/** "Workflow": six numbered steps, [01]–[06], with a connecting rail. */
export function Workflow() {
  const t = useT();
  return (
    <section id="how-it-works" className="lp-band-dark lp-section">
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            {t("pages.landing.workflow.eyebrow")}
          </p>
          <h2 className="lp-h2 lp-workflow-title">{t("pages.landing.workflow.title")}</h2>
        </Reveal>
        <div className="lp-workflow-list">
          <div className="lp-workflow-rail" aria-hidden="true" />
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 60} className="lp-workflow-item">
              <span className="lp-workflow-num">[{String(i + 1).padStart(2, "0")}]</span>
              <div className="lp-workflow-body">
                <h3>{t(step.title)}</h3>
                <p>{t(step.body)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
