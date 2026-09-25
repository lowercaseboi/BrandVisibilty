import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cancelJob, getJob, listJobs, skipJob, startRun } from "../api/client";
import type { Job, JobStatus, ProviderInfo, ProviderProgress, QuestionSet } from "../api/types";
import { useFormat, useT } from "../i18n";
import type { MessageKey } from "../i18n";
import { Details } from "../settings/details";
import { useListFormat, useProviderLabel } from "./dashboard/helpers";

const TERMINAL = new Set<JobStatus>(["completed", "partial", "failed", "cancelled"]);
const SKIPPABLE = new Set(["queued", "running", "waiting"]);
const SKIP_ALL = "__all__";
// Rough time per AI call; AIs run in parallel, so the estimate doesn't grow with the number of AIs.
const SECONDS_PER_CALL = 3;

const DEPTHS: { samples: number; label: MessageKey; sub: MessageKey }[] = [
  { samples: 1, label: "dashboard.run.depth.quick", sub: "dashboard.run.depth.quickSub" },
  { samples: 3, label: "dashboard.run.depth.standard", sub: "dashboard.run.depth.standardSub" },
  { samples: 5, label: "dashboard.run.depth.thorough", sub: "dashboard.run.depth.thoroughSub" },
];

const DONE_KEY: Partial<Record<JobStatus, MessageKey>> = {
  completed: "dashboard.run.done.completed",
  partial: "dashboard.run.done.partial",
  cancelled: "dashboard.run.done.cancelled",
  failed: "dashboard.run.done.failed",
};

type PanelError = { key: MessageKey; tech?: string };

const techOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function stateKey(p: ProviderProgress): { key: MessageKey; vars?: Record<string, number> } {
  switch (p.state) {
    case "waiting":
      return typeof p.wait_seconds === "number"
        ? { key: "dashboard.run.state.waiting", vars: { s: p.wait_seconds } }
        : { key: "dashboard.run.state.waitingNoTime" };
    case "skipped":
      // The structured state doesn't say who skipped; the backend's English note does
      // ("auto-skipped after 2 min without an answer").
      return { key: p.skip_reason === "auto" || (p.skip_reason == null && p.note?.toLowerCase().includes("auto")) ? "dashboard.run.state.autoSkipped" : "dashboard.run.state.skipped" };
    case "done":
      return { key: "dashboard.run.state.done" };
    case "running":
      return { key: "dashboard.run.state.running" };
    default:
      return { key: "dashboard.run.state.queued" };
  }
}

