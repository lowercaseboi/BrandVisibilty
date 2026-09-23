import type { AnalysisResult } from "../api/types";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// PRD: "a trend claim always carries its confidence interval in the UI, not
// just the headline number" — so the composite score is never shown alone.
export function MetricCards({ analysis }: { analysis: AnalysisResult }) {
  return (
    <div className="metric-cards">
      <div className="metric-card">
        <span className="metric-label">Coverage</span>
        <span className="metric-value">{pct(analysis.coverage)}</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Prominence</span>
        {analysis.prominence === null ? (
          <span className="metric-value metric-undefined" title="No mentions to score — not the same as 0">
            Undefined
          </span>
        ) : (
          <span className="metric-value">{pct(analysis.prominence)}</span>
        )}
      </div>

      <div className="metric-card">
        <span className="metric-label">Share of Voice</span>
        <span className="metric-value">
          {analysis.share_of_voice === null ? "—" : pct(analysis.share_of_voice)}
        </span>
      </div>

      <div className="metric-card metric-card-composite">
        <span className="metric-label">
          Composite Score
          {analysis.prominence === null && (
            <span className="metric-note"> (re-normalized: Prominence undefined)</span>
          )}
        </span>
        <span className="metric-value">{pct(analysis.composite_score)}</span>
        <span className="metric-ci">
          95% CI: {pct(analysis.ci_low)} – {pct(analysis.ci_high)}
        </span>
      </div>
    </div>
  );
}
