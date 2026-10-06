// Index math for the phone Board's swipeable status lanes (RecLanes.tsx). Pure, so it is unit-tested.

/** The lane the scroller is (closest to) showing: rounded, clamped to [0, laneCount - 1]. */
export function laneIndexFromScroll(scrollLeft: number, laneWidth: number, laneCount: number): number {
  if (laneCount <= 0 || !(laneWidth > 0) || !Number.isFinite(scrollLeft)) return 0;
  return Math.min(laneCount - 1, Math.max(0, Math.round(scrollLeft / laneWidth)));
}

/**
 * The lanes on screen mid-swipe: the one to the left and the one to the right of the scroll
 * position (the same lane twice once it has settled within `tolerance` px of a snap point).
 */
export function lanesInView(scrollLeft: number, laneWidth: number, laneCount: number, tolerance = 2): [number, number] {
  if (laneCount <= 0 || !(laneWidth > 0) || !Number.isFinite(scrollLeft)) return [0, 0];
  const settled = laneIndexFromScroll(scrollLeft, laneWidth, laneCount);
  if (Math.abs(scrollLeft - settled * laneWidth) <= tolerance) return [settled, settled];
  const clamp = (i: number) => Math.min(laneCount - 1, Math.max(0, i));
  const pos = scrollLeft / laneWidth;
  return [clamp(Math.floor(pos)), clamp(Math.ceil(pos))];
}
