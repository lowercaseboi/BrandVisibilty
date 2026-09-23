import { Link } from "react-router-dom";
import type { Gap, Recommendation } from "../api/types";
import { evidenceHref, gapScope, humanize, pct } from "../format";

// delta_composite is on the 0–1 composite scale; show percentage points.
function deltaPoints(delta: number | undefined): number {
  const v = delta ?? 0;
  return Math.abs(v) > 1 ? v : v * 100;
}

// PRD AC-7: every recommendation traces to a detected gap and its evidence.
export function RecommendationList({
  recommendations,
  gaps,
  brandKey,
  runId,
  entities,
  onTraceGap,
}: {
  recommendations: Recommendation[];
  gaps: Gap[];
  brandKey: string;
  runId: string;
  entities?: Record<string, string>;
  onTraceGap: (gapId: string) => void;
}) {
  if (recommendations.length === 0) {
    return <p className="empty">No recommendations for this run.</p>;
  }
  const gapById = new Map(gaps.map((g) => [g.gap_id, g]));
  const sorted = [...recommendations].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  return (
    <ol className="rec-list">
      {sorted.map((rec, i) => {
        const gap = gapById.get(rec.gap_id);
        const refs = rec.evidence_refs ?? [];
        const delta = deltaPoints(rec.delta_composite);
        return (
          <li key={rec.recommendation_id ?? i} className="card rec-card">
            <div className="rec-rank">#{i + 1}</div>
            <div className="rec-body">
              <div className="rec-head">
                <h3>{humanize(rec.action)}</h3>
                <span className="badge badge-accent">{humanize(rec.action_class)}</span>
              </div>
              <div className="rec-stats">
                <span className="kv">
                  <span className="kv-label">Expected Δ composite</span>
                  <span className={`kv-value ${delta >= 0 ? "pos" : "neg"}`}>
                    {delta >= 0 ? "+" : ""}
                    {delta.toFixed(1)} pts
                  </span>
                </span>
                <span className="kv">
                  <span className="kv-label">Priority</span>
                  <span className="kv-value">{(rec.priority ?? 0).toFixed(2)}</span>
                </span>
                <span className="kv">
                  <span className="kv-label">Effort</span>
                  <span className="kv-value">
                    {rec.effort ?? "—"}
                  </span>
                </span>
                {typeof rec.confidence === "number" && (
                  <span className="kv">
                    <span className="kv-label">Confidence</span>
                    <span className="kv-value">{pct(rec.confidence, 0)}</span>
                  </span>
                )}
              </div>
              <p className="rec-reasoning">{rec.reasoning}</p>
              <div className="rec-trace">
                <a
                  href={`#gap-${rec.gap_id}`}
                  className="trace-link"
                  onClick={(e) => {
                    e.preventDefault();
                    onTraceGap(rec.gap_id);
                  }}
                >
                  ↳ Traces to gap <code>{rec.gap_id}</code>
                  {gap && (
                    <span className="muted">
                      {" "}
                      ({gap.gap_type} · {gapScope(gap, entities)})
                    </span>
                  )}
                </a>
                {refs.length > 0 && (
                  <Link to={evidenceHref(brandKey, runId, refs)} className="link-evidence">
                    Evidence ({refs.length}) →
                  </Link>
                )}
                <span className="muted small rec-drafted">
                  drafted by {rec.drafted_by === "template" ? "template" : rec.drafted_by}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
