import { useLayoutEffect, useRef } from "react";
import type { RatingBand } from "../format";
import { scoreBandClass } from "../format";
import { useFormat } from "../i18n";
import { useReducedMotion } from "../settings/motion";

const COUNT_MS = 700;

/**
 * Counts 0 → target (ease-out) each time `play` changes, calling `paint` with each frame's value;
 * skipped under reduced motion. `instant` starts at the target on mount (no first count-up), e.g.
 * when a view-transition morph carries an already-counted ring from one page to the next.
 *
 * It paints straight into the DOM rather than through React state: a count-up is ~40 frames, and
 * re-rendering the ring on every one of them is wasted work (several rings run at once on the
 * brand list). React renders the resting value (the target), so a re-render mid-count is harmless.
 */
function useCountUp(target: number, play: number, instant: boolean, paint: (v: number) => void) {
  // The (target, play) pair already on screen. Comparing against it (rather than a one-shot "skip
  // first run" flag) keeps `instant` working when StrictMode runs the mount effect twice.
  const shown = useRef<string | null>(instant ? `${target}|${play}` : null);
  // The latest painter (it closes over the current number format), refreshed before the effect below.
  const paintRef = useRef(paint);
  useLayoutEffect(() => {
    paintRef.current = paint;
  });
  const reduced = useReducedMotion();
  // Layout effect: the first frame (0) is painted before the browser shows the target.
  useLayoutEffect(() => {
    if (reduced) return;
    const key = `${target}|${play}`;
    if (shown.current === key) return;
    shown.current = key;
    let raf = 0;
    let finished = false;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_MS);
      paintRef.current(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else finished = true;
    };
    paintRef.current(0);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (finished) return;
      // Interrupted (unmount, a new target, StrictMode's re-run): settle on the target, and let a
      // re-run of the same count start over.
      shown.current = null;
      paintRef.current(target);
    };
  }, [target, play, reduced]);
}

/**
 * Score as a ring that fills from zero while the number counts up; colour follows the rating band.
 * `play` replays it (the card bumps it on hover and focus). Decorative — the card carries the label.
 */
export function ScoreRing({
  score,
  band,
  play,
  instant = false,
}: {
  score: number | null;
  band?: RatingBand;
  play: number;
  /** Show the final value on mount instead of counting up (see useCountUp). */
  instant?: boolean;
}) {
  const fmt = useFormat();
  const numRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<SVGCircleElement>(null);
  const target = score ?? 0;
  useCountUp(target, play, instant, (v) => {
    // The span's only child is this text, so React keeps setting textContent on the span itself
    // and writing it here never strands a node React still holds.
    if (numRef.current) numRef.current.textContent = fmt.number(Math.round(v));
    fillRef.current?.style.setProperty("stroke-dasharray", `${Math.max(v, 0.01)} 100`);
  });
  return (
    <div
      className={`score-ring${band ? ` score-ring-${band} score-band-${scoreBandClass(band)}` : ""}${score === null ? " is-empty" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120">
        <circle className="score-ring-track" cx="60" cy="60" r="52" pathLength={100} />
        {score !== null && (
          <circle
            ref={fillRef}
            className="score-ring-fill"
            cx="60"
            cy="60"
            r="52"
            pathLength={100}
            style={{ strokeDasharray: `${Math.max(target, 0.01)} 100` }}
          />
        )}
      </svg>
      <span className="score-ring-value">
        {score === null ? (
          "—"
        ) : (
          <>
            <span className="score-num" ref={numRef}>
              {fmt.number(Math.round(target))}
            </span>
            <small className="score-of">/100</small>
          </>
        )}
      </span>
    </div>
  );
}
