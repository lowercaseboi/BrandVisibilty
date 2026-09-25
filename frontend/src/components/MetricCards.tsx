import type { AnalysisResult } from "../api/types";
import { useFormat, useT } from "../i18n";

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
// Values arrive as 0..1 fractions (api/client.ts converts the backend's 0-100 composite).
export function MetricCards({ analysis }: { analysis: AnalysisResult }) {
  const t = useT();
  const fmt = useFormat();
  const lo = analysis.ci_low ?? 0;
  const hi = analysis.ci_high ?? 0;
  const score = analysis.composite_score ?? 0;
  const pts = (x: number) => fmt.number(x * 100, 1);
  const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : fmt.percent(x, 1));

  return (
    <div className="metric-cards">
      <div className="metric-card metric-card-composite">
        <div>
          <span className="metric-label">
            {t("dashboard.metrics.composite")}
            {analysis.prominence === null && <span className="metric-note"> · {t("dashboard.metrics.renormalized")}</span>}
          </span>
          <span className="metric-value metric-value-hero">
            {pts(score)}
            <span className="metric-outof">/100</span>
          </span>
          <span className="metric-ci">
            {t("dashboard.metrics.ci", { lo: pts(lo), hi: pts(hi) })}{" "}
            <span className="muted">({t("dashboard.metrics.ciNote")})</span>
          </span>
        </div>
        <div className="ci-bar" aria-hidden="true">
          <div className="ci-bar-range" style={{ left: `${lo * 100}%`, width: `${Math.max(0.5, (hi - lo) * 100)}%` }} />
          <div className="ci-bar-point" style={{ left: `${score * 100}%` }} />
          <span className="ci-bar-min">0</span>
          <span className="ci-bar-max">100</span>
        </div>
        <span className="metric-explainer">{t("dashboard.metrics.compositeExplainer")}</span>
      </div>

      <Card
        label={t("dashboard.metrics.coverage")}
        value={pct(analysis.coverage)}
        explainer={t("dashboard.metrics.coverageExplainer")}
      />
      <Card
        label={t("dashboard.metrics.prominence")}
        value={analysis.prominence === null ? t("dashboard.metrics.prominenceUndefined") : pct(analysis.prominence)}
        undefinedValue={analysis.prominence === null}
        explainer={
          analysis.prominence === null
            ? t("dashboard.metrics.prominenceUndefinedExplainer")
            : t("dashboard.metrics.prominenceExplainer")
        }
      />
      <Card
        label={t("dashboard.metrics.sov")}
        value={pct(analysis.share_of_voice)}
        explainer={t("dashboard.metrics.sovExplainer")}
      />
    </div>
  );
}
