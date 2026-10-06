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

  // Phones restyle each row as a small card (name + coverage, the bar, then the counts); the
  // explicit roles keep it a table for screen readers once CSS changes the rows' display.
  return (
    <table className="table provider-table" role="table">
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">
            {t("dashboard.providers.ai")}
          </th>
          <th scope="col" role="columnheader">
            {t("dashboard.providers.coverage")}
          </th>
          <th scope="col" role="columnheader" className="num">
            {t("dashboard.providers.answers")}
          </th>
          <th scope="col" role="columnheader" className="num">
            {t("dashboard.providers.mentions")}
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {providers.map((p) => (
          <tr key={p.provider_id} role="row">
            <th scope="row" role="rowheader" className="pt-name">
              <strong>{labelOf(p.provider_id)}</strong>
              {labelOf(p.provider_id) !== p.provider_id && <code className="provider-id">{p.provider_id}</code>}
            </th>
            <td role="cell" className="pt-coverage">
              <div className="bar-cell">
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(100, p.coverage * 100)}%` }} />
                </div>
                <span className="num">{fmt.percent(p.coverage, 1)}</span>
              </div>
            </td>
            <td role="cell" className="num pt-count" data-label={t("dashboard.providers.answers")}>
              {fmt.number(p.observation_count)}
            </td>
            <td role="cell" className="num pt-count" data-label={t("dashboard.providers.mentions")}>
              {fmt.number(p.mentioned_count)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
