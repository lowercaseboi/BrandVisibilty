import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cancelJob, getJob, getQuestions, listJobs, listProviders, skipJob, startRun } from "../api/client";
import type { Job, ProviderInfo, ProviderProgress } from "../api/types";
import { useAsync } from "../api/useAsync";

const TERMINAL = new Set(["completed", "partial", "failed", "cancelled"]);
const SKIPPABLE = new Set(["queued", "running", "waiting"]);
const SKIP_ALL = "__all__";

const DEPTHS = [
  { samples: 1, label: "Quick", hint: "1 answer per question" },
  { samples: 3, label: "Standard", hint: "3 answers per question · recommended" },
  { samples: 5, label: "Thorough", hint: "5 answers per question" },
];

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Starts POST /brands/{key}/runs and polls GET /jobs/{id} every second.
export function RunPanel({ brandKey, onComplete }: { brandKey: string; onComplete: () => void }) {
  const providersState = useAsync(listProviders, []);
  const providers: ProviderInfo[] = providersState.status === "ready" ? providersState.data : [];
  const configured = providers.filter((p) => p.configured);
  const liveConfigured = configured.filter((p) => p.kind === "live");
  // Counts drive the plan line; if the endpoint fails we just hide them.
  const questionsState = useAsync(() => getQuestions(brandKey), [brandKey]);
  const questionSet = questionsState.status === "ready" ? questionsState.data : null;

  const [provider, setProvider] = useState("auto");
  const [samples, setSamples] = useState(3);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Provider ids (or SKIP_ALL) with a skip request in flight, to disable their buttons.
  const [skipping, setSkipping] = useState<Set<string>>(new Set());

  // Re-attach to this brand's unfinished job after navigating away and back, so the
  // panel shows it (and blocks a duplicate run) instead of offering a fresh "Run".
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Lost contact with the job.");
      }
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId, jobDone]);

  const autoIsSynthetic = providersState.status === "ready" && liveConfigured.length === 0;
  const synthetic = provider === "synthetic" || (provider === "auto" && autoIsSynthetic);
  const running = !!job && !jobDone;

  async function run() {
    setStarting(true);
    setError(null);
    setSkipping(new Set());
    try {
      // No round: the backend picks the next synthetic round itself.
      const started = await startRun(brandKey, { providers: provider, samples });
      setJob(started);
      if (started.status === "completed" || started.status === "partial") onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run.");
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setCancelling(true);
    try {
      setJob(await cancelJob(job.job_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel run.");
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
      setError(err instanceof Error ? err.message : "Failed to skip.");
      setSkipping((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const jobProviders: ProviderProgress[] = job?.providers ?? [];
  const skippingAll = skipping.has(SKIP_ALL);

  const progress = job && job.total > 0 ? Math.min(1, job.done / job.total) : 0;

  const labelOf = (id: string) => providers.find((p) => p.provider_id === id)?.label || id;
  const askNames =
    provider === "auto"
      ? autoIsSynthetic
        ? ["synthetic data"]
        : liveConfigured.map((p) => p.label || p.provider_id)
      : [labelOf(provider)];
  const providerCount = provider === "auto" ? (autoIsSynthetic ? 1 : liveConfigured.length) : 1;
  const scoredCount = questionSet?.scored_count ?? 0;
  const unscoredCount = questionSet?.unscored_count ?? 0;
  const totalCalls = providerCount * (scoredCount + unscoredCount) * samples;
  const questionsHref = `/brands/${encodeURIComponent(brandKey)}/questions`;

  return (
    <div className="card run-panel">
      <div className="run-panel-head">
        <div>
          <h3>Run analysis</h3>
          <p className="muted small">
            Asks each provider the brand's unprompted category questions, detects mentions, then scores,
            finds gaps and drafts recommendations.
          </p>
        </div>
      </div>
      <div className="run-controls">
        <label>
          <span>Ask</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={running}>
            <option value="auto">
              {providersState.status !== "ready"
                ? "Automatic"
                : `Automatic (${autoIsSynthetic ? "no API keys → synthetic data" : liveConfigured.map((p) => p.label || p.provider_id).join(", ")})`}
            </option>
            {configured.map((p) => (
              <option key={p.provider_id} value={p.provider_id}>
                {p.label || p.provider_id}
                {p.model ? ` — ${p.model}` : ""}
                {p.kind === "offline" ? " (offline)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="run-depth">
          <span className="run-depth-label" id="run-depth-label">
            Depth
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="run-depth-label">
            {DEPTHS.map((d) => (
              <button
                key={d.samples}
                type="button"
                role="radio"
                aria-checked={samples === d.samples}
                className={samples === d.samples ? "is-active" : ""}
                onClick={() => setSamples(d.samples)}
                disabled={running}
                title={d.hint}
              >
                {d.label}
                <span className="segmented-sub">
                  {d.samples}×{d.samples === 3 ? " · recommended" : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={running || starting}>
          {running ? "Running…" : starting ? "Starting…" : "Run analysis"}
        </button>
        {running && job?.status === "running" && (
          <button
            className="btn btn-secondary"
            onClick={() => skip(null)}
            disabled={skippingAll || cancelling}
            title="Stop asking every AI and score the answers collected so far"
          >
            {skippingAll ? "Finishing…" : "Finish now with answers so far"}
          </button>
        )}
        {running && (
          <button className="btn btn-secondary" onClick={cancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>
      <p className="muted small">
        AI answers change from one ask to the next. Asking each question more times gives a steadier score and a
        narrower confidence range, but uses more API calls.
      </p>
      <p className="run-plan small">
        {questionSet && providersState.status === "ready" ? (
          <>
            Will ask <strong>{listNames(askNames)}</strong> <strong>{plural(scoredCount + unscoredCount, "question")}</strong>{" "}
            × <strong>{samples}</strong>
            {providerCount > 1 && (
              <>
                {" "}
                × <strong>{providerCount} providers</strong>
              </>
            )}{" "}
            = <strong>{plural(totalCalls, "API call")}</strong>
            {unscoredCount > 0 && (
              <span className="muted">
                {" "}
                · {plural(unscoredCount, "brand-named question")} also asked, not scored
              </span>
            )}
            {". "}
          </>
        ) : (
          <span className="muted">Asks each question {samples === 1 ? "once" : `${samples} times`}. </span>
        )}
        <Link to={questionsHref}>View / edit questions →</Link>
      </p>
      {synthetic && (
        <p className="muted small">
          Synthetic mode generates deterministic offline answers — no API keys needed. Each synthetic run simulates
          a later week, so repeated runs build a demo trend.
        </p>
      )}

      {job && (
        <div className={`job job-${job.status}`}>
          <div className="job-line">
            <span className={`badge badge-job-${job.status}`}>{job.status}</span>
            <span className="job-message">{job.message}</span>
            {job.total > 0 && (
              <span className="muted small job-count">
                {job.done} of {plural(job.total, "call")} done
              </span>
            )}
          </div>
          {!TERMINAL.has(job.status) && (
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          {job.status === "running" && jobProviders.length > 0 && (
            <>
              <ul className="provider-progress">
                {jobProviders.map((p) => {
                  const frac = p.total > 0 ? Math.min(1, p.done / p.total) : 0;
                  const canSkip = SKIPPABLE.has(p.state) && !skippingAll;
                  return (
                    <li key={p.provider_id} className={`provider-row provider-${p.state}`}>
                      <span className="provider-row-label">{p.label || p.provider_id}</span>
                      <div className="progress progress-mini" aria-hidden="true">
                        <div className="progress-bar" style={{ width: `${frac * 100}%` }} />
                      </div>
                      <span className="muted small job-count provider-row-count">
                        {p.done}/{p.total}
                        {p.failed > 0 && ` · ${p.failed} failed`}
                      </span>
                      <span className={`badge provider-row-badge badge-provider-${p.state}`}>{p.state}</span>
                      <span className="muted small provider-row-note">{p.note ?? ""}</span>
                      {canSkip ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-small provider-row-action"
                          onClick={() => skip(p.provider_id)}
                          disabled={skipping.has(p.provider_id)}
                          title={`Stop asking ${p.label || p.provider_id}; the run finishes with the others`}
                        >
                          {skipping.has(p.provider_id) ? "Skipping…" : "Skip"}
                        </button>
                      ) : (
                        <span className="provider-row-action" />
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="muted small">
                Stuck on a rate limit? Skip that AI — the run finishes with the others. Providers with no answer for
                2 minutes are skipped automatically.
              </p>
            </>
          )}
          {job.status === "partial" && (
            <p className="small">Run finished with some provider/sample failures — results are marked partial.</p>
          )}
          {job.status === "completed" && <p className="small">Run complete — dashboard updated.</p>}
          {job.status === "cancelled" && <p className="small">Run cancelled — nothing was saved.</p>}
          {job.status === "failed" && (
            <div className="alert alert-error">Run failed: {job.error ?? job.message ?? "unknown error"}</div>
          )}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
