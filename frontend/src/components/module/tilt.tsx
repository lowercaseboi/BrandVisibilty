/* oxlint-disable react/only-export-components -- pure helper, hook and component belong together */
import { useCallback, useRef } from "react";
import type { HTMLAttributes, PointerEvent, ReactNode } from "react";

export interface Tilt {
  /** Degrees around the X axis (positive tips the top edge away). */
  rx: number;
  /** Degrees around the Y axis. */
  ry: number;
  /** Translation toward the cursor, px. */
  tx: number;
  ty: number;
  /** Cursor position within the card, 0–100 (%), for the specular glare. */
  mx: number;
  my: number;
}

/** Pure: pointer position inside a w×h box → tilt. The card leans toward the cursor. */
export function tiltFromPointer(x: number, y: number, w: number, h: number, maxDeg = 10, maxShift = 6): Tilt {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const nx = w > 0 ? clamp((x / w) * 2 - 1) : 0; // -1 (left) … 1 (right)
  const ny = h > 0 ? clamp((y / h) * 2 - 1) : 0; // -1 (top) … 1 (bottom)
  return {
    rx: -ny * maxDeg,
    ry: nx * maxDeg,
    tx: nx * maxShift,
    ty: ny * maxShift,
    mx: ((nx + 1) / 2) * 100,
    my: ((ny + 1) / 2) * 100,
  };
}

const canTilt = () =>
  typeof window !== "undefined" &&
  !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches &&
  !window.matchMedia?.("(pointer: coarse)").matches;

/**
 * 3D glass hover: writes --rx/--ry/--tx/--ty/--mx/--my on the element (modules.css `.tilt`) on
 * pointer move and clears them on leave, so the card springs back via CSS transition. No React
 * state, so moving the cursor never re-renders. Off for reduced motion and touch pointers.
 */
export function useTilt<T extends HTMLElement>(maxDeg = 10, maxShift = 6) {
  const ref = useRef<T | null>(null);
  const frame = useRef(0);

  const onPointerMove = useCallback(
    (e: PointerEvent<T>) => {
      const el = ref.current;
      if (!el || !canTilt()) return;
      const r = el.getBoundingClientRect();
      const t = tiltFromPointer(e.clientX - r.left, e.clientY - r.top, r.width, r.height, maxDeg, maxShift);
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        el.style.setProperty("--rx", `${t.rx.toFixed(2)}deg`);
        el.style.setProperty("--ry", `${t.ry.toFixed(2)}deg`);
        el.style.setProperty("--tx", `${t.tx.toFixed(1)}px`);
        el.style.setProperty("--ty", `${t.ty.toFixed(1)}px`);
        el.style.setProperty("--mx", `${t.mx.toFixed(1)}%`);
        el.style.setProperty("--my", `${t.my.toFixed(1)}%`);
        el.dataset.tilting = "";
      });
    },
    [maxDeg, maxShift],
  );

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    for (const p of ["--rx", "--ry", "--tx", "--ty", "--mx", "--my"]) el.style.removeProperty(p);
    delete el.dataset.tilting;
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}

/**
 * A 3D-tilting frosted-glass card. `.tilt` holds the perspective; `.tilt-inner` is the glass
 * surface that rotates/translates; `.tilt-glare` is the moving specular highlight.
 */
export function TiltCard({
  children,
  className = "",
  innerClassName = "",
  maxDeg,
  maxShift,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  innerClassName?: string;
  maxDeg?: number;
  maxShift?: number;
}) {
  const { ref, onPointerMove, onPointerLeave } = useTilt<HTMLDivElement>(maxDeg, maxShift);
  return (
    <div ref={ref} className={`tilt ${className}`} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} {...rest}>
      <div className={`tilt-inner ${innerClassName}`}>
        {children}
        <span className="tilt-glare" aria-hidden="true" />
      </div>
    </div>
  );
}
