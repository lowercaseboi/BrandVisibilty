import type { MentionSummary, MetricsV2 } from "../../api/types";
import { T, useFormat, useT } from "../../i18n";
import { Details } from "../../settings/details";
import { humanizeId, mentionRows } from "./helpers";
import type { MentionRow } from "./helpers";

type Row = MentionRow & { total: number; vi?: number };

/** Metrics v2 rows: ordered by Visibility Index (how often AND how high each brand is named). */
function v2Rows(m: MetricsV2, entities: Record<string, string> | undefined, selfName: string): Row[] | null {
  const rows: Row[] = Object.entries(m.entities)
    .map(([id, e]) => ({
      id,
      name: id === m.self_id ? (entities?.[id] ?? selfName) : (entities?.[id] ?? humanizeId(id)),
      isSelf: id === m.self_id,
      mentioning: e.named,
      first: e.first,
      total: e.answers,
      vi: e.vi,
    }))
    .sort((a, b) => (b.vi ?? 0) - (a.vi ?? 0) || Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name));
  return rows.length < 2 ? null : rows;
}

/** "Who AI recommends instead": how many answers named you and each competitor you listed. Body only —
 * the caller supplies the heading. With metrics v2 the order and bar length follow the Visibility
 * Index (a mention near the top of a list counts more than one at the bottom); the label stays a plain
 * count. The "ranked first" counts and the index itself are for the Analytical view. */
export function CompetitorBars({
  summary,
  entities,
  selfName,
  metrics,
}: {
  summary: MentionSummary | undefined;
  entities?: Record<string, string>;
  selfName: string;
  metrics?: MetricsV2;
}) {
  const t = useT();
  const fmt = useFormat();
  const v1 = mentionRows(summary, entities, selfName);
  const rows: Row[] | null = metrics
    ? v2Rows(metrics, entities, selfName)
    : v1 && summary
      ? v1.map((r) => ({ ...r, total: summary.total_answers }))
      : null;
  if (!rows) return <p className="muted">{t("dashboard.who.empty")}</p>;
  const total = metrics ? metrics.answers : (summary?.total_answers ?? 0);
  const maxVi = Math.max(...rows.map((r) => r.vi ?? 0));

  const leader = rows[0];
  // Only claim a leader when one brand is strictly ahead of the rest.
  const clearLeader = metrics
    ? (leader.vi ?? 0) > 0 && (leader.vi ?? 0) > (rows[1].vi ?? 0)
    : leader.mentioning > 0 && leader.mentioning > rows[1].mentioning;

  return (
    <>
      <p className="section-note">{t.n("dashboard.who.intro", total)}</p>
      <div>
        {clearLeader && (
          <p className="who-lead">
            {leader.isSelf ? (
              <T k="dashboard.who.youLead" />
            ) : (
              <T k="dashboard.who.leader" vars={{ name: leader.name }} />
            )}
          </p>
        )}
        <ul className="who-list">
          {rows.map((r) => {
            const frac = metrics ? (maxVi > 0 ? (r.vi ?? 0) / maxVi : 0) : Math.min(1, r.mentioning / Math.max(1, r.total));
            return (
              <li key={r.id} className={`who-row ${r.isSelf ? "is-self" : ""}`}>
                <div className="who-row-top">
                  <span className="who-name">{r.isSelf ? t("dashboard.who.you", { name: r.name }) : r.name}</span>
                  <span className="who-count">
                    {t(r.total === 1 ? "dashboard.who.count_one" : "dashboard.who.count_other", { m: r.mentioning, n: r.total })}
                  </span>
                </div>
                <div className="who-track" aria-hidden="true">
                  <div className="who-fill" style={{ width: `${frac * 100}%` }} />
                </div>
                {(r.first > 0 || r.vi !== undefined) && (
                  <Details>
                    <span className="who-first">
                      {r.vi !== undefined && t("dashboard.v2.whoVi", { vi: fmt.number(r.vi, Math.abs(r.vi) < 10 ? 1 : 0) })}
                      {r.vi !== undefined && r.first > 0 && " · "}
                      {r.first > 0 && t.n("dashboard.who.first", r.first)}
                    </span>
                  </Details>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
