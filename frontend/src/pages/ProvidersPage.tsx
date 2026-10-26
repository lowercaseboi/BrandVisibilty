import { getProviderUsage, listProviders } from "../api/client";
import type { ProviderInfo, ProviderUsage } from "../api/types";
import { useAsync } from "../api/useAsync";
import { EmptyState } from "../components/EmptyState";
import { useFormat, useT } from "../i18n";
import { Details } from "../settings/details";

// Where each provider's key / address comes from (.env.example). Shown only in Details.
const ENV_VARS: Record<string, string[]> = {
  gemini: ["GEMINI_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  qwen: ["GROQ_API_KEY", "QWEN_MODEL"],
  openrouter: ["OPENROUTER_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  github: ["GITHUB_MODELS_TOKEN"],
  cloudflare: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
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
      <Details>
        {p.model && <p className="muted small pg-ai-model">{t("pages.ais.model", { model: p.model })}</p>}
      </Details>
      {!p.configured && <p className="small pg-ai-help">{t("pages.ais.askToSetUp")}</p>}
    </li>
  );
}

const OFFLINE_IDS = new Set(["synthetic", "replay"]);

/** One AI's use: today's requests against its published free cap (a meter), totals in Details. */
function UsageCard({ u }: { u: ProviderUsage }) {
  const t = useT();
  const fmt = useFormat();
  const cap = u.free_tier?.requests_per_day ?? null;
  const share = cap ? Math.min(1, u.calls_today / cap) : null;
  const tokenCap = u.free_tier?.tokens_per_day ?? null;
  return (
    <li className="card pg-usage">
      <h3>{u.label}</h3>
      <p className="pg-usage-today">
        {cap
          ? t("pages.ais.usage.today", { calls: fmt.number(u.calls_today), cap: fmt.number(cap) })
          : t("pages.ais.usage.todayNoCap", { calls: fmt.number(u.calls_today) })}
      </p>
      {share !== null && (
        <div
          className={`pg-usage-meter${share >= 0.8 ? " is-high" : ""}`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={cap ?? 0}
          aria-valuenow={u.calls_today}
          aria-label={t("pages.ais.usage.today", { calls: fmt.number(u.calls_today), cap: fmt.number(cap ?? 0) })}
        >
          <div className="pg-usage-fill" style={{ transform: `scaleX(${share})` }} />
        </div>
      )}
      <p className="muted small">{t("pages.ais.usage.total", { calls: fmt.number(u.calls), runs: fmt.number(u.runs) })}</p>
      {u.failed > 0 && <p className="muted small">{t("pages.ais.usage.failed", { n: fmt.number(u.failed) })}</p>}
      {u.truncated > 0 && (
        <p className="small pg-usage-warn">
          {t("pages.ais.usage.truncated", { n: fmt.number(u.truncated), of: fmt.number(u.calls - u.failed) })}
        </p>
      )}
      <Details>
        <div className="pg-usage-detail small muted">
          {tokenCap !== null && (
            <p>{t("pages.ais.usage.tokensToday", { tokens: fmt.number(u.tokens_today), cap: fmt.number(tokenCap) })}</p>
          )}
          {u.tokens_known_runs > 0 && (
            <p>
              {t("pages.ais.usage.tokens", {
                tokens: fmt.number(u.total_tokens),
                prompt: fmt.number(u.prompt_tokens),
                answer: fmt.number(u.completion_tokens),
              })}
              {u.tokens_known_runs < u.runs && (
                <> {t("pages.ais.usage.tokensPartial", { known: fmt.number(u.tokens_known_runs), runs: fmt.number(u.runs) })}</>
              )}
            </p>
          )}
          {u.avg_latency_ms !== null && (
            <p>{t("pages.ais.usage.latency", { s: fmt.number(u.avg_latency_ms / 1000, 1) })}</p>
          )}
          {u.last_used_at && <p>{t("pages.ais.usage.lastUsed", { when: fmt.relativeTime(u.last_used_at) })}</p>}
          {u.free_tier && <p lang="en">{u.free_tier.note}</p>}
        </div>
      </Details>
    </li>
  );
}

function UsageSection() {
  const t = useT();
  const state = useAsync(getProviderUsage, []);
  if (state.status === "loading") return null;
  const rows = state.status === "ready" ? state.data.filter((u) => !OFFLINE_IDS.has(u.provider_id)) : [];
  return (
    <section className="pg-usage-section" aria-labelledby="pg-usage-title">
      <h2 id="pg-usage-title">{t("pages.ais.usage.title")}</h2>
      <p className="muted small">{t("pages.ais.usage.lede")}</p>
      {state.status === "error" ? (
        <p className="muted small">{t("pages.ais.usage.loadError")}</p>
      ) : rows.length === 0 ? (
        <p className="muted small">{t("pages.ais.usage.empty")}</p>
      ) : (
        <ul className="pg-ai-grid">
          {rows.map((u) => (
            <UsageCard key={u.provider_id} u={u} />
          ))}
        </ul>
      )}
      <p className="muted small pg-usage-note">{t("pages.ais.usage.campaignNote")}</p>
    </section>
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
        <EmptyState icon="error" tone="error" role="alert" title={t("pages.ais.loadError")}>
          <Details>
            <p className="small muted">{state.error instanceof Error ? state.error.message : String(state.error)}</p>
          </Details>
        </EmptyState>
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

          <UsageSection />

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
