import { describe, expect, it } from "vitest";
import type { Gap } from "../../api/types";
import { countGapTypes, sparkPoints } from "./previewMath";
import { PORT_FRACTION, busWire, cableWire, computeWires, spineX, wireLayout } from "./wireGeometry";
import type { Box } from "./wireGeometry";

// Desktop: a 300×400 centre card with a 300×200 module in each corner, 100px gutters.
const centre: Box = { left: 400, top: 100, width: 300, height: 400 };
const tl: Box = { left: 0, top: 0, width: 300, height: 200 };
const tr: Box = { left: 800, top: 0, width: 300, height: 200 };
const bl: Box = { left: 0, top: 400, width: 300, height: 200 };
const br: Box = { left: 800, top: 400, width: 300, height: 200 };

describe("cableWire", () => {
  it("runs from the centre card's left side to a left module's right edge", () => {
    const w = cableWire(centre, tl, "tl");
    expect(w.start).toEqual({ x: 400, y: 100 + 400 * PORT_FRACTION.top });
    expect(w.end).toEqual({ x: 300, y: 100 });
    expect(w.d.startsWith("M400 244 C")).toBe(true);
    expect(w.d.endsWith("300 100")).toBe(true);
  });

  it("runs from the right side for right modules, using the lower port for bottom ones", () => {
    const w = cableWire(centre, br, "br");
    expect(w.start).toEqual({ x: 700, y: 100 + 400 * PORT_FRACTION.bottom });
    expect(w.end).toEqual({ x: 800, y: 500 });
  });

  it("leaves and enters horizontally (control points level with each end)", () => {
    const w = cableWire(centre, tr, "tr");
    const nums = w.d.replace(/[MC]/g, " ").trim().split(/\s+/).map(Number);
    // M sx sy C c1x c1y c2x c2y ex ey
    expect(nums[3]).toBe(w.start.y);
    expect(nums[2]).toBeGreaterThan(w.start.x);
    expect(nums[5]).toBe(w.end.y);
    expect(nums[4]).toBeLessThan(w.end.x);
  });

  it("measures a length at least the straight-line distance", () => {
    const w = cableWire(centre, bl, "bl");
    const straight = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
    expect(w.length).toBeGreaterThanOrEqual(straight);
    expect(w.length).toBeLessThan(straight * 1.6);
  });

  it("is mirror-symmetric for mirrored modules", () => {
    const a = cableWire(centre, tl, "tl");
    const b = cableWire(centre, tr, "tr");
    const mid = centre.left + centre.width / 2;
    expect(mid - a.start.x).toBeCloseTo(b.start.x - mid);
    expect(mid - a.end.x).toBeCloseTo(b.end.x - mid);
    expect(a.length).toBeCloseTo(b.length);
  });
});

describe("stacked (mobile) layout", () => {
  const top: Box = { left: 0, top: 0, width: 350, height: 360 };
  const m = {
    tl: { left: 0, top: 400, width: 160, height: 150 },
    tr: { left: 190, top: 400, width: 160, height: 150 },
    bl: { left: 0, top: 570, width: 160, height: 150 },
    br: { left: 190, top: 570, width: 160, height: 150 },
  } satisfies Record<string, Box>;

  it("is detected when every module sits below the centre card", () => {
    expect(wireLayout(top, Object.values(m))).toBe("bus");
    expect(wireLayout(centre, [tl, tr, bl, br])).toBe("cables");
    expect(wireLayout(centre, [])).toBe("cables");
  });

  it("puts the spine in the middle of the gutter", () => {
    expect(spineX(top, m)).toBe(175);
    expect(spineX(top, {})).toBe(175);
  });

  it("drops down the spine and elbows into the module's inner edge", () => {
    const w = busWire(top, m.tr, "tr", 175);
    expect(w.start).toEqual({ x: 175, y: 360 });
    expect(w.end).toEqual({ x: 190, y: 475 });
    expect(w.d).toMatch(/^M175 360 V\d+(\.\d)? Q175 475 18\d(\.\d)? 475 H190$/);
    expect(w.length).toBeGreaterThan(115);
    expect(w.length).toBeLessThan(135);
  });

  it("gives every wire the same start, so the four share one port", () => {
    const { layout, wires } = computeWires(top, m);
    expect(layout).toBe("bus");
    const starts = Object.values(wires).map((w) => `${w!.start.x},${w!.start.y}`);
    expect(starts).toHaveLength(4);
    expect(new Set(starts).size).toBe(1);
  });

  it("skips modules that haven't been measured", () => {
    const { wires } = computeWires(centre, { tl, br });
    expect(Object.keys(wires).sort()).toEqual(["br", "tl"]);
  });
});

describe("sparkPoints", () => {
  it("spans the box left → right, higher scores higher up", () => {
    const pts = sparkPoints([20, 50, 35], 100, 40, 4);
    expect(pts[0].x).toBe(4);
    expect(pts[2].x).toBe(96);
    expect(pts[1].y).toBeLessThan(pts[2].y);
    expect(pts[2].y).toBeLessThan(pts[0].y);
    expect(Math.min(...pts.map((p) => p.y))).toBeGreaterThanOrEqual(4);
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThanOrEqual(36);
  });

  it("centres a flat series vertically", () => {
    const pts = sparkPoints([40, 40, 40], 100, 40, 0);
    for (const p of pts) expect(p.y).toBe(20);
  });

  it("handles no data", () => {
    expect(sparkPoints([], 100, 40)).toEqual([]);
  });
});

describe("countGapTypes", () => {
  const gap = (gap_type: string): Gap => ({ gap_id: gap_type, gap_type, evidence_refs: [], detail: {}, is_inferred: false });

  it("counts per type in first-seen order", () => {
    expect(countGapTypes([gap("presence"), gap("competitive"), gap("presence")])).toEqual([
      ["presence", 2],
      ["competitive", 1],
    ]);
    expect(countGapTypes([])).toEqual([]);
  });
});
