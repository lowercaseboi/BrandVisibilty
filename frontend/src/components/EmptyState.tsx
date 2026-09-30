import type { ReactNode } from "react";

/** Built-in icons; pass your own ReactNode for anything else. */
export type EmptyStateIcon = "empty" | "search" | "error" | "chart" | "compass";

const PATHS: Record<EmptyStateIcon, ReactNode> = {
  // An open tray: nothing here yet.
  empty: (
    <>
      <path d="M3 13h5l1.5 2.5h5L16 13h5" />
      <path d="M5.5 5h13L21 13v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-5Z" />
    </>
  ),
  // A magnifier: a filter or search matched nothing.
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2M8.5 11h5" />
    </>
  ),
  // A warning triangle: something failed.
  error: (
    <>
      <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4.5M12 17.2v.1" />
    </>
  ),
  // A bar chart: no data to show until an analysis runs.
  chart: <path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21M8 17v-4M13 17V8M18 17v-7" />,
  // A compass: you've wandered off the map (not found).
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5Z" />
    </>
  ),
};

/**
 * The one empty / error state used across pages and modules: an icon, a title, a line of body
 * text and up to two actions (pass ready-made links or buttons: `primary` is the main way forward,
 * `secondary` an alternative). `compact` drops the card chrome for use inside an existing panel.
 * `role="alert"` for failures the user should hear about at once; `"status"` for quiet updates.
 */
export function EmptyState({
  icon = "empty",
  title,
  body,
  primary,
  secondary,
  children,
  as: Heading = "h2",
  tone = "neutral",
  compact = false,
  role,
  className = "",
}: {
  icon?: EmptyStateIcon | ReactNode;
  title: ReactNode;
  body?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  /** Extra content under the body (e.g. a technical-details disclosure). */
  children?: ReactNode;
  /** The title's element: a heading at the right outline level, or "p" inside a small panel. */
  as?: "h1" | "h2" | "h3" | "p";
  tone?: "neutral" | "error";
  compact?: boolean;
  role?: "status" | "alert";
  className?: string;
}) {
  const glyph =
    typeof icon === "string" && icon in PATHS ? (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {PATHS[icon as EmptyStateIcon]}
      </svg>
    ) : (
      icon
    );
  const cls = ["empty-state", compact ? "is-compact" : "card", tone === "error" ? "is-error" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} role={role}>
      {glyph && (
        <span className="empty-state-icon" aria-hidden="true">
          {glyph}
        </span>
      )}
      <div className="empty-state-text">
        <Heading className="empty-state-title">{title}</Heading>
        {body && <p className="empty-state-body">{body}</p>}
        {children}
        {(primary || secondary) && (
          <div className="empty-state-actions">
            {primary}
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}
