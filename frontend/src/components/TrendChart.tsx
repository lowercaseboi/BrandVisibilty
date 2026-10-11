import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Snapshot, TrendVerdict } from "../api/types";
import { T, useFormat, useT } from "../i18n";
import type { Formatter, MessageKey, Vars } from "../i18n";
import { Details, useDetails } from "../settings/details";
import { markerIndex, sinceDelta } from "./campaign/trendMarkers";
import type { PublishMarker } from "./campaign/trendMarkers";
import { toScore, useListFormat, useShortDate, useShortTime } from "./dashboard/helpers";
import { estimateWidth, nearestIndex, pickAxisLabels } from "./trendAxis";

const MIN_W = 280;
// Base sizes in CSS px at scale 1; everything is multiplied by the live --z (1, or 1.2 on desktop).
const PAD = { top: 18, right: 28, bottom: 34, left: 40 };
const AXIS_FONT_PX = 11; // .trend-axis font-size (before --z)
const ROW_H = 15; // second label row, only when the first and last labels cannot share one
const FLAG_HIT = 32; // publish flags: a finger-sized invisible hit area around the 10px marker

/** The UI scale (--z) as a number: 1, or 1.2 on desktop. */
function readScale(): number {
  if (typeof document === "undefined") return 1;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--z")) || 1;
}

// Measure axis labels with the real UI font (canvas), falling back to an estimate.
let measureCtx: CanvasRenderingContext2D | null | undefined;
let measureFamily = "monospace";
function measureLabel(text: string, fontPx: number): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
      measureFamily = getComputedStyle(document.documentElement).getPropertyValue("--sans").trim() || "monospace";
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return estimateWidth(text, fontPx);
  measureCtx.font = `${fontPx}px ${measureFamily}`;
  return Math.ceil(measureCtx.measureText(text).width);
}

