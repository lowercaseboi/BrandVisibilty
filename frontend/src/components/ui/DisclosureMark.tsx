/** The plus that becomes a minus when its section opens. Decorative: the button carries aria-expanded. */
export function DisclosureMark({ open }: { open: boolean }) {
  return <span className="disclosure-mark" data-open={open} aria-hidden="true" />;
}
