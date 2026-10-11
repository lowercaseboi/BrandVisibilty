import { useId } from "react";
import { useT } from "../../i18n";
import { usePersistedFlag } from "../../settings/persisted";
import type { MessageKey } from "../../i18n";
import { Collapse } from "../ui/Collapse";
import { DisclosureMark } from "../ui/DisclosureMark";

const STORAGE_KEY = "bv.board.how";

const STEPS: [MessageKey, MessageKey][] = [
  ["board.how.step1", "board.how.step1Body"],
  ["board.how.step2", "board.how.step2Body"],
  ["board.how.step3", "board.how.step3Body"],
];

/**
 * "How this works": the three steps from a gap to a published campaign, at the top of the
 * Recommendations module. Closed by default (the suggestions come first); the choice is remembered in this browser.
 */
export function HowItWorks() {
  const t = useT();
  const [open, setOpen] = usePersistedFlag(STORAGE_KEY, false);
  const headingId = useId();
  const bodyId = useId();

  return (
    <section className={`rec-how${open ? " is-open" : ""}`} aria-labelledby={headingId}>
      <div className="rec-how-head">
        <h2 id={headingId} className="eyebrow rec-how-title">
          {t("board.how.title")}
        </h2>
        <button type="button" className="link-quiet rec-how-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          {open ? t("board.how.hide") : t("board.how.show")}
          <DisclosureMark open={open} />
        </button>
      </div>
      <Collapse open={open} id={bodyId}>
        <ol className="rec-how-steps">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <span className="rec-how-num" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <p className="rec-how-step">{t(title)}</p>
                <p className="rec-how-body">{t(body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Collapse>
    </section>
  );
}
