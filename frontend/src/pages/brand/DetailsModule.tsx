import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { CoverageMatrix } from "../../components/brandinfo/CoverageMatrix";
import { ProfilePanel } from "../../components/brandinfo/ProfilePanel";
import { ModuleShell } from "../../components/module/ModuleShell";
import { QuestionEditor } from "../../components/questions/QuestionEditor";
import { useT } from "../../i18n";
import { useBrandData } from "./BrandContext";

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Brand details: the saved profile (view + edit), a question-coverage matrix, and the question
 * set editor. The old standalone /questions route redirects to `#questions` (BrandLayout's
 * LegacyQuestionsRedirect); once the module has finished loading, scroll there so the deep link
 * still lands on the right section.
 */
export function DetailsModule() {
  const t = useT();
  const location = useLocation();
  const { status, profile, questions } = useBrandData();

  useEffect(() => {
    if (status !== "ready" || location.hash !== "#questions") return;
    const el = document.getElementById("questions");
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [status, location.hash]);

  return (
    <ModuleShell id="details">
      <section className="card bi-section" aria-labelledby="bi-profile-title">
        <div className="module-section-head">
          <div>
            <p className="eyebrow">{t("brandinfo.profile.eyebrow")}</p>
            <h2 id="bi-profile-title">{t("brandinfo.profile.title")}</h2>
            <p>{t("brandinfo.profile.sub")}</p>
          </div>
        </div>
        <ProfilePanel />
      </section>

      <section className="card bi-section" aria-labelledby="bi-coverage-title">
        <div className="module-section-head">
          <div>
            <p className="eyebrow">{t("brandinfo.coverage.eyebrow")}</p>
            <h2 id="bi-coverage-title">{t("brandinfo.coverage.title")}</h2>
            <p>{t("brandinfo.coverage.sub")}</p>
          </div>
        </div>
        <CoverageMatrix questions={questions?.questions ?? []} cities={profile?.cities ?? []} />
      </section>

      <section id="questions" className="card bi-section bi-questions-section" aria-labelledby="bi-questions-title">
        <div className="module-section-head">
          <div>
            <p className="eyebrow">{t("brandinfo.questions.eyebrow")}</p>
            <h2 id="bi-questions-title">{t("pages.q.title")}</h2>
            <p>{t("pages.q.lede")}</p>
          </div>
        </div>
        <QuestionEditor />
      </section>
    </ModuleShell>
  );
}
