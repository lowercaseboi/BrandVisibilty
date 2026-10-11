/** The four module pages (and Campaign Studio, which lives under Recommendations). */
const MODULE_ROUTE = /^\/brands\/[^/]+\/(details|analysis|gaps|recommendations)(\/|$)/;

/**
 * Whether the cursor glow on the dot grid is shown here. It runs on the landing, the brand list and
 * the brand hub, and is switched off inside the modules (Details, Analysis, Gaps & Evidence,
 * Recommendation Engine) where it would only distract from the work.
 */
export function spotlightEnabled(pathname: string): boolean {
  return !MODULE_ROUTE.test(pathname);
}
