import { useEffect, useRef, useState } from "react";
import { getJob, listProviders, startRun } from "../api/client";
import type { Job, ProviderInfo } from "../api/types";
import { useAsync } from "../api/useAsync";

const TERMINAL = new Set(["completed", "partial", "failed"]);

// Starts POST /brands/{key}/runs and polls GET /jobs/{id} every second.
export function RunPanel({ brandKey, onComplete }: { brandKey: string; onComplete: () => void }) {
  const providersState = useAsync(listProviders, []);
  const providers: ProviderInfo[] = providersState.status === "ready" ? providersState.data : [];
  const configured = providers.filter((p) => p.configured);
  const liveConfigured = configured.filter((p) => p.kind === "live");

  const [provider, setProvider] = useState("auto");
  const [samples, setSamples] = useState(3);
  const [round, setRound] = useState(1);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

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
    try {
      const body = synthetic ? { providers: provider, samples, round } : { providers: provider, samples };
      const started = await startRun(brandKey, body);
      setJob(started);
      if (started.status === "completed" || started.status === "partial") onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run.");
    } finally {
      setStarting(false);
    }
  }

  const progress = job && job.total > 0 ? Math.min(1, job.done / job.total) : 0;

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
          <span>Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={running}>
            <option value="auto">
              {providersState.status !== "ready"
                ? "auto"
                : `auto (${autoIsSynthetic ? "no keys → synthetic" : liveConfigured.map((p) => p.provider_id).join(", ")})`}
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
        <label>
          <span>Samples per question</span>
          <select value={samples} onChange={(e) => setSamples(Number(e.target.value))} disabled={running}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {synthetic && (
          <label>
            <span>Synthetic round</span>
            <select value={round} onChange={(e) => setRound(Number(e.target.value))} disabled={running}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Round {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn btn-primary" onClick={run} disabled={running || starting}>
          {running ? "Running…" : starting ? "Starting…" : "Run analysis"}
        </button>
      </div>
      {synthetic && (
        <p className="muted small">
          Synthetic mode generates deterministic offline answers. Each round simulates a later
          measurement, so running rounds 1→5 builds a demo trend.
        </p>
      )}

      {job && (
        <div className={`job job-${job.status}`}>
          <div className="job-line">
            <span className={`badge badge-job-${job.status}`}>{job.status}</span>
            <span className="job-message">{job.message}</span>
            {job.total > 0 && (
              <span className="muted small job-count">
                {job.done}/{job.total}
              </span>
            )}
          </div>
          {!TERMINAL.has(job.status) && (
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          {job.status === "partial" && (
            <p className="small">Run finished with some provider/sample failures — results are marked partial.</p>
          )}
          {job.status === "completed" && <p className="small">Run complete — dashboard updated.</p>}
          {job.status === "failed" && (
            <div className="alert alert-error">Run failed: {job.error ?? job.message ?? "unknown error"}</div>
          )}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
