import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { prefersReducedMotion } from "../settings/motion";
import { dragOffset, shouldDismissSheet } from "./sheetDrag";

/** Longest the close animation may take before we unmount anyway (animationend can be skipped). */
const CLOSE_FALLBACK_MS = 320;

/**
 * Modal surface for the whole app: a native <dialog> opened with showModal(), so the page behind
 * is inert and Escape closes it. On phones (sheet.css, ≤640px) it is a bottom sheet that slides up,
 * with a grab handle you can pull down (or flick) to dismiss; on wider screens it is a centred
 * dialog. It is mounted only while open: on unmount focus goes back to whatever opened it (or to
 * `fallbackFocus` when that element has since left the page).
 *
 * `onClose` is the "dismiss" path (Escape, backdrop tap, pull-down, or `close` from children); the
 * sheet plays its exit animation first. Callers that finish some other way (e.g. a form submit)
 * can simply unmount it.
 */
export function Sheet({
  title,
  onClose,
  children,
  wide = false,
  className = "",
  describedBy,
  fallbackFocus,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode | ((close: () => void) => ReactNode);
  wide?: boolean;
  className?: string;
  describedBy?: string;
  fallbackFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [opener] = useState(() => (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));
  const [fallback] = useState(() => fallbackFocus);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ y: number; t: number; dy: number; v: number } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    return () => {
      const target = opener && opener.isConnected ? opener : fallback?.();
      // After React removes the dialog, so the browser's own focus fix-up doesn't win.
      requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
  }, [opener, fallback]);

  const close = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
  }, [onClose]);

  // The exit animation ends in onAnimationEnd; this is the safety net if it never fires.
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClose, CLOSE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { y: e.clientY, t: e.timeStamp, dy: 0, v: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    ref.current?.setAttribute("data-dragging", "");
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const sheet = ref.current;
    if (!d || !sheet) return;
    const dy = e.clientY - d.y;
    const dt = Math.max(1, e.timeStamp - d.t);
    d.v = (dy - d.dy) / dt;
    d.dy = dy;
    d.t = e.timeStamp;
    sheet.style.transform = `translateY(${dragOffset(dy)}px)`;
  };

  const onPointerEnd = () => {
    const d = drag.current;
    const sheet = ref.current;
    drag.current = null;
    if (!d || !sheet) return;
    sheet.removeAttribute("data-dragging");
    if (shouldDismissSheet(d.dy, sheet.offsetHeight, d.v)) {
      // Carry on from where the finger let go.
      sheet.style.setProperty("--sheet-from", `${Math.max(0, d.dy)}px`);
      sheet.style.transform = "";
      close();
    } else {
      sheet.style.transform = "";
    }
  };

  return (
    <dialog
      ref={ref}
      className={`sheet card${wide ? " sheet-wide" : ""}${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      data-closing={closing ? "" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // A click whose target is the <dialog> itself landed on the backdrop (the body fills the box).
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet-grab"
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <span className="sheet-handle" />
      </div>
      <div className="sheet-body">
        <h2 id={titleId} className="sheet-title">
          {title}
        </h2>
        {typeof children === "function" ? children(close) : children}
      </div>
    </dialog>
  );
}
