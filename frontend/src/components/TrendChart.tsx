import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Snapshot, TrendVerdict } from "../api/types";
import { T, useFormat, useT } from "../i18n";
import type { Formatter, MessageKey, Vars } from "../i18n";
import { useDetails } from "../settings/details";
import { markerIndex, sinceDelta } from "./campaign/trendMarkers";
import type { PublishMarker } from "./campaign/trendMarkers";
import { toScore, useListFormat, useShortDate, useShortTime } from "./dashboard/helpers";

const MAX_W = 720;
const MIN_W = 280;
const PAD = { top: 18, right: 28, bottom: 34, left: 40 };

const ORIGIN_KEY: Record<string, MessageKey> = {
  live: "dashboard.origin.live",
  synthetic: "dashboard.origin.synthetic",
  replay: "dashboard.origin.replay",
};

// AC-8 (PRD §11.6): which plain-language sentence the backend's verdict maps to. Slopes and
// deltas are already in points (0–100); the backend decides significance, the UI only words it.
function verdictMessage(v: TrendVerdict, fmt: Formatter): { key: MessageKey; vars?: Vars } {
  const signed = (x: number | null | undefined) => {
    const s = fmt.number(x ?? 0, 1);
    return (x ?? 0) > 0 ? `+${s}` : s;
  };
  switch (v.status) {
    case "no_change_detected":
      return { key: "dashboard.trend.verdict.noChange" };
    case "change_detected":
      return {
        key: v.direction === "down" ? "dashboard.trend.verdict.changeDown" : "dashboard.trend.verdict.changeUp",
        vars: { delta: fmt.number(Math.abs(v.delta ?? 0), 0) },
      };
    case "improving":
    case "declining": {
      const weekly = v.x_unit === "day" && v.slope_per_week != null;
      const up = v.status === "improving";
      const key: MessageKey = weekly
        ? up ? "dashboard.trend.verdict.improvingWeek" : "dashboard.trend.verdict.decliningWeek"
        : up ? "dashboard.trend.verdict.improvingRun" : "dashboard.trend.verdict.decliningRun";
      return {
        key,
        vars: {
          slope: signed(weekly ? v.slope_per_week : v.slope),
          lo: signed(weekly ? v.slope_per_week_ci_low : v.slope_ci_low),
          hi: signed(weekly ? v.slope_per_week_ci_high : v.slope_ci_high),
          n: v.n_points,
        },
      };
    }
    case "no_clear_trend":
      return { key: "dashboard.trend.verdict.noTrend", vars: { n: v.n_points } };
    default:
      return { key: "dashboard.trend.verdict.insufficient" };
  }
}

function TrendVerdictLine({ verdict }: { verdict: TrendVerdict }) {
  const t = useT();
  const fmt = useFormat();
  const { key, vars } = verdictMessage(verdict, fmt);
  return (
    <p className={`trend-verdict trend-verdict-${verdict.direction ?? "flat"}`}>
      <T k={key} vars={vars} />
      {verdict.n_excluded > 0 && (
        <span className="muted"> {t.n("dashboard.trend.verdict.excluded", verdict.n_excluded)}</span>
      )}
    </p>
  );
}

