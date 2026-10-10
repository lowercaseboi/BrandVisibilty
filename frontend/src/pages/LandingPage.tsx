import { useEffect, useLayoutEffect, useRef } from "react";
import "../styles/landing.css";
import { AppHeader } from "../components/AppHeader";
import { Features } from "../components/landing/Features";
import { Hero } from "../components/landing/Hero";
import { LandingFooter } from "../components/landing/LandingFooter";
import { Sample } from "../components/landing/Sample";
import { ScrollFab } from "../components/landing/ScrollFab";
import { ScrollProgress } from "../components/landing/ScrollProgress";
import { WhyItMatters } from "../components/landing/WhyItMatters";
import { Workflow } from "../components/landing/Workflow";

/**
 * Public marketing page at "/". Measures how often AI assistants recommend a brand for real
 * customer questions.
 *
 * One continuous surface that follows the light/dark toggle, with a faint dot grid behind it: each
 * module fills one window, separated by a visible hairline rather than alternating bands. landing.css
 * flattens the shared chrome (frames, offset shadows, crop marks) and scales type/spacing to 1.2x on
 * desktop under `.lp` only, so the app pages keep their own look.
 */
export function LandingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // The CSS --header-h (base.css) assumes a one-line header, but on phones the slogan wraps and the
  // landing header grows. Publish the measured height so everything that sticks or snaps under the
  // header (the pinned workflow, one-window sections, anchor offsets) uses the real one.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const header = root?.querySelector(".app-header");
    if (!root || !(header instanceof HTMLElement)) return;
    const sync = () => root.style.setProperty("--header-h", `${header.getBoundingClientRect().height}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // Cursor-reactive dot grid (landing.css `.lp::after`): a real mouse only — touch has no hover.
  // The spotlight eases toward the pointer; only --mx/--my and a class change, so React never re-renders.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const paint = () => {
      x += (tx - x) * (smooth ? 0.18 : 1);
      y += (ty - y) * (smooth ? 0.18 : 1);
      root.style.setProperty("--mx", `${x.toFixed(1)}px`);
      root.style.setProperty("--my", `${y.toFixed(1)}px`);
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
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="lp" ref={rootRef}>
      <ScrollProgress />
      <AppHeader variant="landing" />
      <main>
        <Hero />
        <WhyItMatters />
        <Workflow />
        <Sample />
        <Features />
      </main>
      <LandingFooter />
      <ScrollFab />
    </div>
  );
}
