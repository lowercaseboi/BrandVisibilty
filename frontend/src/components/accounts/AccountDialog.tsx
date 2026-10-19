import type { ReactNode } from "react";
import { Sheet } from "../Sheet";

/**
 * Modal for the accounts section (manual entry, picker, confirm, admin token): the app's Sheet —
 * a centred dialog on wide screens, a bottom sheet on phones. Escape, a backdrop tap or a pull-down
 * calls `onClose`; on unmount focus goes back to whatever opened it (or to `fallbackFocus`).
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
  return (
    <Sheet title={title} onClose={onClose} wide={wide} fallbackFocus={fallbackFocus}>
      {children}
    </Sheet>
  );
}
