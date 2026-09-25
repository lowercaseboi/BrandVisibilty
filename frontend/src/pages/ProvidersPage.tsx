import { listProviders } from "../api/client";
import type { ProviderInfo } from "../api/types";
import { useAsync } from "../api/useAsync";
import { useFormat, useT } from "../i18n";
import { Details } from "../settings/details";

// Where each provider's key / address comes from (.env.example). Shown only in Details.
const ENV_VARS: Record<string, string[]> = {
  gemini: ["GEMINI_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  ollama: ["OLLAMA_BASE_URL"],
  custom: ["CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_MODEL"],
};

function AiCard({ p }: { p: ProviderInfo }) {
  const t = useT();
  return (
    <li className="card pg-ai">
      <div className="pg-ai-head">
        <h3>{p.label || p.provider_id}</h3>
        {p.configured ? (
          <span className="badge badge-ok">
            <span aria-hidden="true">✓</span> {t("pages.ais.connected")}
          </span>
        ) : (
          <span className="badge badge-muted">{t("pages.ais.notSetUp")}</span>
        )}
      </div>
      {p.model && <p className="muted small pg-ai-model">{t("pages.ais.model", { model: p.model })}</p>}
      {!p.configured && <p className="small pg-ai-help">{t("pages.ais.askToSetUp")}</p>}
    </li>
  );
}

export function ProvidersPage() {
  const t = useT();
  const fmt = useFormat();
  const state = useAsync(listProviders, []);
  const all = state.status === "ready" ? state.data : [];
  const live = all.filter((p) => p.kind === "live");
  const connected = live.filter((p) => p.configured);
  // Connected ones first, then the rest in server order.
  const ordered = [...connected, ...live.filter((p) => !p.configured)];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t("pages.ais.title")}</h1>
          <p className="lede">{t("pages.ais.lede")}</p>
        </div>
      </div>

      {state.status === "loading" && <p className="status">{t("pages.ais.loading")}</p>}
      {state.status === "error" && (
        <div className="alert alert-error" role="alert">
          <p>{t("pages.ais.loadError")}</p>
          <Details>
            <p className="small">{state.error instanceof Error ? state.error.message : String(state.error)}</p>
          </Details>
        </div>
      )}

      {state.status === "ready" && (
        <>
          {connected.length === 0 ? (
            <div className="alert alert-synthetic">{t("pages.ais.noneConnected")}</div>
          ) : (
            <p className="muted small">
              {t("pages.ais.connectedCount", { on: fmt.number(connected.length), total: fmt.number(live.length) })}
            </p>
          )}
          <ul className="pg-ai-grid">
            {ordered.map((p) => (
              <AiCard key={p.provider_id} p={p} />
            ))}
          </ul>

          <Details>
            <section className="pg-tech-section">
              <h2>{t("pages.ais.detailsTitle")}</h2>
              <p className="muted small">{t("pages.ais.detailsKeys")}</p>
              <div className="card card-flush">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("pages.ais.colId")}</th>
                      <th>{t("pages.ais.colEnv")}</th>
                      <th>{t("pages.ais.colKind")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.map((p) => (
                      <tr key={p.provider_id}>
                        <td>
                          <code>{p.provider_id}</code>
                          {p.model && (
                            <div className="muted small">
                              <code>{p.model}</code>
                            </div>
                          )}
                        </td>
                        <td>
                          {(ENV_VARS[p.provider_id] ?? []).map((v) => (
                            <div key={v}>
                              <code>{v}</code>
                            </div>
                          ))}
                          {!ENV_VARS[p.provider_id] && <span className="muted">—</span>}
                        </td>
                        <td>
                          <span className={`badge ${p.kind === "live" ? "badge-live" : "badge-offline"}`}>
                            {p.kind === "live" ? t("pages.ais.kindLive") : t("pages.ais.kindOffline")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="pg-tech-notes small muted">
                <li>
                  <code>synthetic</code> — {t("pages.ais.offlineSynthetic")}
                </li>
                <li>
                  <code>replay</code> — {t("pages.ais.offlineReplay")}
                </li>
                <li>{t("pages.ais.autoNote")}</li>
              </ul>
            </section>
          </Details>
        </>
      )}
    </div>
  );
}
