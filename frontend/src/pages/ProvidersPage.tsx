import { listProviders } from "../api/client";
import { useAsync } from "../api/useAsync";

export function ProvidersPage() {
  const state = useAsync(listProviders, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Providers</h1>
          <p className="lede">
            Bring your own model: every LLM provider is an adapter behind the same interface. Keys are read
            only from environment variables and are never shown here.
          </p>
        </div>
      </div>

      <div className="alert alert-info">
        Add any key to <code>.env.local</code> (see <code>.env.example</code>) and restart; with no keys the
        platform runs on synthetic offline data.
      </div>

      {state.status === "loading" && <p className="status">Loading providers…</p>}
      {state.status === "error" && (
        <div className="alert alert-error">
          Failed to load providers. {state.error instanceof Error ? state.error.message : ""}
        </div>
      )}
      {state.status === "ready" && (
        <div className="card card-flush">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th>Configured</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((p) => (
                <tr key={p.provider_id}>
                  <td>
                    <strong>{p.label || p.provider_id}</strong>
                    <div className="muted small">
                      <code>{p.provider_id}</code>
                    </div>
                  </td>
                  <td>{p.model ? <code>{p.model}</code> : <span className="muted">—</span>}</td>
                  <td>
                    {p.configured ? (
                      <span className="check check-yes" title="Configured">✓ Configured</span>
                    ) : (
                      <span className="check check-no" title="Not configured">✗ Not configured</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${p.kind === "live" ? "badge-live" : "badge-offline"}`}>
                      {p.kind === "live" ? "Live API" : "Offline"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted small">
        Choosing <strong>auto</strong> when running an analysis uses every configured live provider, or
        falls back to <strong>synthetic</strong> if none are configured. <strong>Replay</strong> re-uses
        previously recorded real responses.
      </p>
    </div>
  );
}
