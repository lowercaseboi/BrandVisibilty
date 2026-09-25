import type { SnapshotAdmission } from "../api/types";
import { useFormat, useT } from "../i18n";
import { useListFormat } from "./dashboard/helpers";

// PRD §444: failed/partial/queued/running/completed states must be shown
// clearly, not hidden behind a green checkmark. Details view only.
export function AdmissionBanner({
  admission,
  runStatus,
  labelOf = (id: string) => id,
}: {
  admission?: Partial<SnapshotAdmission>;
  runStatus?: string;
  labelOf?: (id: string) => string;
}) {
  const t = useT();
  const fmt = useFormat();
  const list = useListFormat();
  if (!admission) return null;
  const admissible = admission.admissible ?? false;
  const reasons = admission.reasons ?? [];
  const missingProviders = admission.missing_providers ?? [];
  const missingQueries = admission.missing_query_ids ?? [];
  const pct = (x: number | undefined) => (typeof x === "number" ? fmt.percent(x) : "—");

  return (
    <div className={`alert ${admissible ? "alert-ok" : "alert-warn"} admission-banner`}>
      <div className="admission-headline">
        <span>
          <strong>{admissible ? t("dashboard.admission.ok") : t("dashboard.admission.no")}</strong>
          {admission.status && admission.status !== "admissible" && <code className="badge-inline small">{admission.status}</code>}
          {runStatus === "partial" && (
            <span className="badge badge-job-partial badge-inline">{t("dashboard.admission.partial")}</span>
          )}
        </span>
        <span className="small">
          {t("dashboard.admission.stats", {
            q: pct(admission.query_coverage),
            s: pct(admission.sample_completeness),
            policy: admission.policy_version ?? "—",
          })}
        </span>
      </div>
      {reasons.length > 0 && (
        <ul className="admission-reasons" lang="en">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {missingProviders.length > 0 && (
        <p className="admission-missing">
          {t("dashboard.admission.missingAis", { ais: list(missingProviders.map(labelOf)) })}
        </p>
      )}
      {missingQueries.length > 0 && (
        <p className="admission-missing">{t.n("dashboard.admission.missingQuestions", missingQueries.length)}</p>
      )}
    </div>
  );
}
