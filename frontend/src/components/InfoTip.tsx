import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const EDGE = 8; // keep the tooltip this far inside the viewport

/**
 * Small "i" marker; hovering or focusing it shows `text` in a tooltip, and a tap or click toggles it
 * (touch has no hover). A tap elsewhere or Escape closes it. With `interactive={false}` (inside a
 * link, where a nested button is invalid) the marker is a plain span: hover still shows the tooltip,
 * and the text stays in the link's content for screen readers.
 */
export function InfoTip({ text, label, interactive = true }: { text: string; label: string; interactive?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  // Shift the tooltip sideways so it stays on screen (it is centred on a marker that can sit near
  // either edge). Measured whenever it is about to show; --tip-shift feeds the CSS `translate`.
  const place = useCallback(() => {
    const tip = tipRef.current;
    if (!tip) return;
    // Measure from an unshifted box; the shift's own transition is paused so the read isn't taken
    // mid-animation, then the new shift applies at once.
    tip.style.transitionProperty = "opacity, transform";
    tip.style.setProperty("--tip-shift", "0px");
    const { left, right } = tip.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let shift = 0;
    if (right > vw - EDGE) shift = vw - EDGE - right;
    if (left + shift < EDGE) shift = EDGE - left;
    tip.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
    void tip.offsetWidth; // commit the jump before the transition comes back
    tip.style.transitionProperty = "";
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!interactive) {
    return (
      <span className="info-tip" onMouseEnter={place}>
        <span className="info-tip-btn" aria-hidden="true">
          i
        </span>
        <span className="info-tip-text" ref={tipRef}>
          {text}
        </span>
      </span>
    );
  }
  return (
    <span className={`info-tip${open ? " is-open" : ""}`} ref={wrapRef} onMouseEnter={place}>
      <button
        type="button"
        className="info-tip-btn"
        aria-label={label}
        aria-describedby={id}
        onFocus={place}
        onClick={(e) => {
          // Inside clickable rows (a card head, a summary) the tap is about the tip, not the row.
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        i
      </button>
      <span role="tooltip" id={id} className="info-tip-text" ref={tipRef}>
        {text}
      </span>
    </span>
  );
}
