import type { ProviderBreakdown } from "../api/types";
import { useFormat, useT } from "../i18n";

export function ProviderTable({
  providers,
  labelOf = (id: string) => id,
}: {
  providers: ProviderBreakdown[];
  labelOf?: (id: string) => string;
}) {
  const t = useT();
  const fmt = useFormat();
  if (providers.length === 0) {
    return <p className="empty pad">{t("dashboard.providers.empty")}</p>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">{t("dashboard.providers.ai")}</th>
          <th scope="col">{t("dashboard.providers.coverage")}</th>
          <th scope="col" className="num">
            {t("dashboard.providers.answers")}
          </th>
          <th scope="col" className="num">
            {t("dashboard.providers.mentions")}
          </th>
        </tr>
      </thead>
      <tbody>
        {providers.map((p) => (
          <tr key={p.provider_id}>
            <th scope="row">
              <strong>{labelOf(p.provider_id)}</strong>
              {labelOf(p.provider_id) !== p.provider_id && <code className="provider-id">{p.provider_id}</code>}
            </th>
            <td>
              <div className="bar-cell">
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(100, p.coverage * 100)}%` }} />
                </div>
                <span className="num">{fmt.percent(p.coverage, 1)}</span>
              </div>
            </td>
            <td className="num">{fmt.number(p.observation_count)}</td>
            <td className="num">{fmt.number(p.mentioned_count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
