import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { prefersReducedMotion } from "../../settings/motion";

/** How close to the bottom of the page counts as "there" — flips the arrow to point up. */
const BOTTOM_THRESHOLD_PX = 48;

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v16M6 14l6 6 6-6" />
    </svg>
  );
}

/**
 * Fixed bottom-right control, landing page only: scrolls one viewport down at a time, then flips
 * to point up once you're (near) the bottom so it can take you back to the top.
 */
export function ScrollFab() {
  const t = useT();
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setAtBottom(max <= 0 ? false : max - window.scrollY <= BOTTOM_THRESHOLD_PX);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const onClick = () => {
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
    if (atBottom) {
      window.scrollTo({ top: 0, behavior });
    } else {
      window.scrollBy({ top: window.innerHeight * 0.9, behavior });
    }
  };

  const label = atBottom ? t("common.nav.scrollTop") : t("common.nav.scrollDown");

  return (
    <button
      type="button"
      className={`lp-scroll-fab${atBottom ? " lp-scroll-fab-up" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <ArrowIcon />
    </button>
  );
}
