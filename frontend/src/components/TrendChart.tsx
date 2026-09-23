import { useState } from "react";
import type { Snapshot } from "../api/types";
import { formatDate, pct, shortDate } from "../format";

const W = 720;
const H = 260;
const PAD = { top: 20, right: 24, bottom: 44, left: 44 };

// Composite score over snapshots with its 95% CI band (PRD: trend claims always
// carry their CI). A change in comparability_key means the query set, sampling
// or model versions changed, so points on either side aren't comparable.
export function TrendChart({ snapshots, currentRunId }: { snapshots: Snapshot[]; currentRunId?: string }) {
  const [hover, setHover] = useState<number | null>(null);

  if (snapshots.length === 0) return <p className="empty">No snapshots yet.</p>;

  if (snapshots.length === 1) {
    const s = snapshots[0];
    return (
      <div className="trend-baseline">
        <div>
          <span className="metric-value">{pct(s.analysis_result.composite_score)}</span>
          <span className="muted small"> composite on {formatDate(s.collection_completed_at)}</span>
        </div>
        <p className="muted small">Baseline only — trends need ≥2 runs (DESIGN §6).</p>
      </div>
    );
  }

  const n = snapshots.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxVal = Math.min(1, Math.max(0.25, ...snapshots.map((s) => s.analysis_result.ci_high ?? 0)) + 0.05);
  const yMax = Math.ceil(maxVal * 10) / 10;
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (Math.max(0, Math.min(yMax, v)) / yMax) * innerH;

  const pts = snapshots.map((s, i) => ({
    x: x(i),
    y: y(s.analysis_result.composite_score),
    lo: y(s.analysis_result.ci_low),
    hi: y(s.analysis_result.ci_high),
    s,
  }));

  // Split into comparable segments so the line/band don't bridge a break.
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

  const ticks = [];
  for (let t = 0; t <= yMax + 1e-9; t += yMax <= 0.5 ? 0.1 : 0.2) ticks.push(t);

  // Label at most ~8 dates on the x axis.
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const hp = hover !== null ? pts[hover] : null;
  const hitHalf = Math.max(10, innerW / (n - 1) / 2);

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" role="img" aria-label="Composite score trend with 95% confidence band">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="trend-grid" />
            <text x={PAD.left - 8} y={y(t) + 4} className="trend-axis" textAnchor="end">
              {Math.round(t * 100)}%
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

        {breaks.map((bx, i) => (
          <g key={i}>
            <line x1={bx} x2={bx} y1={PAD.top - 6} y2={PAD.top + innerH} className="trend-break" />
            <text x={bx + 4} y={PAD.top + 4} className="trend-break-label">
              not comparable
            </text>
          </g>
        ))}

        {hp && <line x1={hp.x} x2={hp.x} y1={PAD.top} y2={PAD.top + innerH} className="trend-crosshair" />}

        {pts.map((p, i) => (
          <g key={p.s.run_id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={p.s.run_id === currentRunId ? 5.5 : 4.5}
              className={`trend-point ${p.s.run_id === currentRunId ? "trend-point-current" : ""}`}
            />
            {(i % labelEvery === 0 || i === n - 1) && (
              <text x={p.x} y={H - PAD.bottom + 18} className="trend-axis" textAnchor="middle">
                {shortDate(p.s.collection_completed_at)}
              </text>
            )}
            {i === n - 1 && (
              <text x={p.x} y={p.y - 10} className="trend-value" textAnchor="end">
                {pct(p.s.analysis_result.composite_score)}
              </text>
            )}
            <rect
              x={p.x - hitHalf}
              y={PAD.top}
              width={hitHalf * 2}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="trend-axis">
          Run date →
        </text>
      </svg>

      <div className="trend-tooltip-row">
        {hp ? (
          <span>
            <strong>{formatDate(hp.s.collection_completed_at)}</strong> · composite{" "}
            <strong>{pct(hp.s.analysis_result.composite_score)}</strong> (95% CI {pct(hp.s.analysis_result.ci_low)}–
            {pct(hp.s.analysis_result.ci_high)}) · {hp.s.data_origin ?? "live"} · {(hp.s.providers ?? []).join(", ") || "—"}
          </span>
        ) : (
          <span className="muted">Hover a point for details.</span>
        )}
      </div>

      <div className="trend-legend small muted">
        <span>
          <i className="swatch swatch-line" /> Composite score
        </span>
        <span>
          <i className="swatch swatch-band" /> 95% bootstrap CI
        </span>
        {breaks.length > 0 && (
          <span>
            <i className="swatch swatch-break" /> Comparability break — query set, sampling or model versions
            changed; not comparable across this line
          </span>
        )}
      </div>
    </div>
  );
}
