import type { SnapshotAdmission } from "../api/types";
import { humanize, pct } from "../format";

// PRD §444: failed/partial/queued/running/completed states must be shown
// clearly, not hidden behind a green checkmark.
export function AdmissionBanner({
  admission,
  runStatus,
}: {
  admission?: Partial<SnapshotAdmission>;
  runStatus?: string;
}) {
  if (!admission) return null;
  const admissible = admission.admissible ?? false;
  const reasons = admission.reasons ?? [];
  const missingProviders = admission.missing_providers ?? [];
  const missingQueries = admission.missing_query_ids ?? [];

  return (
    <div className={`alert ${admissible ? "alert-ok" : "alert-warn"} admission-banner`}>
      <div className="admission-headline">
        <span>
          <strong>{admissible ? "✓ Admissible snapshot" : "⚠ Not admissible for trend claims"}</strong>
          {admission.status && <span className="muted"> · {humanize(admission.status)}</span>}
          {runStatus === "partial" && <span className="badge badge-job-partial badge-inline">partial run</span>}
        </span>
        <span className="small">
          Query coverage {pct(admission.query_coverage, 0)} · Sample completeness{" "}
          {pct(admission.sample_completeness, 0)}
          {admission.policy_version && <span className="muted"> · policy {admission.policy_version}</span>}
        </span>
      </div>
      {reasons.length > 0 && (
        <ul className="admission-reasons">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {missingProviders.length > 0 && (
        <p className="admission-missing">Missing providers: {missingProviders.join(", ")}</p>
      )}
      {missingQueries.length > 0 && (
        <p className="admission-missing">Missing questions: {missingQueries.length}</p>
      )}
    </div>
  );
}
