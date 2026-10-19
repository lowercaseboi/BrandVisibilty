/** Pull-down distance (as a share of the sheet's height) that dismisses a bottom sheet. */
export const DISMISS_SHARE = 0.3;
/** A quick flick dismisses sooner: this fast (px/ms), once it has moved at least FLICK_MIN_PX. */
export const FLICK_SPEED = 0.5;
export const FLICK_MIN_PX = 24;

/**
 * Should a drag on the sheet's handle close it? `dy` is how far it was pulled down (px; negative
 * when pushed up), `height` the sheet's height, `velocity` the release speed in px/ms (downward > 0).
 */
export function shouldDismissSheet(dy: number, height: number, velocity: number): boolean {
  if (dy <= 0 || height <= 0) return false;
  if (dy >= height * DISMISS_SHARE) return true;
  return velocity >= FLICK_SPEED && dy >= FLICK_MIN_PX;
}

/** The sheet's offset while dragging: follows the finger down, resists (rubber-bands) going up. */
export function dragOffset(dy: number): number {
  return dy >= 0 ? dy : -Math.sqrt(-dy) * 2;
}
