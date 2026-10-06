import { describe, expect, it } from "vitest";
import { estimateWidth, nearestIndex, pickAxisLabels } from "./trendAxis";
import type { AxisLabel } from "./trendAxis";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Checks at `times` (ms, UTC) drawn evenly across [left, right], as the chart does. */
function input(times: number[], width: number, measure = (s: string) => estimateWidth(s)) {
  const left = 40;
  const right = width - 28;
  const n = times.length;
  const xs = times.map((_, i) => (n === 1 ? (left + right) / 2 : left + (i / (n - 1)) * (right - left)));
  const d = times.map((t) => new Date(t));
  return {
    xs,
    dayKeys: d.map((x) => x.toISOString().slice(0, 10)),
    dateText: d.map((x) => `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`),
    timeText: d.map((x) => `${x.getUTCHours()}:${String(x.getUTCMinutes()).padStart(2, "0")}`),
    measure,
    minX: 0,
    maxX: width,
  };
}

const T0 = Date.UTC(2026, 6, 1, 9, 0);
const DAY = 86_400_000;
const MIN = 60_000;
const daily = (n: number) => Array.from({ length: n }, (_, i) => T0 + i * DAY);
const sameDay = (n: number) => Array.from({ length: n }, (_, i) => T0 + i * 3 * MIN);
const cluster = (n: number, perDay = 4) =>
  Array.from({ length: n }, (_, i) => T0 + Math.floor(i / perDay) * DAY + (i % perDay) * 7 * MIN);

function assertClean(labels: AxisLabel[], inp: ReturnType<typeof input>, gap = 8) {
  const n = inp.xs.length;
  const idx = labels.map((l) => l.index);
  expect(idx[0]).toBe(0);
  expect(idx[idx.length - 1]).toBe(n - 1);
  for (const row of [0, 1]) {
    const boxes = labels
      .filter((l) => l.row === row)
      .map((l) => {
        const w = inp.measure(l.text);
        return { l: l.x - w / 2, r: l.x + w / 2 };
      });
    for (const b of boxes) {
      expect(b.l).toBeGreaterThanOrEqual(inp.minX - 1e-6);
      expect(b.r).toBeLessThanOrEqual(inp.maxX + 1e-6);
    }
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].l - boxes[i - 1].r).toBeGreaterThanOrEqual(gap - 1e-6);
  }
}

describe("pickAxisLabels", () => {
  const widths = [280, 390, 640, 900, 1440];
  const shapes: [string, (n: number) => number[]][] = [
    ["daily", daily],
    ["same day", sameDay],
    ["4 a day", (n) => cluster(n)],
    ["weekly", (n) => Array.from({ length: n }, (_, i) => T0 + i * 7 * DAY)],
  ];
  for (const [name, gen] of shapes) {
    for (const n of [1, 2, 5, 20, 60]) {
      for (const w of widths) {
        it(`${name}, ${n} checks, ${w}px: first + last kept, no collisions, inside the axis`, () => {
          const inp = input(gen(n), w);
          const labels = pickAxisLabels(inp);
          assertClean(labels, inp);
          expect(labels.every((l) => l.row === 0)).toBe(true);
          // Labels never repeat.
          expect(new Set(labels.map((l) => l.text)).size).toBe(labels.length);
        });
      }
    }
  }

  it("labels every day when there is room", () => {
    const labels = pickAxisLabels(input(daily(5), 900));
    expect(labels.map((l) => l.text)).toEqual(["1 Jul", "2 Jul", "3 Jul", "4 Jul", "5 Jul"]);
  });

  it("thins days with an even stride when they do not fit", () => {
    const labels = pickAxisLabels(input(daily(60), 390));
    expect(labels.length).toBeGreaterThan(2);
    expect(labels.length).toBeLessThan(10);
    const steps = labels.slice(0, -1).map((l, i, a) => (i ? l.index - a[i - 1].index : null)).filter((s) => s !== null);
    expect(new Set(steps).size).toBeLessThanOrEqual(1);
  });

  it("uses times when every check is on one day, with the date on the first label", () => {
    const labels = pickAxisLabels(input(sameDay(5), 900));
    expect(labels[0].text).toBe("1 Jul 9:00");
    expect(labels.slice(1).map((l) => l.text)).toEqual(["9:03", "9:06", "9:09", "9:12"]);
  });

  it("adds times for extra checks on a labelled day (few days, synthetic bursts)", () => {
    // 3 checks on 28 Sep, 5 on 30 Sep - like the pilot's synthetic history.
    const a = Date.UTC(2026, 8, 28, 16, 43);
    const b = Date.UTC(2026, 8, 30, 10, 0);
    const times = [a, a + 164 * MIN, a + 165 * MIN, b, b + 20 * MIN, b + 40 * MIN, b + 60 * MIN, b + 80 * MIN];
    const labels = pickAxisLabels(input(times, 900));
    const texts = labels.map((l) => l.text);
    expect(texts[0]).toBe("28 Sep");
    expect(texts).toContain("30 Sep");
    expect(texts[texts.length - 1]).toBe("11:20"); // the last check: its day's date is already shown
    expect(texts.length).toBeGreaterThan(3);
  });

  it("gives the last check its date when its day's label was thinned away", () => {
    const labels = pickAxisLabels(input(cluster(60), 390));
    const last = labels[labels.length - 1];
    expect(last.text).toBe("15 Jul");
  });

  it("skips duplicate same-minute times", () => {
    const times = [T0, T0 + 10_000, T0 + 20_000, T0 + 5 * MIN];
    const labels = pickAxisLabels(input(times, 900));
    expect(new Set(labels.map((l) => l.text)).size).toBe(labels.length);
  });

  it("staggers the last label only when first and last cannot share a row", () => {
    const inp = input(daily(2), 120, (s) => s.length * 12);
    const labels = pickAxisLabels(inp);
    expect(labels.map((l) => l.row)).toEqual([0, 1]);
  });

  it("handles a single check and no checks", () => {
    expect(pickAxisLabels(input([T0], 390)).map((l) => l.text)).toEqual(["1 Jul"]);
    expect(pickAxisLabels(input([], 390))).toEqual([]);
  });
});

describe("nearestIndex", () => {
  const xs = [40, 100, 160, 220];

  it("picks the closest point", () => {
    expect(nearestIndex(42, xs)).toBe(0);
    expect(nearestIndex(129, xs)).toBe(1);
    expect(nearestIndex(131, xs)).toBe(2);
    expect(nearestIndex(220, xs)).toBe(3);
  });

  it("clamps to the ends outside the plot", () => {
    expect(nearestIndex(-500, xs)).toBe(0);
    expect(nearestIndex(9999, xs)).toBe(3);
  });

  it("breaks a tie towards the earlier point", () => {
    expect(nearestIndex(130, xs)).toBe(1);
  });

  it("handles one point and no points", () => {
    expect(nearestIndex(10, [50])).toBe(0);
    expect(nearestIndex(10, [])).toBe(-1);
  });

  it("matches a linear scan on uneven spacing", () => {
    const uneven = [0, 3, 4, 20, 21, 50, 90];
    for (let x = -5; x <= 95; x += 0.5) {
      let best = 0;
      for (let i = 1; i < uneven.length; i++) if (Math.abs(uneven[i] - x) < Math.abs(uneven[best] - x)) best = i;
      expect(nearestIndex(x, uneven)).toBe(best);
    }
  });
});