/** Local calendar day, so checks that share a day share a key. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const ORIGIN_KEY: Record<string, MessageKey> = {
  live: "dashboard.origin.live",
  synthetic: "dashboard.origin.synthetic",
  replay: "dashboard.origin.replay",
};

// AC-8 (PRD §11.6): which plain-language sentence the backend's verdict maps to. Slopes and
// deltas are already in points (0–100); the backend decides significance, the UI only words it.
// The sentence is plain ("Your score is going up, about +2 a week"); `detail` carries the
// technical half (95% range, sample count) for the Analytical view.
type Worded = { key: MessageKey; vars?: Vars };
function verdictMessage(v: TrendVerdict, fmt: Formatter): Worded & { detail?: Worded } {
  const signed = (x: number | null | undefined) => {
    const s = fmt.number(x ?? 0, 1);
    return (x ?? 0) > 0 ? `+${s}` : s;
  };
  // A rate in words: a decimal only when it is under a point, else a whole number.
  const plain = (x: number | null | undefined) => {
    const a = Math.abs(x ?? 0);
    return fmt.number(a, a < 1 ? 1 : 0);
  };
  switch (v.status) {
    case "no_change_detected":
      return { key: "dashboard.trend.verdict.noChange", detail: { key: "dashboard.trend.verdict.detailNoChange" } };
    case "change_detected":
      return {
        key: v.direction === "down" ? "dashboard.trend.verdict.changeDown" : "dashboard.trend.verdict.changeUp",
        vars: { delta: fmt.number(Math.abs(v.delta ?? 0), 0) },
        detail: { key: "dashboard.trend.verdict.detailChange" },
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
        vars: { slope: plain(weekly ? v.slope_per_week : v.slope) },
        detail: {
          key: "dashboard.trend.verdict.detail",
          vars: {
            lo: signed(weekly ? v.slope_per_week_ci_low : v.slope_ci_low),
            hi: signed(weekly ? v.slope_per_week_ci_high : v.slope_ci_high),
            n: v.n_points,
          },
        },
      };
    }
    case "no_clear_trend":
      return {
        key: "dashboard.trend.verdict.noTrend",
        detail: { key: "dashboard.trend.verdict.detailNoTrend", vars: { n: v.n_points } },
      };
    default:
      return { key: "dashboard.trend.verdict.insufficient", detail: { key: "dashboard.trend.verdict.detailInsufficient" } };
  }
}

function TrendVerdictLine({ verdict }: { verdict: TrendVerdict }) {
  const t = useT();
  const fmt = useFormat();
  const { key, vars, detail } = verdictMessage(verdict, fmt);
  return (
    <p className={`trend-verdict trend-verdict-${verdict.direction ?? "flat"}`}>
      <T k={key} vars={vars} />
      <Details>
        {detail && (
          <span className="muted">
            {" "}
            <T k={detail.key} vars={detail.vars} />
          </span>
        )}
        {verdict.n_excluded > 0 && (
          <span className="muted"> {t.n("dashboard.trend.verdict.excluded", verdict.n_excluded)}</span>
        )}
      </Details>
    </p>
  );
}

// The score (0–100) over checks; the Analytical view adds its likely range as a band (PRD: trend
// claims always carry their CI). A change in comparability_key means the questions, sampling or AIs changed,
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
  // Draw at the container's real width, 1:1, so the labels keep their size at every width (a fixed
  // viewBox shrank them on phones and blew them up on desktops) and label widths can be measured.
  // `z` is the UI scale (--z), re-read whenever the container resizes (crossing 900px changes it).
  const [width, setWidth] = useState(720);
  const [z, setZ] = useState(readScale);
  const observer = useRef<ResizeObserver | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
      setZ(readScale());
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
          {showDetails && (
            <line x1={172} x2={172} y1={sy(toScore(a.ci_high))} y2={sy(toScore(a.ci_low))} className="trend-ci-whisker" />
          )}
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
  const W = Math.max(MIN_W, width);
  const pad = { top: PAD.top * z, right: PAD.right * z, bottom: PAD.bottom * z, left: PAD.left * z };
  const axisFontPx = AXIS_FONT_PX * z;
  const rowH = ROW_H * z;
  const innerW = W - pad.left - pad.right;
  const x = (i: number) => pad.left + (i / (n - 1)) * innerW;
  const when = (s: Snapshot) => s.collection_completed_at || s.collection_started_at;
  // X-axis labels: measured, thinned so none collide, first + last always kept (see trendAxis.ts).
  const axisLabels = pickAxisLabels({
    xs: snapshots.map((_, i) => x(i)),
    dayKeys: snapshots.map((s) => dayKey(when(s))),
    dateText: snapshots.map((s) => shortDate(when(s))),
    timeText: snapshots.map((s) => shortTime(when(s))),
    measure: (text) => measureLabel(text, axisFontPx),
    minX: 2,
    maxX: W - 2,
  });
  const twoRows = axisLabels.some((l) => l.row === 1);
  const padBottom = pad.bottom + (twoRows ? rowH : 0);
  const H = (W < 500 ? 180 : W < 900 ? 240 : 260) * z + (twoRows ? rowH : 0);
  const innerH = H - pad.top - padBottom;
  // Scores are 0-100 points: fit the axis to the highest score (or, in the Analytical view where the
  // range band shows, the highest CI bound), at least 25, plus headroom, rounded up to the next 10.
  const top = (s: Snapshot) => (showDetails ? (s.analysis_result.ci_high ?? 0) : s.analysis_result.composite_score);
  const maxVal = Math.min(100, Math.max(25, ...snapshots.map(top)) + 5);
  const yMax = Math.ceil(maxVal / 10) * 10;
  const y = (v: number) => pad.top + innerH - (Math.max(0, Math.min(yMax, v ?? 0)) / yMax) * innerH;

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

  const ap = active !== null ? pts[active] : null;
  const times = snapshots.map((s) => Date.parse(when(s)));
  const markers = (events ?? []).flatMap((ev) => {
    const at = markerIndex(times, Date.parse(ev.at));
    if (!at) return [];
    const mx = at.after ? x(n - 1) + Math.min(pad.right - 8, 14 * z) : pad.left + (at.index / (n - 1)) * innerW;
    return [{ ev, x: mx, delta: sinceDelta(snapshots, ev.at) }];
  });
  const am = activeMarker !== null ? (markers[activeMarker] ?? null) : null;
  const first = snapshots[0];
  const last = snapshots[n - 1];

  // Scrubbing: a pointer (mouse, pen or finger) anywhere over the chart picks the nearest check.
  // touch-action: pan-y on the svg keeps vertical page scroll; a sideways drag scrubs. A finger's
  // pick stays after it lifts (like a tap); a mouse leaving the plot clears it, as hover did.
  const xs = pts.map((p) => p.x);
  const scrub = (e: PointerEvent<SVGSVGElement>) => {
    if (e.target instanceof Element && e.target.closest(".trend-pub")) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const sy = ((e.clientY - box.top) / box.height) * H;
    if (e.pointerType === "mouse" && (sy < pad.top - 8 || sy > pad.top + innerH + 8)) {
      setActive(null);
      return;
    }
    const i = nearestIndex(((e.clientX - box.left) / box.width) * W, xs);
    setActiveMarker(null);
    setActive(i < 0 ? null : i);
  };
  const onPointerLeave = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") setActive(null);
  };

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
        onPointerDown={scrub}
        onPointerMove={scrub}
        onPointerLeave={onPointerLeave}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className="trend-grid" />
            <text x={pad.left - 8 * z} y={y(v) + 4 * z} className="trend-axis" textAnchor="end">
              {fmt.number(v)}
            </text>
          </g>
        ))}

        {segments.map((seg, si) => (
          <g key={si}>
            {seg.length > 1 && (
              <>
                {showDetails && (
                  <path
                    className="trend-band"
                    d={`M${seg.map((p) => `${p.x},${p.hi}`).join(" L")} L${[...seg]
                      .reverse()
                      .map((p) => `${p.x},${p.lo}`)
                      .join(" L")} Z`}
                  />
                )}
                <path className="trend-line" d={`M${seg.map((p) => `${p.x},${p.y}`).join(" L")}`} />
              </>
            )}
            {seg.length === 1 && showDetails && (
              <line className="trend-ci-whisker" x1={seg[0].x} x2={seg[0].x} y1={seg[0].hi} y2={seg[0].lo} />
            )}
          </g>
        ))}

        {/* Breaks carry no text in the chart (labels overlapped when checks were close);
            a small marker on top + one legend entry explain them instead. */}
        {breaks.map((bx, i) => (
          <g key={i}>
            <line x1={bx} x2={bx} y1={pad.top} y2={pad.top + innerH} className="trend-break" />
            <circle cx={bx} cy={pad.top - 6 * z} r={4 * z} className="trend-break-dot" />
          </g>
        ))}

        {ap && <line x1={ap.x} x2={ap.x} y1={pad.top} y2={pad.top + innerH} className="trend-crosshair" />}

        {markers.map((m, i) => (
          <line key={`ml${i}`} x1={m.x} x2={m.x} y1={pad.top} y2={pad.top + innerH} className={`trend-pub-line${activeMarker === i ? " is-active" : ""}`} />
        ))}

        {pts.map((p, i) => (
          <g key={p.s.run_id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={(p.s.run_id === currentRunId || i === active ? 5.5 : 4) * z}
              className={`trend-point ${p.s.run_id === currentRunId ? "trend-point-current" : ""}`}
            />
            {i === n - 1 && (
              <text x={p.x} y={p.y - 10 * z} className="trend-value" textAnchor="end">
                {toScore(p.s.analysis_result.composite_score)}
              </text>
            )}
          </g>
        ))}

        {/* Labels sit below the publish flags (axis +1..+9), so the two never overlap. */}
        {axisLabels.map((l) => (
          <text key={`x${l.index}`} x={l.x} y={pad.top + innerH + 24 * z + l.row * rowH} className="trend-axis" textAnchor="middle">
            {l.text}
          </text>
        ))}

        {markers.map((m, i) => {
          const by = pad.top + innerH;
          const hit = FLAG_HIT * z;
          const w = 5 * z;
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
              <rect x={m.x - hit / 2} y={by + w - hit / 2} width={hit} height={hit} fill="transparent" />
              <path d={`M${m.x},${by + z} L${m.x + w},${by + 9 * z} L${m.x - w},${by + 9 * z} Z`} className="trend-pub-flag" />
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
              k={showDetails ? "dashboard.trend.pointRange" : "dashboard.trend.point"}
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

      {/* A lone "Score" key explains nothing, so the legend only appears when there is more to key. */}
      {(showDetails || breaks.length > 0 || markers.length > 0) && (
        <div className="trend-legend small muted">
          <span>
            <i className="swatch swatch-line" /> {t("dashboard.trend.legendScore")}
          </span>
          {showDetails && (
            <span>
              <i className="swatch swatch-band" /> {t("dashboard.trend.legendBand")}
            </span>
          )}
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
      )}
    </div>
  );
}
