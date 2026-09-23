import type { AnalysisResult } from "../api/types";
import { pct } from "../format";

function Card({
  label,
  value,
  explainer,
  undefinedValue,
}: {
  label: string;
  value: string;
  explainer: string;
  undefinedValue?: boolean;
}) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${undefinedValue ? "metric-undefined" : ""}`}>{value}</span>
      <span className="metric-explainer">{explainer}</span>
    </div>
  );
}

// PRD: "a trend claim always carries its confidence interval in the UI, not
// just the headline number" — so the composite score is never shown alone.
export function MetricCards({ analysis }: { analysis: AnalysisResult }) {
  const lo = analysis.ci_low ?? 0;
  const hi = analysis.ci_high ?? 0;
  const score = analysis.composite_score ?? 0;

  return (
    <div className="metric-cards">
      <div className="metric-card metric-card-composite">
        <div>
          <span className="metric-label">
            Composite visibility score
            {analysis.prominence === null && (
              <span className="metric-note"> · re-normalized (Prominence undefined)</span>
            )}
          </span>
          <span className="metric-value metric-value-hero">{pct(score)}</span>
          <span className="metric-ci">
            95% CI {pct(lo)} – {pct(hi)} <span className="muted">(bootstrap over questions)</span>
          </span>
        </div>
        <div className="ci-bar" aria-hidden="true">
          <div className="ci-bar-range" style={{ left: `${lo * 100}%`, width: `${Math.max(0.5, (hi - lo) * 100)}%` }} />
          <div className="ci-bar-point" style={{ left: `${score * 100}%` }} />
          <span className="ci-bar-min">0%</span>
          <span className="ci-bar-max">100%</span>
        </div>
        <span className="metric-explainer">
          Weighted blend of Coverage, Prominence and Share of Voice. The band shows how much the score could
          move from sampling noise alone.
        </span>
      </div>

      <Card
        label="Coverage"
        value={pct(analysis.coverage)}
        explainer="% of unprompted answers that mention the brand at all."
      />
      <Card
        label="Prominence"
        value={analysis.prominence === null ? "Undefined" : pct(analysis.prominence)}
        undefinedValue={analysis.prominence === null}
        explainer={
          analysis.prominence === null
            ? "No mentions to rank — undefined, not zero."
            : "How high the brand appears when mentioned (100% = always listed first)."
        }
      />
      <Card
        label="Share of Voice"
        value={pct(analysis.share_of_voice)}
        explainer="Brand mentions as a share of all brand + competitor mentions."
      />
    </div>
  );
}
