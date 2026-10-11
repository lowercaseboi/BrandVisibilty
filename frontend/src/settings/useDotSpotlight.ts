import { useEffect } from "react";
import { prefersReducedMotion } from "./motion";
import { useMediaQuery } from "./useMediaQuery";

/**
 * The cursor glow on the page's dot grid (base.css `body::after`). Only for a real mouse — touch
 * has no hover. It eases toward the pointer (instantly under reduced motion) by writing
 * `--spot-x/--spot-y` on <html> and toggling `html.is-pointing`; React never re-renders. `enabled`
 * switches it off per route (spotlightRoutes.ts).
 */
export function useDotSpotlight(enabled = true): void {
  const fine = useMediaQuery("(hover: hover) and (pointer: fine)");
  useEffect(() => {
    if (!fine || !enabled) return;
    const root = document.documentElement;
    const smooth = !prefersReducedMotion();
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const paint = () => {
      x += (tx - x) * (smooth ? 0.18 : 1);
      y += (ty - y) * (smooth ? 0.18 : 1);
      root.style.setProperty("--spot-x", `${x.toFixed(1)}px`);
      root.style.setProperty("--spot-y", `${y.toFixed(1)}px`);
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(paint) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (!root.classList.contains("is-pointing")) {
        x = tx = e.clientX;
        y = ty = e.clientY;
        root.classList.add("is-pointing");
      }
      tx = e.clientX;
      ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => root.classList.remove("is-pointing");
    window.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      root.classList.remove("is-pointing");
    };
  }, [fine, enabled]);
}
