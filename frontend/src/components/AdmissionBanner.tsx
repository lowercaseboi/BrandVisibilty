import type { SnapshotAdmission } from "../api/types";

// PRD §444: failed/partial/queued/running/completed states must be shown
// clearly, not hidden behind a green checkmark.
export function AdmissionBanner({ admission }: { admission: SnapshotAdmission }) {
  const variant = admission.admissible ? "admission-ok" : "admission-warn";

  return (
    <div className={`admission-banner ${variant}`}>
      <div className="admission-headline">
        <strong>{admission.status}</strong>
        <span>
          query coverage {(admission.query_coverage * 100).toFixed(0)}% · sample
          completeness {(admission.sample_completeness * 100).toFixed(0)}%
        </span>
      </div>
      {admission.reasons.length > 0 && (
        <ul className="admission-reasons">
          {admission.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {admission.missing_providers.length > 0 && (
        <p className="admission-missing">
          Missing providers: {admission.missing_providers.join(", ")}
        </p>
      )}
    </div>
  );
}
