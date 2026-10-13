import { bundleUrl } from "../../api/client";
import type { MetricsV2 } from "../../api/types";
import { useIntentLabel } from "../../format";
import { useFormat, useT } from "../../i18n";
import { humanizeId } from "./helpers";

/**
 * Analytical view (Deeper numbers): the Visibility Index per AI and per question type, head-to-head
 * against each competitor, the config fingerprint, and a link to download this check as a verifiable
 * bundle (scripts/verify_bundle.py recomputes every number from it).
 */
export function VisibilityTables({
  m,
  entities,
  labelOf,
  brandKey,
  runId,
}: {
  m: MetricsV2;
  entities?: Record<string, string>;
  labelOf: (id: string) => string;
  brandKey: string;
  runId: string;
}) {
  const t = useT();
  const fmt = useFormat();
  const intentLabel = useIntentLabel();
  const vi = (v: number) => fmt.number(v, Math.abs(v) < 10 ? 1 : 0);
  const name = (id: string) => entities?.[id] ?? humanizeId(id);

  return (
    <>
      <h3 className="dash-sub">{t("dashboard.v2.table.title")}</h3>
      <p className="section-note">{t("dashboard.v2.table.intro")}</p>
      <div className="card card-flush">
        <table className="v2-table">
          <thead>
            <tr>
              <th>{t("dashboard.v2.table.ai")}</th>
              <th className="num">{t("dashboard.v2.table.vi")}</th>
              <th className="num">{t("dashboard.v2.table.named")}</th>
              <th className="num">{t("dashboard.v2.table.answered")}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(m.per_provider).map(([id, g]) => (
              <tr key={id}>
                <td>{labelOf(id)}</td>
                <td className="num">{vi(g.vi)}</td>
                <td className="num">{t("dashboard.v2.table.ofN", { m: g.named, n: g.answers })}</td>
                <td className="num">{t("dashboard.v2.table.ofN", { m: g.answered, n: g.answers })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-flush">
        <table className="v2-table">
          <thead>
            <tr>
              <th>{t("dashboard.v2.table.intent")}</th>
              <th className="num">{t("dashboard.v2.table.vi")}</th>
              <th className="num">{t("dashboard.v2.table.named")}</th>
              <th className="num">{t("dashboard.v2.table.questions")}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(m.per_intent).map(([id, g]) => (
              <tr key={id}>
                <td>{intentLabel(id)}</td>
                <td className="num">{vi(g.vi)}</td>
                <td className="num">{t("dashboard.v2.table.ofN", { m: g.named, n: g.answers })}</td>
                <td className="num">{fmt.number(g.questions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(m.head_to_head).length > 0 && (
        <div className="card card-flush">
          <table className="v2-table">
            <thead>
              <tr>
                <th>{t("dashboard.v2.h2h.competitor")}</th>
                <th className="num">{t("dashboard.v2.h2h.vi")}</th>
                <th className="num">{t("dashboard.v2.h2h.ahead")}</th>
                <th className="num">{t("dashboard.v2.h2h.behind")}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(m.head_to_head).map(([id, h]) => (
                <tr key={id}>
                  <td>{name(id)}</td>
                  <td className="num">{vi(m.entities[id]?.vi ?? 0)}</td>
                  <td className="num">{fmt.number(h.wins)}</td>
                  <td className="num">{fmt.number(h.losses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="section-note">
        {t("dashboard.v2.config", { version: m.metric_version, hash: m.metric_config_hash })}{" "}
        <a href={bundleUrl(brandKey, runId)} download>
          {t("dashboard.v2.bundle")}
        </a>
      </p>
    </>
  );
}
