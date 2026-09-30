import { useId, useState } from "react";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";

const STORAGE_KEY = "bv.board.how";

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function saveOpen(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

const STEPS: [MessageKey, MessageKey][] = [
  ["board.how.step1", "board.how.step1Body"],
  ["board.how.step2", "board.how.step2Body"],
  ["board.how.step3", "board.how.step3Body"],
];

/**
 * "How this works": the three steps from a gap to a published campaign, at the top of the
 * Recommendations module. Collapsible; the choice is remembered in this browser.
 */
export function HowItWorks() {
  const t = useT();
  const [open, setOpen] = useState(readOpen);
  const headingId = useId();
  const bodyId = useId();

  const toggle = () => {
    setOpen((o) => {
      saveOpen(!o);
      return !o;
    });
  };

  return (
    <section className={`rec-how${open ? " is-open" : ""}`} aria-labelledby={headingId}>
      <div className="rec-how-head">
        <h2 id={headingId} className="eyebrow rec-how-title">
          {t("board.how.title")}
        </h2>
        <button type="button" className="btn-link rec-how-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          {open ? t("board.how.hide") : t("board.how.show")}
          <span className="disclosure-caret" aria-hidden="true" />
        </button>
      </div>
      <ol id={bodyId} className="rec-how-steps" hidden={!open}>
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
    </section>
  );
}
