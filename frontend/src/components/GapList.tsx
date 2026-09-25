import { Link } from "react-router-dom";
import type { Gap } from "../api/types";
import { evidenceHref } from "../format";
import { T, useFormat, useT } from "../i18n";
import { gapFinding, gapNumberPairs, gapScopeText, gapTypeText } from "./dashboard/helpers";

// Gaps are found by deterministic rules (DESIGN §5.1) — no LLM involved. Details view only.
export function GapList({
  gaps,
  brandKey,
  runId,
  entities,
  highlightedGapId,
  labelOf = (id: string) => id,
}: {
  gaps: Gap[];
  brandKey: string;
  runId: string;
  entities?: Record<string, string>;
  highlightedGapId?: string | null;
  labelOf?: (id: string) => string;
}) {
  const t = useT();
  const fmt = useFormat();
  if (gaps.length === 0) {
    return <p className="empty">{t("dashboard.gaps.empty")}</p>;
  }

  return (
    <div className="gap-list">
      {gaps.map((gap, i) => {
        const id = gap.gap_id ?? `idx-${i}`;
        const refs = gap.evidence_refs ?? [];
        const finding = gapFinding(gap, t, fmt, entities, labelOf);
        return (
          <div key={id} id={`gap-${id}`} className={`card gap-item ${highlightedGapId === id ? "is-highlighted" : ""}`}>
            <div className="gap-head">
              <span className={`badge gap-type gap-type-${gap.gap_type}`}>{gapTypeText(gap.gap_type, t)}</span>
              <span className="gap-scope">{gapScopeText(gap, t, entities, labelOf)}</span>
              {gap.is_inferred && <span className="badge badge-warn">{t("dashboard.gaps.inferred")}</span>}
              <code className="gap-id">{id}</code>
            </div>
            <p className="small gap-explainer">
              <T k={finding.key} vars={finding.vars} />
            </p>
            <div className="gap-foot">
              <div className="gap-numbers">
                {gapNumberPairs(gap, t, fmt).map(([label, value]) => (
                  <span key={label} className="kv">
                    <span className="kv-label">{label}</span>
                    <span className="kv-value">{value}</span>
                  </span>
                ))}
              </div>
              {refs.length > 0 && (
                <Link to={evidenceHref(brandKey, runId, refs)} className="link-evidence">
                  {t.n("dashboard.gaps.evidence", refs.length)}
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
