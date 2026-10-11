import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listCampaigns } from "../../api/client";
import type { Campaign } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { useBrandData } from "../../pages/brand/BrandContext";
import { useAccounts } from "../accounts/useAccounts";
import { Collapse } from "../ui/Collapse";
import { DisclosureMark } from "../ui/DisclosureMark";
import { deriveChecklist, readChecklistHidden, saveChecklistHidden } from "./onboarding";
import type { StepId } from "./onboarding";

const LABEL: Record<StepId, MessageKey> = {
  profile: "hub.checklist.step.profile",
  accounts: "hub.checklist.step.accounts",
  analysis: "hub.checklist.step.analysis",
  campaign: "hub.checklist.step.campaign",
  measure: "hub.checklist.step.measure",
};

const HINT: Record<StepId, MessageKey> = {
  profile: "hub.checklist.hint.profile",
  accounts: "hub.checklist.hint.accounts",
  analysis: "hub.checklist.hint.analysis",
  campaign: "hub.checklist.hint.campaign",
  measure: "hub.checklist.hint.measure",
};

/**
 * Getting-started strip above the hub stage: profile → accounts → first analysis → first campaign
 * → re-run to measure, ticked from existing data, each step a deep link. One line (progress + the
 * next step) with the steps behind a toggle; they start open only while nothing is done yet.
 * "Hide" is remembered per brand. It renders its frame straight away (ticks fill in as data lands)
 * so the stage below doesn't jump mid-entrance.
 */
export function OnboardingChecklist() {
  const t = useT();
  const fmt = useFormat();
  const titleId = useId();
  const stepsId = useId();
  const { brandKey, profile, history, status } = useBrandData();
  const { accounts } = useAccounts(brandKey);
  const [hidden, setHidden] = useState(() => readChecklistHidden(brandKey));
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  // null = follow the data (open until the first step is done); a click pins it.
  const [pinned, setPinned] = useState<boolean | null>(null);

  useEffect(() => {
    if (hidden) return;
    let live = true;
    listCampaigns(brandKey)
      .then((list) => live && setCampaigns(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [brandKey, hidden]);

  const list = useMemo(
    () => deriveChecklist({ brandKey, profile, history, accounts, campaigns }),
    [brandKey, profile, history, accounts, campaigns],
  );

  if (hidden) return null;

  const hide = () => {
    saveChecklistHidden(brandKey);
    setHidden(true);
    // The strip is gone: continue from the first module card rather than the top of the page.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".hub-modules a")?.focus({ preventScroll: true }));
  };
  const total = list.steps.length;
  const open = pinned ?? list.doneCount === 0;
  const next = list.steps.find((s) => s.id === list.current);

  return (
    <section
      className={`ob card${list.current === null ? " is-complete" : ""}`}
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
    >
      <div className="ob-head">
        <h2 id={titleId} className="ob-title">
          {t("hub.checklist.title")}
        </h2>
        <span className="ob-progress">
          {t("hub.checklist.progress", { done: fmt.number(list.doneCount), total: fmt.number(total) })}
        </span>
        <span className="ob-meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${list.doneCount / total})` }} />
        </span>
        {next && !open ? (
          <Link to={next.href} className="link-quiet ob-next">
            {t("hub.checklist.next", { step: t(LABEL[next.id]) })}
          </Link>
        ) : (
          list.current === null && <span className="ob-next ob-all-done">{t("hub.checklist.allDone")}</span>
        )}
        <button
          type="button"
          className="link-quiet ob-toggle"
          aria-expanded={open}
          aria-controls={stepsId}
          onClick={() => setPinned(!open)}
        >
          <DisclosureMark open={open} />
          {open ? t("hub.checklist.hideSteps") : t("hub.checklist.showSteps")}
        </button>
        <button type="button" className="link-quiet ob-hide" onClick={hide} aria-label={t("hub.checklist.dismissAria")}>
          {t("hub.checklist.dismiss")}
        </button>
      </div>

      <Collapse open={open} id={stepsId}>
        <ol className="ob-steps">
          {list.steps.map((s, i) => {
            const current = s.id === list.current;
            const state = s.done ? "hub.checklist.doneSr" : current ? "hub.checklist.nextSr" : "hub.checklist.todoSr";
            return (
              <li key={s.id} className={`ob-step${s.done ? " is-done" : ""}${current ? " is-current" : ""}`}>
                <Link to={s.href} className="ob-link" aria-current={current ? "step" : undefined}>
                  <span className="ob-mark" aria-hidden="true">
                    {s.done ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.5 6.2l2.3 2.3 4.7-5" />
                      </svg>
                    ) : (
                      fmt.number(i + 1)
                    )}
                  </span>
                  <span className="sr-only">{t(state)} </span>
                  <span className="ob-label">{t(LABEL[s.id])}</span>
                </Link>
              </li>
            );
          })}
        </ol>
        {list.current && <p className="ob-hint">{t(HINT[list.current])}</p>}
      </Collapse>
    </section>
  );
}
