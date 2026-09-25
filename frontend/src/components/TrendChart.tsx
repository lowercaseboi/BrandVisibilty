import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Snapshot } from "../api/types";
import { T, useFormat, useT } from "../i18n";
import type { MessageKey } from "../i18n";
import { useDetails } from "../settings/details";
import { toScore, useListFormat, useShortDate, useShortTime } from "./dashboard/helpers";

const MAX_W = 720;
const MIN_W = 280;
const PAD = { top: 18, right: 28, bottom: 34, left: 40 };

const ORIGIN_KEY: Record<string, MessageKey> = {
  live: "dashboard.origin.live",
  synthetic: "dashboard.origin.synthetic",
  replay: "dashboard.origin.replay",
};

// The score (0–100) over checks, with its likely range as a band (PRD: trend claims always
// carry their CI). A change in comparability_key means the questions, sampling or AIs changed,
// so points on either side aren't comparable: the line breaks there and a dashed marker shows it.
export function TrendChart({
  snapshots,
  currentRunId,
  labelOf = (id: string) => id,
}: {
  snapshots: Snapshot[];
  currentRunId?: string;
  labelOf?: (id: string) => string;
}) {
  const t = useT();
  const fmt = useFormat();
  const shortDate = useShortDate();
  const shortTime = useShortTime();
  const list = useListFormat();
  const { showDetails } = useDetails();
  const [active, setActive] = useState<number | null>(null);
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

  if (snapshots.length === 1) {
    return <p className="muted trend-single">{t("dashboard.trend.single")}</p>;
  }

  const n = snapshots.length;
  const W = Math.max(MIN_W, Math.min(MAX_W, width));
  const narrow = W < 500;
  const H = narrow ? 200 : 240;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxVal = Math.min(1, Math.max(0.25, ...snapshots.map((s) => s.analysis_result.ci_high ?? 0)) + 0.05);
  const yMax = Math.ceil(maxVal * 10) / 10;
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
  for (let v = 0; v <= yMax + 1e-9; v += yMax <= 0.5 ? 0.1 : 0.2) ticks.push(v);

  const labelEvery = Math.max(1, Math.ceil(n / (narrow ? 3 : 6)));
  // Several checks on one day would all read "25 Sept": label them by time instead,
  // and never repeat the same label twice in a row.
  const days = snapshots.map((s) => shortDate(s.collection_completed_at));
  const oneDay = days.every((d) => d === days[0]);
  const axisLabels = snapshots.map((s, i) => (oneDay ? shortTime(s.collection_completed_at) : days[i]));
  const showLabel = (i: number) =>
    (i % labelEvery === 0 || i === n - 1) && (i === 0 || axisLabels[i] !== axisLabels[i - 1]);
  const ap = active !== null ? pts[active] : null;
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

  return (
    <div className="trend" ref={measureRef}>
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
              {fmt.number(Math.round(v * 100))}
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
      </svg>

      <p className="trend-tooltip-row" aria-live="polite">
        {ap ? (
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
      </div>
    </div>
  );
}