// The score (0–100) over checks, with its likely range as a band (PRD: trend claims always
// carry their CI). A change in comparability_key means the questions, sampling or AIs changed,
// so points on either side aren't comparable: the line breaks there and a dashed marker shows it.
// `events` (Campaign Studio): small "Published" flags on the x-axis where a campaign went out,
// placed between the checks around it, with a "since then" delta in the tooltip.
export function TrendChart({
  snapshots,
  currentRunId,
  labelOf = (id: string) => id,
  events,
}: {
  snapshots: Snapshot[];
  currentRunId?: string;
  labelOf?: (id: string) => string;
  events?: PublishMarker[];
}) {
  const t = useT();
  const fmt = useFormat();
  const shortDate = useShortDate();
  const shortTime = useShortTime();
  const list = useListFormat();
  const { showDetails } = useDetails();
  const [active, setActive] = useState<number | null>(null);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  // Draw at the container's real width so labels stay readable on phones (a fixed
  // 720-wide viewBox shrank the text to ~5px at 390px).
  const [width, setWidth] = useState(MAX_W);
  const observer = useRef<ResizeObserver | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    observer.current = ro;
  }, []);

  if (snapshots.length === 0) return null;

  // One analysis is a point, not a line: draw that point with its range, plus a note.
  if (snapshots.length === 1) {
    const a = snapshots[0].analysis_result;
    const sy = (v: number) => 12 + (1 - v / 100) * 96;
    const score = toScore(a.composite_score);
    return (
      <div className="trend-one">
        <svg className="trend-svg" viewBox="0 0 320 124" role="img" aria-label={t("dashboard.trend.single")}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={34} x2={310} y1={sy(v)} y2={sy(v)} className="trend-grid" />
              <text x={26} y={sy(v) + 4} textAnchor="end" className="trend-axis">
                {v}
              </text>
            </g>
          ))}
          <line x1={172} x2={172} y1={sy(toScore(a.ci_high))} y2={sy(toScore(a.ci_low))} className="trend-ci-whisker" />
          <circle cx={172} cy={sy(score)} r={5} className="trend-point trend-point-current" />
          <text x={184} y={sy(score) + 4} className="trend-value">
            {score}
          </text>
        </svg>
        <p className="muted trend-single">{t("dashboard.trend.single")}</p>
      </div>
    );
  }

  const n = snapshots.length;
  const W = Math.max(MIN_W, Math.min(MAX_W, width));
  const narrow = W < 500;
  const H = narrow ? 200 : 240;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  // Scores are 0-100 points: fit the axis to the highest CI bound (at least 25) plus headroom,
  // rounded up to the next 10.
  const maxVal = Math.min(100, Math.max(25, ...snapshots.map((s) => s.analysis_result.ci_high ?? 0)) + 5);
  const yMax = Math.ceil(maxVal / 10) * 10;
  const x = (i: number) => PAD.left + (i / (n - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (Math.max(0, Math.min(yMax, v ?? 0)) / yMax) * innerH;

  const pts = snapshots.map((s, i) => ({
    x: x(i),
    y: y(s.analysis_result.composite_score),
    lo: y(s.analysis_result.ci_low),
    hi: y(s.analysis_result.ci_high),
    s,
  }));

  // Split into comparable segments so the line and band never bridge a break.
  const segments: (typeof pts)[] = [];
  const breaks: number[] = [];
  pts.forEach((p, i) => {
    if (i > 0 && p.s.comparability_key !== pts[i - 1].s.comparability_key) {
      breaks.push((pts[i - 1].x + p.x) / 2);
      segments.push([]);
    }
    if (segments.length === 0) segments.push([]);
    segments[segments.length - 1].push(p);
  });

  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += yMax <= 50 ? 10 : 20) ticks.push(v);

  const labelEvery = Math.max(1, Math.ceil(n / (narrow ? 3 : 6)));
  // Several checks on one day would all read "25 Sept": label them by time instead,
  // and never repeat the same label twice in a row.
  const days = snapshots.map((s) => shortDate(s.collection_completed_at));
  const oneDay = days.every((d) => d === days[0]);
  const axisLabels = snapshots.map((s, i) => (oneDay ? shortTime(s.collection_completed_at) : days[i]));
  const showLabel = (i: number) =>
    (i % labelEvery === 0 || i === n - 1) && (i === 0 || axisLabels[i] !== axisLabels[i - 1]);
  const ap = active !== null ? pts[active] : null;
  const times = snapshots.map((s) => Date.parse(s.collection_completed_at || s.collection_started_at));
  const markers = (events ?? []).flatMap((ev) => {
    const at = markerIndex(times, Date.parse(ev.at));
    if (!at) return [];
    const mx = at.after ? x(n - 1) + Math.min(PAD.right - 8, 14) : PAD.left + (at.index / (n - 1)) * innerW;
    return [{ ev, x: mx, delta: sinceDelta(snapshots, ev.at) }];
  });
  const am = activeMarker !== null ? (markers[activeMarker] ?? null) : null;
  const hitHalf = Math.max(10, innerW / (n - 1) / 2);
  const first = snapshots[0];
  const last = snapshots[n - 1];

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? n) - 1));
    else if (e.key === "ArrowRight") setActive((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const origin = ap ? (ORIGIN_KEY[ap.s.data_origin ?? "live"] ?? "dashboard.origin.live") : null;
  // Only the newest snapshot carries the verdict (it describes the history as of that run).
  const verdict = last.trend_verdict;

  return (
    <div className="trend" ref={measureRef}>
      {verdict && <TrendVerdictLine verdict={verdict} />}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="trend-svg"
        role="img"
        tabIndex={0}
        aria-label={t("dashboard.trend.aria", {
          first: toScore(first.analysis_result.composite_score),
          firstDate: fmt.date(first.collection_completed_at),
          last: toScore(last.analysis_result.composite_score),
          lastDate: fmt.date(last.collection_completed_at),
        })}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="trend-grid" />
            <text x={PAD.left - 8} y={y(v) + 4} className="trend-axis" textAnchor="end">
              {fmt.number(v)}
            </text>
          </g>
        ))}

        {segments.map((seg, si) => (
          <g key={si}>
            {seg.length > 1 && (
              <>
                <path
                  className="trend-band"
                  d={`M${seg.map((p) => `${p.x},${p.hi}`).join(" L")} L${[...seg]
                    .reverse()
                    .map((p) => `${p.x},${p.lo}`)
                    .join(" L")} Z`}
                />
                <path className="trend-line" d={`M${seg.map((p) => `${p.x},${p.y}`).join(" L")}`} />
              </>
            )}
            {seg.length === 1 && (
              <line className="trend-ci-whisker" x1={seg[0].x} x2={seg[0].x} y1={seg[0].hi} y2={seg[0].lo} />
            )}
          </g>
        ))}

        {/* Breaks carry no text in the chart (labels overlapped when checks were close);
            a small marker on top + one legend entry explain them instead. */}
        {breaks.map((bx, i) => (
          <g key={i}>
            <line x1={bx} x2={bx} y1={PAD.top} y2={PAD.top + innerH} className="trend-break" />
            <circle cx={bx} cy={PAD.top - 6} r={4} className="trend-break-dot" />
          </g>
        ))}

        {ap && <line x1={ap.x} x2={ap.x} y1={PAD.top} y2={PAD.top + innerH} className="trend-crosshair" />}

        {markers.map((m, i) => (
          <line key={`ml${i}`} x1={m.x} x2={m.x} y1={PAD.top} y2={PAD.top + innerH} className={`trend-pub-line${activeMarker === i ? " is-active" : ""}`} />
        ))}

        {pts.map((p, i) => (
          <g key={p.s.run_id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={p.s.run_id === currentRunId || i === active ? 5.5 : 4}
              className={`trend-point ${p.s.run_id === currentRunId ? "trend-point-current" : ""}`}
            />
            {showLabel(i) && (
              <text x={p.x} y={H - PAD.bottom + 20} className="trend-axis" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {axisLabels[i]}
              </text>
            )}
            {i === n - 1 && (
              <text x={p.x} y={p.y - 10} className="trend-value" textAnchor="end">
                {toScore(p.s.analysis_result.composite_score)}
              </text>
            )}
            <rect
              x={p.x - hitHalf}
              y={PAD.top}
              width={hitHalf * 2}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(i)}
            />
          </g>
        ))}

        {markers.map((m, i) => {
          const by = PAD.top + innerH;
          const label = t("board.campaign.trend.marker", { headline: m.ev.headline, date: fmt.date(m.ev.at) });
          return (
            <g
              key={`m${i}`}
              className="trend-pub"
              onMouseEnter={() => setActiveMarker(i)}
              onMouseLeave={() => setActiveMarker(null)}
              onClick={() => setActiveMarker(i)}
            >
              <title>{label}</title>
              <rect x={m.x - 8} y={by - 4} width={16} height={16} fill="transparent" />
              <path d={`M${m.x},${by + 1} L${m.x + 5},${by + 9} L${m.x - 5},${by + 9} Z`} className="trend-pub-flag" />
            </g>
          );
        })}
      </svg>

      <p className="trend-tooltip-row" aria-live="polite">
        {am ? (
          <>
            {t("board.campaign.trend.marker", { headline: am.ev.headline, date: fmt.date(am.ev.at) })}
            {am.delta !== null && (
              <span className="muted">
                {" · "}
                {t("board.campaign.trend.since", {
                  delta: `${am.delta > 0 ? "+" : ""}${fmt.number(am.delta, 1)}`,
                })}
              </span>
            )}
          </>
        ) : ap ? (
          <>
            <T
              k="dashboard.trend.point"
              vars={{
                date: fmt.date(ap.s.collection_completed_at),
                score: toScore(ap.s.analysis_result.composite_score),
                lo: toScore(ap.s.analysis_result.ci_low),
                hi: toScore(ap.s.analysis_result.ci_high),
              }}
            />
            {showDetails && origin && (
              <span className="muted">
                {" · "}
                {t("dashboard.trend.pointDetails", {
                  origin: t(origin),
                  ais: list((ap.s.providers ?? []).map(labelOf)) || "—",
                })}
              </span>
            )}
          </>
        ) : (
          <span className="muted">{t("dashboard.trend.hint")}</span>
        )}
      </p>

      <div className="trend-legend small muted">
        <span>
          <i className="swatch swatch-line" /> {t("dashboard.trend.legendScore")}
        </span>
        <span>
          <i className="swatch swatch-band" /> {t("dashboard.trend.legendBand")}
        </span>
        {breaks.length > 0 && (
          <span>
            <i className="swatch swatch-break" /> {t("dashboard.trend.legendBreak")}
          </span>
        )}
        {markers.length > 0 && (
          <span>
            <i className="swatch swatch-pub" /> {t("board.campaign.trend.legend")}
          </span>
        )}
      </div>
    </div>
  );
}
