import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { ModuleId } from "../module/modules";
import { CORNER_OF, SPARK_SPEED, computeWires, sparkPeriod } from "./wireGeometry";
import type { Box, Corner, WireGeom, WireLayout } from "./wireGeometry";

/** A spark's trailing streak, px. */
const SPARK_TAIL = 16;
/** How much faster the hovered/focused wire's current (dashes and spark) flows. */
const ACTIVE_RATE = 1.4;
/** Room for the glow around a wire's own box: the wide blur is stdDeviation 7 (≈ 3σ = 21px) plus the stroke. */
const GLOW_PAD = 32;

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

/** A wire's filter region: the box spanning its two ports (every wire stays inside it), padded for the glow. */
function glowRegion(geom: WireGeom) {
  const x = Math.min(geom.start.x, geom.end.x) - GLOW_PAD;
  const y = Math.min(geom.start.y, geom.end.y) - GLOW_PAD;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.ceil(Math.abs(geom.end.x - geom.start.x) + 2 * GLOW_PAD),
    height: Math.ceil(Math.abs(geom.end.y - geom.start.y) + 2 * GLOW_PAD),
  };
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
 * itself out of the brand card as its module emerges, then carries current: bright dashes flowing
 * from the brand card outward, plus a spark that shoots along it every few seconds (the wires take
 * turns). The wire of the hovered/focused module (`active`) runs hotter and ~1.4× faster while the
 * others dim. Everything that moves is a CSS animation of stroke-dashoffset (hub.css), so nothing
 * restarts when React re-renders or the geometry is re-measured.
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
  const svgRef = useRef<SVGSVGElement | null>(null);

  const measure = useCallback(() => {
    const centre = centreRef.current;
    // On the first commit this layout effect runs before the stage's own ref is attached (React
    // attaches refs child-first), so find it from the centre card — otherwise the wires would only
    // appear on some later render, a beat after the cards.
    const stage = stageRef.current ?? centre?.closest<HTMLElement>(".hub-stage") ?? null;
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

  // The active wire's current speeds up in place: changing the CSS duration instead would jump the
  // dashes to a different phase, so nudge the running animations' playback rate (keeps position).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || reduced) return;
    for (const g of svg.querySelectorAll<SVGGElement>(".hub-wire")) {
      const rate = g.dataset.id === active ? ACTIVE_RATE : 1;
      for (const path of g.querySelectorAll(".hub-wire-flow path")) {
        for (const anim of path.getAnimations?.() ?? []) {
          if (anim.playbackRate !== rate) anim.updatePlaybackRate(rate);
        }
      }
    }
  }, [active, reduced, geo]);

  if (!geo || geo.wires.length === 0) return null;

  const shared = geo.layout === "bus" ? geo.wires[0].geom.start : null;
  const period = sparkPeriod(geo.wires.map((w) => w.geom.length));
  const sparkDur = period / SPARK_SPEED;

  return (
    <svg
      ref={svgRef}
      className="hub-wires"
      data-layout={geo.layout}
      data-active={active ?? undefined}
      style={{ "--spark-p": `${period}px`, "--spark-dur": `${sparkDur.toFixed(3)}s`, "--spark-tail": `${SPARK_TAIL}px` } as CSSProperties}
      width={geo.w}
      height={geo.h}
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* One pair of glow filters per wire, its region just the wire's own box (user space, so a
            straight zero-height run still glows). A whole-stage region would make every animated
            dash re-blur and repaint the entire stage each frame. */}
        {geo.wires.map(({ id, geom }) => {
          const r = glowRegion(geom);
          return (
            <Fragment key={id}>
              <filter id={`hub-glow-${uid}-${id}`} filterUnits="userSpaceOnUse" {...r}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="soft" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="wide" />
                <feMerge>
                  <feMergeNode in="wide" />
                  <feMergeNode in="soft" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id={`hub-glow-hot-${uid}-${id}`} filterUnits="userSpaceOnUse" {...r}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="soft" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="wide" />
                <feMerge>
                  <feMergeNode in="wide" />
                  <feMergeNode in="wide" />
                  <feMergeNode in="soft" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </Fragment>
          );
        })}
      </defs>

      {geo.wires.map(({ id, index, geom }) => (
        <g
          key={id}
          className={`hub-wire${active === id ? " is-active" : ""}`}
          data-id={id}
          style={{ "--i": index } as CSSProperties}
        >
          <path className="hub-wire-sheath" d={geom.d} pathLength={1} />
          <path className="hub-wire-base" d={geom.d} pathLength={1} />
          <g className="hub-wire-glow" filter={`url(#hub-glow-${uid}-${id})`}>
            <path className="hub-wire-core" d={geom.d} pathLength={1} />
          </g>
          {!reduced && (
            <g className="hub-wire-flow">
              <g filter={`url(#hub-glow-hot-${uid}-${id})`}>
                <path className="hub-wire-pulse" d={geom.d} />
                <path className="hub-wire-pulse hub-wire-pulse-boost" d={geom.d} />
                {/* The spark: a round-capped zero-length dash (plus a short streak behind it) whose
                    pattern repeats every `period` px, slid along by stroke-dashoffset — a plain CSS
                    animation, so it never restarts on a re-render or re-measure. */}
                <path
                  className="hub-wire-spark-tail"
                  d={geom.d}
                  style={{ strokeDasharray: `${SPARK_TAIL} ${period - SPARK_TAIL}` }}
                />
                <path className="hub-wire-spark" d={geom.d} style={{ strokeDasharray: `0 ${period}` }} />
              </g>
            </g>
          )}
          {!shared && <Port x={geom.start.x} y={geom.start.y} className="hub-port-start" />}
          <Port x={geom.end.x} y={geom.end.y} className="hub-port-end" />
        </g>
      ))}
      {shared && <Port x={shared.x} y={shared.y} className="hub-port-start hub-port-shared" />}
    </svg>
  );
}