// Starts POST /brands/{key}/runs and polls GET /jobs/{id} every second.
export function RunPanel({
  brandKey,
  providers,
  questions,
  hasData,
  onComplete,
}: {
  brandKey: string;
  providers: ProviderInfo[] | null;
  questions: QuestionSet | null;
  hasData: boolean;
  onComplete: () => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const list = useListFormat();
  const optionsId = useId();
  const depthLabelId = useId();

  const configured = (providers ?? []).filter((p) => p.configured);
  const liveConfigured = configured.filter((p) => p.kind === "live");
  const labelOf = useProviderLabel(providers);

  const [provider, setProvider] = useState("auto");
  const [samples, setSamples] = useState(3);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<PanelError | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Provider ids (or SKIP_ALL) with a skip request in flight, to disable their buttons.
  const [skipping, setSkipping] = useState<Set<string>>(new Set());

  // Re-attach to this brand's unfinished job after navigating away and back, so the
  // panel shows it (and blocks a duplicate run) instead of offering a fresh check.
  useEffect(() => {
    let cancelled = false;
    listJobs(brandKey)
      .then((jobs) => {
        const active = jobs.filter((j) => !TERMINAL.has(j.status)).pop();
        if (!cancelled && active) setJob((current) => current ?? active);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [brandKey]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const jobId = job?.job_id;
  const jobDone = job ? TERMINAL.has(job.status) : true;

  useEffect(() => {
    if (!jobId || jobDone) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const next = await getJob(jobId);
        if (cancelled) return;
        setJob(next);
        if (next.status === "completed" || next.status === "partial") onCompleteRef.current();
      } catch (err) {
        if (!cancelled) setError({ key: "dashboard.run.error.poll", tech: techOf(err) });
      }
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId, jobDone]);

  const running = !!job && !jobDone;

  async function run() {
    setStarting(true);
    setError(null);
    setSkipping(new Set());
    setConfirmCancel(false);
    try {
      // No round: the backend picks the next synthetic round itself.
      const started = await startRun(brandKey, { providers: provider, samples });
      setJob(started);
      if (started.status === "completed" || started.status === "partial") onComplete();
    } catch (err) {
      setError({ key: "dashboard.run.error.start", tech: techOf(err) });
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setCancelling(true);
    try {
      setJob(await cancelJob(job.job_id));
      setConfirmCancel(false);
    } catch (err) {
      setError({ key: "dashboard.run.error.cancel", tech: techOf(err) });
    } finally {
      setCancelling(false);
    }
  }

  async function skip(providerId: string | null) {
    if (!job) return;
    const key = providerId ?? SKIP_ALL;
    setSkipping((prev) => new Set(prev).add(key));
    setError(null);
    try {
      setJob(await skipJob(job.job_id, providerId));
    } catch (err) {
      setError({ key: "dashboard.run.error.skip", tech: techOf(err) });
      setSkipping((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  // ---- the plan sentence ("We'll ask Google Gemini and Groq 17 questions. About 3 minutes.")
  const ready = providers !== null && questions !== null;
  const autoIsPractice = providers !== null && liveConfigured.length === 0;
  const chosen = configured.find((p) => p.provider_id === provider);
  const practice = provider === "auto" ? autoIsPractice : chosen?.kind === "offline";
  const askNames = provider === "auto" ? liveConfigured.map((p) => p.label || p.provider_id) : [labelOf(provider)];
  const providerCount = provider === "auto" ? Math.max(1, liveConfigured.length) : 1;
  const nQuestions = (questions?.scored_count ?? 0) + (questions?.unscored_count ?? 0);
  const unscored = questions?.unscored_count ?? 0;
  const seconds = nQuestions * samples * SECONDS_PER_CALL;
  const questionsHref = `/brands/${encodeURIComponent(brandKey)}/questions`;

  const jobProviders: ProviderProgress[] = job?.providers ?? [];
  const skippingAll = skipping.has(SKIP_ALL);
  const progress = job && job.total > 0 ? Math.min(1, job.done / job.total) : 0;
  const doneKey = job && TERMINAL.has(job.status) ? DONE_KEY[job.status] : undefined;

  return (
    <section className="card run-panel dash-run" id="check" aria-labelledby="run-title">
      <h2 id="run-title" className="run-title">
        {hasData ? t("dashboard.run.titleAgain") : t("dashboard.run.titleFirst")}
      </h2>

      {!running && (
        <>
          <p className="run-plan">
            {!ready ? (
              <span className="muted">{t("dashboard.run.planLoading")}</span>
            ) : practice ? (
              <>
                {t.n("dashboard.run.planPractice", nQuestions)} {t("dashboard.run.timeShort")}
              </>
            ) : (
              <>
                {t.n("dashboard.run.plan", nQuestions, { ais: list(askNames) })}{" "}
                {seconds < 60 ? t("dashboard.run.timeShort") : t.n("dashboard.run.time", Math.ceil(seconds / 60))}
              </>
            )}
          </p>
          <div className="run-actions">
            <button type="button" className="btn btn-primary btn-large run-go" onClick={run} disabled={starting || !ready}>
              {starting ? t("dashboard.run.starting") : hasData ? t("dashboard.run.buttonAgain") : t("dashboard.run.buttonFirst")}
            </button>
            <button
              type="button"
              className="btn btn-ghost run-options-toggle"
              aria-expanded={optionsOpen}
              aria-controls={optionsId}
              onClick={() => setOptionsOpen((o) => !o)}
            >
              <span className="disclosure-caret" aria-hidden="true" />
              {t("dashboard.run.options")}
            </button>
          </div>

          <div id={optionsId} className="run-options" hidden={!optionsOpen}>
            <label className="field">
              <span>{t("dashboard.run.which")}</span>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="auto">
                  {autoIsPractice
                    ? t("dashboard.run.whichAutoPractice")
                    : t("dashboard.run.whichAuto", { ais: list(liveConfigured.map((p) => p.label || p.provider_id)) })}
                </option>
                {configured.map((p) => (
                  <option key={p.provider_id} value={p.provider_id}>
                    {labelOf(p.provider_id)}
                  </option>
                ))}
              </select>
            </label>
            <div className="run-depth">
              <span className="run-depth-label" id={depthLabelId}>
                {t("dashboard.run.depth")}
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby={depthLabelId}>
                {DEPTHS.map((d) => (
                  <button
                    key={d.samples}
                    type="button"
                    role="radio"
                    aria-checked={samples === d.samples}
                    className={samples === d.samples ? "is-active" : ""}
                    onClick={() => setSamples(d.samples)}
                  >
                    {t(d.label)}
                    <span className="segmented-sub">{t(d.sub)}</span>
                  </button>
                ))}
              </div>
              <p className="muted small run-hint">{t("dashboard.run.depthHint")}</p>
            </div>
            <p className="small">
              <Link to={questionsHref}>{t("dashboard.run.editQuestions")}</Link>
            </p>
            <Details>
              <p className="muted small run-tech">
                {t.n("dashboard.run.tech.calls", nQuestions * samples * (practice ? 1 : providerCount))}
                {unscored > 0 && <> {t.n("dashboard.run.tech.unscored", unscored)}</>}
              </p>
            </Details>
          </div>
        </>
      )}

      {job && running && (
        <div className="run-live">
          <p className="run-live-line">
            <strong>{t("dashboard.run.running")}</strong>
            {job.total > 0 && (
              <span className="run-live-count">{t("dashboard.run.progress", { done: fmt.number(job.done), total: fmt.number(job.total) })}</span>
            )}
          </p>
          <div
            className="progress"
            role="progressbar"
            aria-label={t("dashboard.run.progressAria")}
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={job.total > 0 ? t("dashboard.run.progress", { done: job.done, total: job.total }) : undefined}
          >
            <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
          </div>

          {jobProviders.length > 0 && (
            <ul className="run-ais">
              {jobProviders.map((p) => {
                const frac = p.total > 0 ? Math.min(1, p.done / p.total) : 0;
                const canSkip = job.status === "running" && SKIPPABLE.has(p.state) && !skippingAll;
                const name = labelOf(p.provider_id) || p.label;
                const st = stateKey(p);
                return (
                  <li key={p.provider_id} className={`run-ai run-ai-${p.state}`}>
                    <div className="run-ai-top">
                      <span className="run-ai-name">{name}</span>
                      <span className="run-ai-count mono">
                        {p.done}/{p.total}
                      </span>
                      {canSkip && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => skip(p.provider_id)}
                          disabled={skipping.has(p.provider_id)}
                          aria-label={t("dashboard.run.skipAria", { ai: name })}
                        >
                          {skipping.has(p.provider_id) ? t("dashboard.run.skipping") : t("dashboard.run.skip")}
                        </button>
                      )}
                    </div>
                    <div className="progress progress-mini" aria-hidden="true">
                      <div className="progress-bar" style={{ width: `${frac * 100}%` }} />
                    </div>
                    <p className={`run-ai-state state-${p.state}`}>
                      {t(st.key, st.vars)}
                      {p.failed > 0 && <span className="muted"> · {t.n("dashboard.run.failedCount", p.failed)}</span>}
                    </p>
                    {p.note && (
                      <Details>
                        <p className="muted small run-tech" lang="en">
                          {p.note}
                        </p>
                      </Details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {jobProviders.length > 1 && <p className="muted small">{t("dashboard.run.stuckHint")}</p>}

          {confirmCancel ? (
            <div className="run-confirm" role="alertdialog" aria-labelledby={`${optionsId}-confirm`}>
              <p id={`${optionsId}-confirm`}>{t("dashboard.run.cancelConfirm")}</p>
              <div className="run-actions">
                <button type="button" className="btn btn-danger" onClick={cancel} disabled={cancelling} autoFocus>
                  {cancelling ? t("dashboard.run.cancelling") : t("dashboard.run.cancelYes")}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmCancel(false)} disabled={cancelling}>
                  {t("dashboard.run.cancelNo")}
                </button>
              </div>
            </div>
          ) : (
            <div className="run-actions">
              {job.status === "running" && (
                <button type="button" className="btn btn-secondary" onClick={() => skip(null)} disabled={skippingAll || cancelling}>
                  {skippingAll ? t("dashboard.run.finishing") : t("dashboard.run.finishNow")}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmCancel(true)} disabled={cancelling}>
                {t("dashboard.run.cancel")}
              </button>
            </div>
          )}

          <Details>
            <p className="muted small run-tech" lang="en">
              {t("dashboard.run.tech.message", { message: job.message })}
            </p>
          </Details>
        </div>
      )}

      {job && doneKey && (
        <div
          className={`alert run-result ${job.status === "failed" ? "alert-error" : job.status === "partial" ? "alert-warn" : job.status === "completed" ? "alert-ok" : ""}`}
          role="status"
        >
          {t(doneKey)}
          <Details>
            <p className="small run-tech" lang="en">
              {job.error ? t("dashboard.run.tech.error", { error: job.error }) : t("dashboard.run.tech.message", { message: job.message })}
            </p>
          </Details>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {t(error.key)}
          {error.tech && (
            <Details>
              <p className="small run-tech" lang="en">
                {t("dashboard.run.tech.error", { error: error.tech })}
              </p>
            </Details>
          )}
        </div>
      )}
    </section>
  );
}
