import type { AnalysisResult } from "../api/types";
import { scoreRange } from "../format";
import { useFormat, useT } from "../i18n";
import { InfoTip } from "./InfoTip";

/**
 * The component metrics behind a score, in one compact row: coverage, prominence, share of voice
 * and the 95% range. Shown in the numbers view on brand cards and under the score hero.
 */
export function MetricStrip({ analysis, compact = false }: { analysis: AnalysisResult; compact?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : fmt.percent(x, 0));
  const [lo, hi] = scoreRange(analysis);

  // [label, value, explanation shown by the "i" tip]
  const items: [string, string, string][] = [
    [t("dashboard.metrics.coverage"), pct(analysis.coverage), t("dashboard.metrics.coverageExplainer")],
    [t("dashboard.metrics.prominence"), pct(analysis.prominence), t("dashboard.metrics.prominenceExplainer")],
    [t("dashboard.metrics.sov"), pct(analysis.share_of_voice), t("dashboard.metrics.sovExplainer")],
    [t("dashboard.strip.ci"), `${fmt.number(lo)}–${fmt.number(hi)}`, t("dashboard.hero.rangeWhy")],
  ];

  return (
    <dl className={`metric-strip${compact ? " metric-strip-compact" : ""}`}>
      {items.map(([label, value, info]) => (
        <div key={label}>
          <dt className="eyebrow">
            {label}
            <InfoTip text={info} label={label} plain={compact} />
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
