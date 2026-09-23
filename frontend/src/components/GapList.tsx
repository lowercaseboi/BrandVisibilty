import type { Gap } from "../api/types";

function scopeLabel(gap: Gap): string {
  const scope = gap.detail.scope;
  if (scope === "provider") return `Provider: ${gap.detail.provider_id}`;
  if (scope === "intent") return `Intent: ${gap.detail.intent_type}`;
  if (scope === "overall") return "Overall";
  return String(scope ?? "—");
}

function detailCoverage(gap: Gap): number | undefined {
  const coverage = gap.detail.coverage;
  return typeof coverage === "number" ? coverage : undefined;
}

export function GapList({ gaps }: { gaps: Gap[] }) {
  if (gaps.length === 0) {
    return <p className="empty">No gaps detected.</p>;
  }

  return (
    <ul className="gap-list">
      {gaps.map((gap, i) => {
        const coverage = detailCoverage(gap);
        return (
          <li key={i} className="gap-item">
            <span className="gap-type">{gap.gap_type}</span>
            <span className="gap-scope">{scopeLabel(gap)}</span>
            {coverage !== undefined && (
              <span className="gap-coverage">{(coverage * 100).toFixed(1)}% coverage</span>
            )}
            <span className="gap-evidence">{gap.evidence_refs.length} evidence refs</span>
            {gap.is_inferred && <span className="gap-inferred">inferred</span>}
          </li>
        );
      })}
    </ul>
  );
}
