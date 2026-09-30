import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../settings/motion";

/**
 * True once this element has scrolled into the viewport; stays true afterwards (reveals once).
 * Skips the wait — and the animation — under reduced motion or when IntersectionObserver isn't available.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || reduced) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [reduced]);

  return { ref, visible };
}
