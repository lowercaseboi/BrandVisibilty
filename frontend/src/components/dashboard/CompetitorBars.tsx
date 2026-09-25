import type { MentionSummary } from "../../api/types";
import { T, useT } from "../../i18n";
import { humanizeId } from "./helpers";

interface Row {
  id: string;
  name: string;
  isSelf: boolean;
  mentioning: number;
  first: number;
}

/** "Who AI recommends": how many answers named you and each competitor you listed. */
export function CompetitorBars({
  summary,
  entities,
  shopName,
}: {
  summary: MentionSummary | undefined;
  entities?: Record<string, string>;
  shopName: string;
}) {
  const t = useT();
  if (!summary || !summary.entities || summary.total_answers <= 0) return null;
  const total = summary.total_answers;

  const rows: Row[] = Object.entries(summary.entities)
    .map(([id, c]) => ({
      id,
      name: id === "self" ? (entities?.self ?? shopName) : (entities?.[id] ?? humanizeId(id)),
      isSelf: id === "self",
      mentioning: c.answers_mentioning ?? 0,
      first: c.answers_ranked_first ?? 0,
    }))
    // Most-named first; ties keep "you" on top, then by name, so the order never jumps.
    .sort(
      (a, b) =>
        b.mentioning - a.mentioning ||
        b.first - a.first ||
        Number(b.isSelf) - Number(a.isSelf) ||
        a.name.localeCompare(b.name),
    );
  if (rows.length < 2) return null;

  const leader = rows[0];
  // Only claim a leader when one shop is named strictly more often than the rest.
  const clearLeader = leader.mentioning > 0 && leader.mentioning > rows[1].mentioning;

  return (
    <section className="dash-section" aria-labelledby="who-title">
      <h2 id="who-title">{t("dashboard.who.title")}</h2>
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
    </section>
  );
}
