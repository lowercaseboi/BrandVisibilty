import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ConnectedAccounts } from "../../components/accounts/ConnectedAccounts";
import { CoverageMatrix } from "../../components/brandinfo/CoverageMatrix";
import { ProfilePanel } from "../../components/brandinfo/ProfilePanel";
import { ModuleShell } from "../../components/module/ModuleShell";
import { QuestionEditor } from "../../components/questions/QuestionEditor";
import { useT } from "../../i18n";
import { useReducedMotion } from "../../settings/motion";
import { useBrandData } from "./BrandContext";

/** Deep-linkable sections (`/details#accounts` …) and the heading that takes focus on arrival. */
const SECTIONS: Record<string, string> = {
  accounts: "bi-accounts-title",
  profile: "bi-profile-title",
  coverage: "bi-coverage-title",
  questions: "bi-questions-title",
};

/**
 * Details: the brand's connected accounts (where campaigns post), the saved profile (view + edit),
 * a question-coverage matrix, and the question set editor. Each section is deep-linkable by hash
 * (`#accounts`, `#profile`, `#coverage`, `#questions`; the old /questions route redirects to
 * `#questions`). Once the module has loaded, the section is scrolled into view and its heading
 * focused, so keyboard and screen-reader users land in the same place.
 */
export function DetailsModule() {
  const t = useT();
  const location = useLocation();
  const reduced = useReducedMotion();
  const { brandKey, status, profile, questions } = useBrandData();

  useEffect(() => {
    const id = location.hash.slice(1);
    if (status !== "ready" || !(id in SECTIONS)) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      document.getElementById(SECTIONS[id])?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [status, location.hash, reduced]);

  return (
    <ModuleShell id="details">
      <section id="accounts" className="card bi-section bi-anchor" aria-labelledby="bi-accounts-title">
        <ConnectedAccounts brandKey={brandKey} />
      </section>

      <section id="profile" className="card bi-section bi-anchor" aria-labelledby="bi-profile-title">
        <div className="module-section-head">
          <div>
            <p className="eyebrow">{t("brandinfo.profile.eyebrow")}</p>
            <h2 id="bi-profile-title" tabIndex={-1}>
              {t("brandinfo.profile.title")}
            </h2>
            <p>{t("brandinfo.profile.sub")}</p>
          </div>
        </div>
        <ProfilePanel />
      </section>

      <section id="coverage" className="card bi-section bi-anchor" aria-labelledby="bi-coverage-title">
        <div className="module-section-head">
          <div>
            <p className="eyebrow">{t("brandinfo.coverage.eyebrow")}</p>
            <h2 id="bi-coverage-title" tabIndex={-1}>
              {t("brandinfo.coverage.title")}
            </h2>
            <p>{t("brandinfo.coverage.sub")}</p>
          </div>
        </div>
        <CoverageMatrix questions={questions?.questions ?? []} cities={profile?.cities ?? []} />
      </section>

      <section id="questions" className="card bi-section bi-anchor bi-questions-section" aria-labelledby="bi-questions-title">
        <div className="module-section-head">
          <div>
            <p className="eyebrow">{t("brandinfo.questions.eyebrow")}</p>
            <h2 id="bi-questions-title" tabIndex={-1}>
              {t("pages.q.title")}
            </h2>
            <p>{t("pages.q.lede")}</p>
          </div>
        </div>
        <QuestionEditor />
      </section>
    </ModuleShell>
  );
}
