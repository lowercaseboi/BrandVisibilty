import { useEffect, useState, useRef } from "react";
import type { RatingBand } from "../format";
import { scoreBandClass } from "../format";
import { useFormat } from "../i18n";

const COUNT_MS = 1100;

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Counts 0 → target (ease-out) each time `play` changes; jumps straight to the target under reduced
 * motion. `instant` starts at the target on mount (no first count-up), e.g. when a view-transition
 * morph carries an already-counted ring from one page to the next. */
function useCountUp(target: number, play: number, instant = false): number {
  const [value, setValue] = useState(() => (instant ? target : 0));
  const skipFirst = useRef(instant);
  const reduced = prefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_MS);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, play, reduced]);
  return reduced ? target : value;
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
  const value = useCountUp(score ?? 0, play, instant);
  return (
    <div
      className={`score-ring${band ? ` score-ring-${band} score-band-${scoreBandClass(band)}` : ""}${score === null ? " is-empty" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120">
        <circle className="score-ring-track" cx="60" cy="60" r="52" pathLength={100} />
        {score !== null && (
          <circle
            className="score-ring-fill"
            cx="60"
            cy="60"
            r="52"
            pathLength={100}
            style={{ strokeDasharray: `${Math.max(value, 0.01)} 100` }}
          />
        )}
      </svg>
      <span className="score-ring-value">
        {score === null ? (
          "—"
        ) : (
          <>
            <span className="score-num">{fmt.number(Math.round(value))}</span>
            <small className="score-of">/100</small>
          </>
        )}
      </span>
    </div>
  );
}
