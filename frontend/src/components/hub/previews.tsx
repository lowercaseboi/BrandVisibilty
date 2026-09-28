import type { BrandProfile, QuestionSet, Snapshot, TrendVerdict } from "../../api/types";
import { humanize, ratingFromRange, scoreBandClass, scoreOutOf100, scoreRange } from "../../format";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { countGapTypes, sparkPoints } from "./previewMath";

// Live previews on the hub's module cards: a glance at what each module holds, from the data the
// brand layout already loaded (useBrandData). Each is a big number + unit, then one supporting line.

/** Placeholder lines while the brand's data is still loading (instead of a misleading "none yet"). */
export function PreviewSkeleton() {
  return (
    <span className="hub-pv-skeleton" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

function Stat({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="hub-pv-stat">
      <span className="hub-pv-num">{value}</span>
      <span className="hub-pv-unit">{unit}</span>
    </span>
  );
}

/** Brand details: category, then competitors · questions (just questions until the profile loads). */
export function DetailsPreview({ profile, questions }: { profile: BrandProfile | null; questions: QuestionSet | null }) {
  const t = useT();
  const fmt = useFormat();
  const qCount = questions ? questions.scored_count : null;
  return (
    <div className="hub-pv-details">
      {profile?.category && <p className="hub-pv-line">{profile.category}</p>}
      <p className="hub-pv-stats">
        {profile && <Stat value={fmt.number(profile.competitors.length)} unit={t.n("hub.preview.details.competitors", profile.competitors.length)} />}
        {qCount !== null && <Stat value={fmt.number(qCount)} unit={t.n("hub.preview.details.questions", qCount)} />}
      </p>
    </div>
  );
}

function trendKey(v: TrendVerdict | undefined): MessageKey | null {
  if (!v) return null;
  switch (v.status) {
    case "change_detected":
      return v.direction === "down" ? "hub.trend.change_detected_down" : "hub.trend.change_detected_up";
    case "insufficient_data":
    case "no_change_detected":
    case "no_clear_trend":
    case "improving":
    case "declining":
      return `hub.trend.${v.status}`;
    default:
      return null;
  }
}

function trendTone(v: TrendVerdict | undefined): "up" | "down" | "flat" {
  if (!v) return "flat";
  if (v.status === "improving" || (v.status === "change_detected" && v.direction === "up")) return "up";
  if (v.status === "declining" || (v.status === "change_detected" && v.direction === "down")) return "down";
  return "flat";
}

const SPARK_W = 112;
const SPARK_H = 34;
const SPARK_MAX = 12;

/** Composite score over the last analyses, oldest → newest, with the newest point marked. */
export function Sparkline({ values, band }: { values: number[]; band: "low" | "mid" | "high" }) {
  const t = useT();
  const fmt = useFormat();
  const pts = sparkPoints(values, SPARK_W, SPARK_H);
  if (pts.length < 2) return null;
  const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const last = pts[pts.length - 1];
  const area = `${pts[0].x},${SPARK_H} ${line} ${last.x},${SPARK_H}`;
  return (
    <svg
      className={`hub-spark score-band-${band}`}
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      role="img"
      aria-label={t("hub.preview.analysis.trendAria", {
        n: values.length,
        first: fmt.number(scoreOutOf100(values[0])),
        last: fmt.number(scoreOutOf100(values[values.length - 1])),
      })}
    >
      <polygon className="hub-spark-area" points={area} />
      <polyline className="hub-spark-line" points={line} pathLength={1} />
      <circle className="hub-spark-dot" cx={last.x} cy={last.y} r={2.6} />
    </svg>
  );
}

/** Analysis: the score in its band colour, a sparkline of the last analyses and the trend verdict. */
export function AnalysisPreview({ latest, history }: { latest: Snapshot | null; history: Snapshot[] }) {
  const t = useT();
  const fmt = useFormat();
  if (!latest) return <p className="hub-pv-empty">{t("hub.preview.analysis.none")}</p>;

  const score = scoreOutOf100(latest.analysis_result.composite_score);
  const band = scoreBandClass(ratingFromRange(...scoreRange(latest.analysis_result)).band);
  const series = history.slice(-SPARK_MAX).map((s) => s.analysis_result.composite_score);
  const verdict = trendKey(latest.trend_verdict);
  const tone = trendTone(latest.trend_verdict);

  return (
    <div className="hub-pv-analysis">
      <div className="hub-pv-analysis-top">
        <span className={`hub-pv-stat hub-pv-score score-band-${band}`}>
          <span className="hub-pv-num">{fmt.number(score)}</span>
          <span className="hub-pv-unit">{t("hub.preview.analysis.outOf")}</span>
        </span>
        <Sparkline values={series} band={band} />
      </div>
      <p className="hub-pv-line hub-pv-meta">
        {verdict && (
          <span className={`hub-pv-trend hub-pv-trend-${tone}`}>
            <span aria-hidden="true">{tone === "up" ? "↗" : tone === "down" ? "↘" : "→"}</span> {t(verdict)}
          </span>
        )}
        {history.length > 0 && <span className="muted">{t.n("hub.preview.analysis.runs", history.length)}</span>}
      </p>
    </div>
  );
}

const GAP_TYPE_KEY: Record<string, MessageKey> = {
  presence: "dashboard.gaps.type.presence",
  prominence: "dashboard.gaps.type.prominence",
  competitive: "dashboard.gaps.type.competitive",
  representation: "dashboard.gaps.type.representation",
  source: "dashboard.gaps.type.source",
};

/** Gaps & evidence: how many gaps, with a small badge per gap type. */
export function GapsPreview({ latest }: { latest: Snapshot | null }) {
  const t = useT();
  const fmt = useFormat();
  if (!latest) return <p className="hub-pv-empty">{t("hub.preview.gaps.noData")}</p>;
  const gaps = latest.gaps ?? [];
  if (gaps.length === 0) return <p className="hub-pv-empty hub-pv-ok">{t("hub.preview.gaps.none")}</p>;
  return (
    <div className="hub-pv-gaps">
      <Stat value={fmt.number(gaps.length)} unit={t.n("hub.preview.gaps.unit", gaps.length)} />
      <ul className="hub-pv-badges">
        {countGapTypes(gaps).map(([type, n]) => (
          <li key={type} className={`hub-pv-badge hub-pv-badge-${type}`}>
            {GAP_TYPE_KEY[type] ? t(GAP_TYPE_KEY[type]) : humanize(type)}
            {n > 1 && <b>×{fmt.number(n)}</b>}
          </li>
        ))}
      </ul>
    </div>
  );
}
