import type { ModuleId } from "../module/modules";

// Pure geometry for the brand hub's live wires (LiveWires.tsx): where each cable starts and ends
// and the SVG path between them. Boxes are in the hub stage's coordinate space (px).

export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A module's slot around the centre card (hub reading order: TL, TR, BL, BR). */
export type Corner = "tl" | "tr" | "bl" | "br";

export const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

/** Where each module sits around the centre card (matches the hub's grid areas). */
export const CORNER_OF: Record<ModuleId, Corner> = {
  details: "tl",
  analysis: "tr",
  gaps: "bl",
  recommendations: "br",
};

/** "cables": modules at the four corners (desktop). "bus": centre card on top, 2×2 grid below (mobile). */
export type WireLayout = "cables" | "bus";

export interface WireGeom {
  /** SVG path data, from the centre card's port to the module's port. */
  d: string;
  start: Pt;
  end: Pt;
  /** Approximate path length in px (drives the spark's travel time, so every wire flows at one speed). */
  length: number;
}

const isLeft = (c: Corner) => c === "tl" || c === "bl";
const isTop = (c: Corner) => c === "tl" || c === "tr";
const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = (p: Pt) => `${r1(p.x)} ${r1(p.y)}`;

/** Where on the centre card's side a corner's cable plugs in (fraction of the card's height). */
export const PORT_FRACTION = { top: 0.36, bottom: 0.64 } as const;

function cubicLength(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 32): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const p = {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

/**
 * Desktop cable: leaves a port on the centre card's left/right side (upper port for the top
 * modules, lower for the bottom ones) and eases into the middle of the module's inner edge, with
 * horizontal tangents at both ends — the S-shape of a patch cable.
 */
export function cableWire(centre: Box, mod: Box, corner: Corner): WireGeom {
  const left = isLeft(corner);
  const start: Pt = {
    x: left ? centre.left : centre.left + centre.width,
    y: centre.top + centre.height * (isTop(corner) ? PORT_FRACTION.top : PORT_FRACTION.bottom),
  };
  const end: Pt = { x: left ? mod.left + mod.width : mod.left, y: mod.top + mod.height / 2 };
  const dir = left ? -1 : 1;
  const handle = Math.max(28, Math.abs(end.x - start.x) * 0.62);
  const c1: Pt = { x: start.x + dir * handle, y: start.y };
  const c2: Pt = { x: end.x - dir * handle, y: end.y };
  return {
    d: `M${pt(start)} C${pt(c1)} ${pt(c2)} ${pt(end)}`,
    start,
    end,
    length: cubicLength(start, c1, c2, end),
  };
}

/**
 * Mobile bus: one spine drops from the bottom-middle of the centre card down the gutter between
 * the two module columns, and each module taps off it with a short rounded elbow into its inner
 * edge. All four wires share the spine, so their current reads as one stream that branches.
 */
export function busWire(centre: Box, mod: Box, corner: Corner, spineX: number): WireGeom {
  const left = isLeft(corner);
  const start: Pt = { x: spineX, y: centre.top + centre.height };
  const end: Pt = { x: left ? mod.left + mod.width : mod.left, y: mod.top + mod.height / 2 };
  const run = Math.abs(end.x - start.x);
  const drop = end.y - start.y;
  const r = Math.max(0, Math.min(10, run, drop / 2));
  const dir = end.x < start.x ? -1 : 1;
  const d =
    r > 0
      ? `M${pt(start)} V${r1(end.y - r)} Q${pt({ x: start.x, y: end.y })} ${pt({ x: start.x + dir * r, y: end.y })} H${r1(end.x)}`
      : `M${pt(start)} V${r1(end.y)} H${r1(end.x)}`;
  // Straight runs plus a quarter-ish curve (a quadratic elbow is ~1.15× its radius per leg).
  const length = Math.max(0, drop - r) + Math.max(0, run - r) + (r > 0 ? r * 1.62 : 0);
  return { d, start, end, length };
}

/** Stacked (mobile) when every module sits below the centre card; corners around it otherwise. */
export function wireLayout(centre: Box, modules: Box[]): WireLayout {
  const bottom = centre.top + centre.height;
  return modules.length > 0 && modules.every((m) => m.top >= bottom - 1) ? "bus" : "cables";
}

/** The spine's x on mobile: halfway across the gutter between the left and right module columns. */
export function spineX(centre: Box, boxes: Partial<Record<Corner, Box>>): number {
  const l = boxes.tl ?? boxes.bl;
  const r = boxes.tr ?? boxes.br;
  if (l && r) return (l.left + l.width + r.left) / 2;
  return centre.left + centre.width / 2;
}

/** Every wire for the current layout (skipping modules that haven't been measured). */
export function computeWires(
  centre: Box,
  boxes: Partial<Record<Corner, Box>>,
): { layout: WireLayout; wires: Partial<Record<Corner, WireGeom>> } {
  const present = CORNERS.filter((c) => boxes[c]);
  const layout = wireLayout(
    centre,
    present.map((c) => boxes[c]!),
  );
  const x = spineX(centre, boxes);
  const wires: Partial<Record<Corner, WireGeom>> = {};
  for (const c of present) {
    wires[c] = layout === "bus" ? busWire(centre, boxes[c]!, c, x) : cableWire(centre, boxes[c]!, c);
  }
  return { layout, wires };
}

/** Spark ("data packet") speed along every wire, px/s — one speed, so longer wires take longer. */
export const SPARK_SPEED = 120;
/** Pause after a spark crosses the longest wire before that wire's next one leaves, s. */
export const SPARK_REST = 2.5;
/** The spark pattern's period is rounded up to a multiple of this, px. */
const SPARK_STEP = 60;

/**
 * The spark's dash period, px: each wire carries one spark per `period` of travel, so at
 * SPARK_SPEED it crosses the longest wire and then rests ~SPARK_REST before the next one leaves
 * (shorter wires rest a little longer). The same for every wire and quantised, so a card settling
 * a few px (fonts, data landing) doesn't change it — the running animation never jumps.
 */
export function sparkPeriod(lengths: number[]): number {
  const longest = Math.max(0, ...lengths);
  return Math.ceil((longest + SPARK_SPEED * SPARK_REST) / SPARK_STEP) * SPARK_STEP;
}
