import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Modal for the accounts section (manual entry, picker, confirm, admin token). A native <dialog>
 * opened with showModal(): the rest of the page is inert (focus stays inside), Escape closes it.
 * It is mounted only while open, so on unmount focus goes back to whatever opened it (or to
 * `fallbackFocus` when that element has since left the page).
 */
export function AccountDialog({
  title,
  onClose,
  children,
  wide = false,
  fallbackFocus,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  fallbackFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [opener] = useState(() => (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));
  const [fallback] = useState(() => fallbackFocus);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    return () => {
      const target = opener && opener.isConnected ? opener : fallback?.();
      // After React removes the dialog, so the browser's own focus fix-up doesn't win.
      requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
  }, [opener, fallback]);

  return (
    <dialog
      ref={ref}
      className={`acc-dialog card${wide ? " acc-dialog-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="acc-dialog-body">
        <h2 id={titleId} className="acc-dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
