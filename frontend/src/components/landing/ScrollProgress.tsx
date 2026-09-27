import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * A hairline amber bar fixed just under the header, filling left-to-right with how far down the
 * page you've scrolled. Measures the header's own height so it sits flush beneath it without this
 * file touching AppHeader. Skipped under reduced motion.
 */
export function ScrollProgress() {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState(0);

  useEffect(() => {
    const header = document.querySelector(".app-header");
    const measure = () => setTop(header instanceof HTMLElement ? header.getBoundingClientRect().height : 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const fill = fillRef.current;
    if (!fill) return;
    let raf = 0;
    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      fill.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="lp-scroll-progress" style={{ top }} aria-hidden="true">
      <div ref={fillRef} className="lp-scroll-progress-fill" />
    </div>
  );
}
