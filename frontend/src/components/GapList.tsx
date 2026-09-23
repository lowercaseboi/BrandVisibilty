import { Link } from "react-router-dom";
import type { Gap } from "../api/types";
import { GAP_TYPE_EXPLAINER, evidenceHref, gapNumbers, gapScope } from "../format";

// Gaps are found by deterministic rules (DESIGN §5.1) — no LLM involved.
export function GapList({
  gaps,
  brandKey,
  runId,
  entities,
  highlightedGapId,
}: {
  gaps: Gap[];
  brandKey: string;
  runId: string;
  entities?: Record<string, string>;
  highlightedGapId?: string | null;
}) {
  if (gaps.length === 0) {
    return <p className="empty">No gaps detected — the brand clears every rule threshold.</p>;
  }

  return (
    <div className="gap-list">
      {gaps.map((gap, i) => {
        const id = gap.gap_id ?? `idx-${i}`;
        const refs = gap.evidence_refs ?? [];
        return (
          <div
            key={id}
            id={`gap-${id}`}
            className={`card gap-item ${highlightedGapId === id ? "is-highlighted" : ""}`}
          >
            <div className="gap-head">
              <span className={`badge gap-type gap-type-${gap.gap_type}`}>{gap.gap_type}</span>
              <span className="gap-scope">{gapScope(gap, entities)}</span>
              {gap.is_inferred && <span className="badge badge-warn">inferred</span>}
              <code className="gap-id">{id}</code>
            </div>
            {GAP_TYPE_EXPLAINER[gap.gap_type] && <p className="muted small gap-explainer">{GAP_TYPE_EXPLAINER[gap.gap_type]}</p>}
            <div className="gap-foot">
              <div className="gap-numbers">
                {gapNumbers(gap).map(([label, value]) => (
                  <span key={label} className="kv">
                    <span className="kv-label">{label}</span>
                    <span className="kv-value">{value}</span>
                  </span>
                ))}
              </div>
              {refs.length > 0 && (
                <Link to={evidenceHref(brandKey, runId, refs)} className="link-evidence">
                  View evidence ({refs.length}) →
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
