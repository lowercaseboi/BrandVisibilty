import { useState } from "react";
import type { Snapshot } from "../api/types";

// Uses the full audit trail (every run, admissible or not) rather than the trend-series
// endpoint, so a PARTIAL run's admission.reasons are visible here too.
export function RunHistory({ runs }: { runs: Snapshot[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (runs.length === 0) {
    return <p className="empty">No prior runs recorded.</p>;
  }

  const ordered = [...runs].reverse(); // most recent first

  return (
    <ul className="run-history">
      {ordered.map((run) => {
        const isOpen = expanded === run.run_id;
        return (
          <li key={run.run_id} className="run-history-item">
            <button
              type="button"
              className="run-history-toggle"
              onClick={() => setExpanded(isOpen ? null : run.run_id)}
              aria-expanded={isOpen}
            >
              <span className={`run-status run-status-${run.status.toLowerCase()}`}>{run.status}</span>
              <span className="run-history-id">{run.run_id}</span>
              <span className="run-history-date">{new Date(run.collection_completed_at).toLocaleString()}</span>
              <span className="run-history-score">{run.analysis_result.composite_score.toFixed(1)}%</span>
            </button>
            {isOpen && (
              <div className="run-history-detail">
                <p>
                  {run.observation_count} observations · {run.mentioned_count} mentioned ·{" "}
                  {run.cluster_count} clusters
                </p>
                {run.admission.reasons.length > 0 && (
                  <ul className="admission-reasons">
                    {run.admission.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
