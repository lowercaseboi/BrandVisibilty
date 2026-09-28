import type { MentionSummary } from "../../api/types";
import { T, useT } from "../../i18n";
import { mentionRows } from "./helpers";

/** "Who AI recommends": how many answers named you and each competitor you listed. Body only — the
 * caller (the Analysis module's "Deeper numbers") supplies the heading. `competitiveLeaderName` in
 * ./helpers gives a one-line summary from the same props. */
export function CompetitorBars({
  summary,
  entities,
  selfName,
}: {
  summary: MentionSummary | undefined;
  entities?: Record<string, string>;
  selfName: string;
}) {
  const t = useT();
  const rows = mentionRows(summary, entities, selfName);
  if (!rows || !summary) return <p className="muted">{t("dashboard.who.empty")}</p>;
  const total = summary.total_answers;

  const leader = rows[0];
  // Only claim a leader when one brand is named strictly more often than the rest.
  const clearLeader = leader.mentioning > 0 && leader.mentioning > rows[1].mentioning;

  return (
    <>
      <p className="section-note">{t.n("dashboard.who.intro", total)}</p>
      <div className="card who-card">
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
            const frac = Math.min(1, r.mentioning / total);
            return (
              <li key={r.id} className={`who-row ${r.isSelf ? "is-self" : ""}`}>
                <div className="who-row-top">
                  <span className="who-name">{r.isSelf ? t("dashboard.who.you", { name: r.name }) : r.name}</span>
                  <span className="who-count">
                    {t(total === 1 ? "dashboard.who.count_one" : "dashboard.who.count_other", { m: r.mentioning, n: total })}
                  </span>
                </div>
                <div className="who-track" aria-hidden="true">
                  <div className="who-fill" style={{ width: `${frac * 100}%` }} />
                </div>
                {r.first > 0 && <span className="who-first">{t.n("dashboard.who.first", r.first)}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
