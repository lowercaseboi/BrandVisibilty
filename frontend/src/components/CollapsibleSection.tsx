import { useId, useState } from "react";
import type { ReactNode } from "react";
import { readFlag, writeFlag } from "../settings/persisted";
import { Collapse } from "./ui/Collapse";
import { DisclosureMark } from "./ui/DisclosureMark";
import { Reveal } from "./ui/Reveal";

const STORAGE_PREFIX = "bv.open.";

/**
 * A page section whose whole header row (title · muted summary · plus/minus) is the toggle for a
 * `Collapse` body. Open state persists per-`id` in localStorage (`bv.open.<id>`); the section rises
 * in once when it first scrolls into view.
 */
export function CollapsibleSection({
  id,
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState<boolean>(() => readFlag(`${STORAGE_PREFIX}${id}`, defaultOpen));
  const bodyId = useId();

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      writeFlag(`${STORAGE_PREFIX}${id}`, next);
      return next;
    });
  };

  return (
    <Reveal>
      <section id={id} className="dash-section collapsible">
        <h2 className="collapsible-title">
          <button type="button" className="collapsible-head" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
            <span className="collapsible-name">{title}</span>
            {summary !== undefined && summary !== null && <span className="collapsible-summary muted">{summary}</span>}
            <DisclosureMark open={open} />
          </button>
        </h2>
        <Collapse open={open} id={bodyId}>
          <div className="collapsible-body">{children}</div>
        </Collapse>
      </section>
    </Reveal>
  );
}
