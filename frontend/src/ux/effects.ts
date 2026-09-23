// Global, component-agnostic UX layer: scroll reveals, number count-ups,
// pointer spotlight on cards, button ripples and a scrolled header state.
// Works on whatever React renders by watching the DOM, so pages stay unchanged.

const REVEAL = [
  ".card", ".metric-card", ".brand-card", ".rec-card", ".obs-card", ".alert",
  ".gap-list > *", ".trend", ".table", ".run-panel", ".legend-card", ".page-head", "section > h2",
].join(",");
const COUNT = ".metric-value, .brand-card-score-value, .kv-value, .count, .trend-value";
const SPOT = ".card, .metric-card, .brand-card, .rec-card, .obs-card, .run-panel";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const seen = new WeakSet<Element>();
const counted = new WeakMap<Element, string>();
const animating = new WeakSet<Element>();

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      el.classList.add("is-in");
      io.unobserve(el);
      setTimeout(() => {
        el.classList.remove("reveal", "is-in");
        el.style.removeProperty("--stagger");
      }, 1200);
    }
  },
  { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
);

function reveal(el: HTMLElement) {
  if (seen.has(el)) return;
  seen.add(el);
  const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
  const idx = Math.max(0, siblings.indexOf(el));
  el.style.setProperty("--stagger", `${Math.min(idx, 8) * 55}ms`);
  el.classList.add("reveal");
  io.observe(el);
}

const NUM = /^([^\d-]*)(-?\d+(?:\.\d+)?)(.*)$/s;

function countUp(el: HTMLElement) {
  if (animating.has(el)) return;
  const text = el.textContent?.trim() ?? "";
  if (counted.get(el) === text) return;
  counted.set(el, text);
  const m = NUM.exec(text);
  if (!m || reduced || el.children.length > 0) return;
  const [, pre, raw, post] = m;
  const target = parseFloat(raw);
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  animating.add(el);
  const t0 = performance.now();
  const dur = 900;
  let last = text;
  const step = (now: number) => {
    // React replaced the value mid-animation (e.g. a new run finished): stop and let it win.
    if (el.textContent !== last) {
      animating.delete(el);
      return;
    }
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 4);
    last = `${pre}${(target * eased).toFixed(decimals)}${post}`;
    el.textContent = last;
    if (p < 1) requestAnimationFrame(step);
    else {
      el.textContent = text;
      animating.delete(el);
    }
  };
  requestAnimationFrame(step);
}

function scan(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(REVEAL).forEach(reveal);
  root.querySelectorAll<HTMLElement>(COUNT).forEach(countUp);
}

export function installEffects() {
  if (reduced) document.documentElement.classList.add("reduced-motion");
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      scan(document);
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  scan(document);

  document.addEventListener("pointermove", (e) => {
    const card = (e.target as Element | null)?.closest?.(SPOT) as HTMLElement | null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  });

  document.addEventListener("pointerdown", (e) => {
    const btn = (e.target as Element | null)?.closest?.(".btn") as HTMLElement | null;
    if (!btn || reduced) return;
    const r = btn.getBoundingClientRect();
    const s = document.createElement("span");
    s.className = "ripple";
    s.style.left = `${e.clientX - r.left}px`;
    s.style.top = `${e.clientY - r.top}px`;
    btn.appendChild(s);
    s.addEventListener("animationend", () => s.remove());
  });

  const onScroll = () => document.documentElement.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Anchor jumps (recommendation → gap) flash the target so the trace is visible.
  const flash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  };
  window.addEventListener("hashchange", flash);
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
    if (a) setTimeout(flash, 30);
  });
}
