import { useId, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { Collapse } from "./Collapse";

/**
 * "The few that matter, the rest on request": the first `n` items show; the others glide open
 * behind a quiet "Show more". For lists where most people only need the top of it (gaps,
 * suggestions, competitors).
 */
export function TopN<T>({
  items,
  n = 3,
  render,
}: {
  items: readonly T[];
  n?: number;
  render: (item: T, index: number) => ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const head = items.slice(0, n);
  const rest = items.slice(n);
  return (
    <>
      {head.map((item, i) => render(item, i))}
      {rest.length > 0 && (
        <>
          <Collapse open={open} id={id}>
            {rest.map((item, i) => render(item, n + i))}
          </Collapse>
          <button type="button" className="link-quiet read-more-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
            {open ? t("common.showLess") : t("common.showMore")}
          </button>
        </>
      )}
    </>
  );
}
