// Pure x-axis labelling for the trend chart: which checks get a label, what it says, and where it
// sits, so no two labels ever collide. Widths come from a `measure` callback (canvas measureText in
// the browser, an estimate in tests), so this stays free of DOM access.

export interface AxisLabel {
  /** Index of the check (point) this label belongs to. */
  index: number;
  text: string;
  /** Centre of the label (use textAnchor="middle"); already clamped inside [minX, maxX]. */
  x: number;
  /** 0 = normal row; 1 = second row (only when even the first and last labels cannot share a row). */
  row: 0 | 1;
}

export interface AxisInput {
  /** x position of each check, ascending. */
  xs: number[];
  /** Calendar-day key per check (e.g. "2026-09-30"); equal keys = same day. */
  dayKeys: string[];
  /** Short date per check ("12 Sep"). */
  dateText: string[];
  /** Short time per check ("2:05 pm"). */
  timeText: string[];
  /** Rendered width of a label in the same units as xs. */
  measure: (text: string) => number;
  minX: number;
  maxX: number;
  /** Minimum empty space between two labels. */
  gap?: number;
}

/** Rough width of an 11px label when no canvas is available (monospace-ish UI font). */
export function estimateWidth(text: string, fontPx = 11): number {
  return [...text].length * fontPx * 0.62;
}

interface Box {
  index: number;
  text: string;
  left: number;
  right: number;
}

/**
 * Pick non-colliding x-axis labels. The first and last checks are always labelled. Days come next:
 * the first check of every k-th day, with the smallest k that fits. When every day fits and there
 * are only a few days (common with synthetic data: several checks on one day), the other checks of a
 * labelled day get their time, as room allows. If all checks share one day, labels are times and the
 * first one also carries the date. Only when the first and last labels alone collide does the last
 * drop to a second row.
 */
export function pickAxisLabels(input: AxisInput): AxisLabel[] {
  const { xs, dayKeys, dateText, timeText, measure, minX, maxX } = input;
  const gap = input.gap ?? 8;
  const n = xs.length;
  if (n === 0) return [];

  const oneDay = dayKeys.every((d) => d === dayKeys[0]);
  const dayStarts: number[] = [];
  for (let i = 0; i < n; i++) if (i === 0 || dayKeys[i] !== dayKeys[i - 1]) dayStarts.push(i);
  const startOf = (i: number) => {
    let s = i;
    while (s > 0 && dayKeys[s - 1] === dayKeys[i]) s--;
    return s;
  };

  const box = (index: number, text: string): Box => {
    const w = measure(text);
    const left = Math.max(minX, Math.min(maxX - w, xs[index] - w / 2));
    return { index, text, left, right: left + w };
  };
  const clash = (a: Box, b: Box) => a.left < b.right + gap && b.left < a.right + gap;
  const fits = (b: Box, chosen: Box[]) => chosen.every((c) => !clash(b, c));
  const done = (chosen: Box[], rowOf: (b: Box) => 0 | 1 = () => 0): AxisLabel[] =>
    [...chosen]
      .sort((a, b) => a.index - b.index)
      .map((b) => ({ index: b.index, text: b.text, x: (b.left + b.right) / 2, row: rowOf(b) }));

  if (oneDay) {
    const first = box(0, n > 1 ? `${dateText[0]} ${timeText[0]}` : dateText[0]);
    if (n === 1) return done([first]);
    const last = box(n - 1, timeText[n - 1]);
    if (clash(first, last)) return done([first, last], (b) => (b.index === n - 1 ? 1 : 0));
    const chosen = [first, last];
    const seen = new Set([first.text, last.text, timeText[0]]);
    for (let i = 1; i < n - 1; i++) {
      if (seen.has(timeText[i])) continue; // two checks in the same minute: label once
      const b = box(i, timeText[i]);
      if (fits(b, chosen)) {
        chosen.push(b);
        seen.add(b.text);
      }
    }
    return done(chosen);
  }

  // Several days. Tier A: first check of every k-th day, smallest k that fits, plus the last check.
  // Stride = number of day starts always fits (only the first remains), so this loop terminates.
  const lastIsStart = dayStarts[dayStarts.length - 1] === n - 1;
  let chosen: Box[] = [];
  let stride = 1;
  for (; stride <= dayStarts.length; stride++) {
    const boxes = dayStarts
      .filter((i, j) => j % stride === 0 && i !== n - 1)
      .map((i) => box(i, dateText[i]));
    const dayShown = () => boxes.some((b) => dayKeys[b.index] === dayKeys[n - 1]);
    // The last check shows just its time when its day's date is already on the axis.
    let last = !lastIsStart && dayShown() ? box(n - 1, timeText[n - 1]) : box(n - 1, dateText[n - 1]);
    // Never drop the last label: drop the day labels crowding it instead (never the first).
    while (boxes.length > 1 && clash(boxes[boxes.length - 1], last)) boxes.pop();
    if (last.text !== dateText[n - 1] && !dayShown()) {
      last = box(n - 1, dateText[n - 1]);
      while (boxes.length > 1 && clash(boxes[boxes.length - 1], last)) boxes.pop();
    }
    if (boxes.every((b, j) => j === 0 || !clash(boxes[j - 1], b))) {
      if (clash(boxes[0], last)) return done([boxes[0], last], (b) => (b.index === n - 1 ? 1 : 0));
      chosen = [...boxes, last];
      break;
    }
  }

  // Tier B: times for the other checks of a labelled day, only when every day got its label and
  // there are few days (otherwise dates and times mixed on one axis read as noise).
  const distinctDays = dayStarts.length;
  if (stride === 1 && distinctDays <= 4) {
    const labelled = new Set(chosen.map((b) => b.index));
    const shownDays = new Set(chosen.filter((b) => b.text === dateText[b.index]).map((b) => dayKeys[b.index]));
    for (let i = 1; i < n - 1; i++) {
      if (labelled.has(i) || !shownDays.has(dayKeys[i])) continue;
      const s = startOf(i);
      if (s === i) continue;
      const sameDayTimes = chosen.filter((b) => dayKeys[b.index] === dayKeys[i]).map((b) => b.text);
      if (sameDayTimes.includes(timeText[i]) || timeText[i] === timeText[s]) continue;
      const b = box(i, timeText[i]);
      if (fits(b, chosen)) chosen.push(b);
    }
  }
  return done(chosen);
}
