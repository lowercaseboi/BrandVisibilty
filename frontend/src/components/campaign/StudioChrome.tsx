import type { ReactNode } from "react";
import type { Job } from "../../api/types";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { useReducedMotion } from "../../settings/motion";
import { STEPS, STEP_LABEL, generationStage } from "./studioFlow";
import type { GenStage, StepId } from "./studioFlow";

/** The four steps; the current one carries aria-current="step", unreachable ones are disabled. */
export function Stepper({ current, reachable, onGo }: { current: StepId; reachable: Set<StepId>; onGo: (s: StepId) => void }) {
  const t = useT();
  const at = STEPS.indexOf(current);
  return (
    <nav aria-label={t("board.campaign.steps.label")}>
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i < at ? "is-done" : undefined}>
            <button
              type="button"
              className="stepper-btn"
              aria-current={s === current ? "step" : undefined}
              disabled={!reachable.has(s) && s !== current}
              onClick={() => s !== current && onGo(s)}
            >
              <span className="stepper-num" aria-hidden="true">
                {i < at ? "✓" : i + 1}
              </span>
              <span className="stepper-label">{t(STEP_LABEL[s])}</span>
              {i < at && <span className="sr-only"> ({t("board.campaign.step.done")})</span>}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Sticky bottom bar: Back on the left, a short note, the step's primary action on the right. */
export function ActionBar({
  back,
  note,
  noteTone,
  children,
}: {
  back?: { label: string; onClick: () => void };
  note?: ReactNode;
  /** "warn": the note says why the primary action can't be used yet. */
  noteTone?: "warn";
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="action-bar" role="region" aria-label={t("board.campaign.bar.label")}>
      {back && (
        <button type="button" className="btn btn-ghost" onClick={back.onClick}>
          <span aria-hidden="true">←</span> <span className="action-bar-back">{back.label}</span>
        </button>
      )}
      <p className={`action-bar-note${noteTone ? ` is-${noteTone}` : ""}`} aria-live="polite">
        {noteTone === "warn" && <span aria-hidden="true">⚠ </span>}
        {note}
      </p>
      <div className="action-bar-main">{children}</div>
    </div>
  );
}

const GEN_STEPS: { stage: Exclude<GenStage, "queued" | "done">; key: MessageKey }[] = [
  { stage: "copy", key: "board.campaign.gen.copy" },
  { stage: "images", key: "board.campaign.gen.images" },
  { stage: "saving", key: "board.campaign.gen.saving" },
];

/** Drafting in progress: a shimmering post outline (still under reduced motion), the job's stages
 * ticked off as they finish, and its progress bar. */
export function Generating({ job }: { job: Job | null }) {
  const t = useT();
  const reduced = useReducedMotion();
  const g = generationStage(job);
  const at = g.stage === "queued" ? -1 : g.stage === "done" ? GEN_STEPS.length : GEN_STEPS.findIndex((s) => s.stage === g.stage);
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 4;
  return (
    <div className="card cs-gen" role="status" aria-live="polite">
      <div className={`cs-gen-art${reduced ? "" : " is-live"}`} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="cs-gen-body">
        <h3 className="cs-subhead">{t("board.campaign.generating.title")}</h3>
        <ol className="cs-gen-steps">
          {GEN_STEPS.map((s, i) => {
            const state = i < at ? "done" : i === at ? "now" : "todo";
            const label =
              s.stage === "images" && state === "now" && g.image && g.images
                ? t("board.campaign.gen.imagesN", { i: g.image, n: g.images })
                : t(s.key);
            return (
              <li key={s.stage} data-state={state}>
                <span className="cs-gen-dot" aria-hidden="true">
                  {state === "done" ? "✓" : state === "now" ? <span className="cs-spinner" /> : ""}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
        <div className="progress" aria-hidden="true">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small">{t("board.campaign.generating.body")}</p>
      </div>
    </div>
  );
}
