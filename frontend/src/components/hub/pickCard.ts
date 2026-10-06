// The brand list's "pick a card from the deck" beat before the list → hub morph (hub.css,
// `.is-picking` / `.is-picked`): the chosen card lifts toward the viewer in place while the rest of
// the deck is set aside, then the View Transition carries the lifted card to the hub's centre.

/** Longest we ever hold a navigation for the lift (hub.css `card-pick` runs 200ms). */
export const PICK_WAIT_MAX = 260;

/** Phones: how long the card stays pressed in before the page slides on (pages.css `.is-pressed`). */
export const PRESS_MS = 120;

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export interface PickPose {
  /** Tilt of the lifted card, degrees (CSS rotateX / rotateY). */
  rx: number;
  ry: number;
}

/**
 * Pure: how the lifted card leans, from where its centre sits in the viewport. It tips toward the
 * middle of the screen (where the hub's centre card will be), as if a hand were already carrying it
 * there, plus a constant slight lean back so a centred card still reads as picked up.
 */
export function pickPose(cx: number, cy: number, vw: number, vh: number): PickPose {
  const nx = vw > 0 ? clamp((vw / 2 - cx) / (vw / 2)) : 0; // + when the centre is to the right
  const ny = vh > 0 ? clamp((vh / 2 - cy) / (vh / 2)) : 0; // + when the centre is below
  return { rx: round(4 - ny * 4), ry: round(nx * 7) };
}

/** Pure: the unit push (px) that moves another card away from the picked one, plus a small drop. */
export function setAside(dx: number, dy: number, push = 16, drop = 8): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d < 1) return { x: 0, y: drop };
  return { x: round((dx / d) * push), y: round((dy / d) * push + drop) };
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Lifts `card` and sets the other brand cards aside (classes and per-card CSS variables only — no
 * React state, so nothing re-renders mid-lift). Resolves once the lift has played (its
 * animationend) or after PICK_WAIT_MAX, whichever is first — the caller then starts the View
 * Transition, whose "old" snapshot is the card exactly as lifted, so the morph starts without a jump.
 */
export function pickCard(card: HTMLElement): Promise<void> {
  const home = card.closest<HTMLElement>(".home") ?? card.parentElement ?? document.body;
  const r = card.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const pose = pickPose(cx, cy, window.innerWidth, window.innerHeight);
  card.style.setProperty("--pick-rx", `${pose.rx}deg`);
  card.style.setProperty("--pick-ry", `${pose.ry}deg`);
  for (const other of home.querySelectorAll<HTMLElement>(".sample-card")) {
    if (other === card) continue;
    const o = other.getBoundingClientRect();
    const away = setAside(o.left + o.width / 2 - cx, o.top + o.height / 2 - cy);
    other.style.setProperty("--away-x", `${away.x}px`);
    other.style.setProperty("--away-y", `${away.y}px`);
  }
  card.classList.add("is-picked");
  home.classList.add("is-picking");

  return new Promise((resolve) => {
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      card.removeEventListener("animationend", onEnd);
      resolve();
    };
    const onEnd = (e: AnimationEvent) => {
      if (e.target === card && e.animationName === "card-pick") finish();
    };
    card.addEventListener("animationend", onEnd);
    timer = window.setTimeout(finish, PICK_WAIT_MAX);
  });
}

/**
 * The phone version: no 3D lift across a deck (one card per row, and a slide follows anyway), just
 * a quick press — the card dips (pages.css `.is-pressed`) and the caller navigates PRESS_MS later.
 * Resolves false if this card is already pressed (a double tap), so it only navigates once.
 */
export function pressCard(card: HTMLElement): Promise<boolean> {
  if (card.classList.contains("is-pressed")) return Promise.resolve(false);
  card.classList.add("is-pressed");
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(true);
      // Still pressed as the transition snapshots it; if the list is somehow still here a moment
      // later, let the card spring back.
      window.setTimeout(() => card.classList.remove("is-pressed"), 400);
    }, PRESS_MS);
  });
}
