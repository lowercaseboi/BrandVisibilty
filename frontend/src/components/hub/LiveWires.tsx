import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { ModuleId } from "../module/modules";
import { CORNER_OF, computeWires } from "./wireGeometry";
import type { Box, Corner, WireGeom, WireLayout } from "./wireGeometry";

/** Spark ("data packet") speed along every wire, px/s — one speed, so longer wires take longer. */
const SPARK_SPEED = 150;
/** Pause between sparks on one wire, s. */
const SPARK_REST = 1.6;

interface Geometry {
  w: number;
  h: number;
  layout: WireLayout;
  wires: { id: ModuleId; index: number; geom: WireGeom }[];
}

/**
 * The element's layout box relative to the stage. Offsets ignore CSS transforms, so the wires
 * attach to where a card rests, not where the tilt or its pop-in animation momentarily moves it.
 */
function boxWithin(el: HTMLElement, stage: HTMLElement): Box {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== stage) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== stage) {
    // The stage isn't an offset ancestor (it should be position: relative) — fall back to rects.
    const r = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
  }
  return { left, top, width: el.offsetWidth, height: el.offsetHeight };
}

function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** One module's port: a socket ring with a lit core and a halo that pulses outward. */
function Port({ x, y, className = "" }: { x: number; y: number; className?: string }) {
  return (
    <g className={`hub-port ${className}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <g className="hub-port-body">
        <circle className="hub-port-halo" r={6} />
        <circle className="hub-port-ring" r={4.4} />
        <circle className="hub-port-core" r={2} />
      </g>
    </g>
  );
}

/**
 * "Live wire" cables from the hub's centre card to its four module cards, drawn in an SVG laid
 * over the stage (pointer-events: none). Each wire is a dim cable with a glowing core that draws
 * itself in once its module has popped in, then carries current: bright dashes flowing from the
 * brand card outward, plus a spark that races along it every couple of seconds. The wire of the
 * hovered/focused module (`active`) runs hotter and faster while the others dim.
 *
 * Geometry is re-measured with a ResizeObserver on the stage and every card, when fonts load, and
 * after any animation in the stage ends. Under reduced motion the wires are static and glowing.
 */
export function LiveWires({
  stageRef,
  centreRef,
  moduleRefs,
  active,
}: {
  stageRef: RefObject<HTMLElement | null>;
  centreRef: RefObject<HTMLElement | null>;
  moduleRefs: RefObject<Partial<Record<ModuleId, HTMLElement | null>>>;
  active: ModuleId | null;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const reduced = usePrefersReducedMotion();
  const [geo, setGeo] = useState<Geometry | null>(null);

  const measure = useCallback(() => {
    const stage = stageRef.current;
    const centre = centreRef.current;
    if (!stage || !centre) return;
    const els = moduleRefs.current ?? {};
    const ids = (Object.keys(CORNER_OF) as ModuleId[]).filter((id) => els[id]);
    const boxes: Partial<Record<Corner, Box>> = {};
    for (const id of ids) boxes[CORNER_OF[id]] = boxWithin(els[id]!, stage);
    const { layout, wires } = computeWires(boxWithin(centre, stage), boxes);
    const next: Geometry = {
      w: stage.clientWidth,
      h: stage.clientHeight,
      layout,
      wires: ids.map((id, index) => ({ id, index, geom: wires[CORNER_OF[id]]! })),
    };
    setGeo((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [stageRef, centreRef, moduleRefs]);

  // Re-measure after every render (cheap; state only changes when the geometry does) and make sure
  // the observer follows the current cards — e.g. the skeleton centre card swapped for the real one.
  const observer = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    measure();
    const ro = observer.current;
    if (!ro) return;
    if (centreRef.current) ro.observe(centreRef.current);
    for (const el of Object.values(moduleRefs.current ?? {})) if (el) ro.observe(el);
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    observer.current = ro;
    ro.observe(stage);
    if (centreRef.current) ro.observe(centreRef.current);
    for (const el of Object.values(moduleRefs.current ?? {})) if (el) ro.observe(el);
    // Cards finish their pop-in (and fonts swap in) after the first measure — settle again then.
    stage.addEventListener("animationend", schedule);
    document.fonts?.ready.then(schedule).catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      observer.current = null;
      stage.removeEventListener("animationend", schedule);
    };
  }, [measure, stageRef, centreRef, moduleRefs]);

  if (!geo || geo.wires.length === 0) return null;

  const glow = `hub-glow-${uid}`;
  const glowHot = `hub-glow-hot-${uid}`;
  const shared = geo.layout === "bus" ? geo.wires[0].geom.start : null;

  return (
    <svg
      className="hub-wires"
      data-layout={geo.layout}
      data-active={active ?? undefined}
      width={geo.w}
      height={geo.h}
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* User-space filter regions: a straight (zero-width) run would otherwise get no glow. */}
        <filter id={glow} filterUnits="userSpaceOnUse" x={-40} y={-40} width={geo.w + 80} height={geo.h + 80}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="soft" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="wide" />
          <feMerge>
            <feMergeNode in="wide" />
            <feMergeNode in="soft" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={glowHot} filterUnits="userSpaceOnUse" x={-40} y={-40} width={geo.w + 80} height={geo.h + 80}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="soft" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="wide" />
          <feMerge>
            <feMergeNode in="wide" />
            <feMergeNode in="wide" />
            <feMergeNode in="soft" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {geo.wires.map(({ id, index, geom }) => {
        const pathId = `hub-wire-${uid}-${id}`;
        const travel = Math.max(0.6, geom.length / SPARK_SPEED);
        const cycle = travel + SPARK_REST;
        const k = (travel / cycle).toFixed(3);
        return (
          <g
            key={id}
            className={`hub-wire${active === id ? " is-active" : ""}`}
            data-id={id}
            style={{ "--i": index } as CSSProperties}
          >
            <path className="hub-wire-sheath" d={geom.d} pathLength={1} />
            <path id={pathId} className="hub-wire-base" d={geom.d} pathLength={1} />
            <g className="hub-wire-glow" filter={`url(#${glow})`}>
              <path className="hub-wire-core" d={geom.d} pathLength={1} />
            </g>
            {!reduced && (
              <g className="hub-wire-flow">
                <g filter={`url(#${glowHot})`}>
                  <path className="hub-wire-pulse" d={geom.d} />
                  <path className="hub-wire-pulse hub-wire-pulse-boost" d={geom.d} />
                  <circle className="hub-wire-spark" r={2.4} opacity={0}>
                    <animateMotion
                      dur={`${cycle.toFixed(2)}s`}
                      begin={`${(index * 0.45).toFixed(2)}s`}
                      repeatCount="indefinite"
                      keyPoints="0;1;1"
                      keyTimes={`0;${k};1`}
                      calcMode="linear"
                    >
                      <mpath href={`#${pathId}`} />
                    </animateMotion>
                    <animate
                      attributeName="opacity"
                      dur={`${cycle.toFixed(2)}s`}
                      begin={`${(index * 0.45).toFixed(2)}s`}
                      repeatCount="indefinite"
                      values="0;1;1;0;0"
                      keyTimes={`0;0.04;${(Number(k) * 0.92).toFixed(3)};${k};1`}
                    />
                  </circle>
                </g>
              </g>
            )}
            {!shared && <Port x={geom.start.x} y={geom.start.y} className="hub-port-start" />}
            <Port x={geom.end.x} y={geom.end.y} className="hub-port-end" />
          </g>
        );
      })}
      {shared && <Port x={shared.x} y={shared.y} className="hub-port-start hub-port-shared" />}
    </svg>
  );
}
