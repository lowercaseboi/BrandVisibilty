import { useId, useState } from "react";
import { Link } from "react-router-dom";
import type { Gap, Recommendation } from "../../api/types";
import { evidenceHref } from "../../format";
import { T, useFormat, useT } from "../../i18n";
import { actionCopy } from "./actions";
import { effortKey, gapFinding, humanizeId, sortByPriority } from "./helpers";

const TOP = 3;

interface Suggestion {
  key: string;
  /** Highest-priority recommendation in the group; drives title, effort and points. */
  lead: Recommendation;
  gaps: Gap[];
  refs: string[];
}

// The backend can suggest the same action for two gaps (e.g. "get listed" for two AIs).
// A shop owner should see one card per thing to do, with every reason under "Why?".
function groupSuggestions(recs: Recommendation[], gapById: Map<string, Gap>): Suggestion[] {
  const out: Suggestion[] = [];
  const byKey = new Map<string, Suggestion>();
  for (const rec of sortByPriority(recs)) {
    const gap = gapById.get(rec.gap_id);
    const competitor = typeof gap?.detail?.competitor_id === "string" ? gap.detail.competitor_id : "";
    const key = `${rec.action}|${competitor}`;
    const existing = byKey.get(key);
    if (existing) {
      if (gap && !existing.gaps.includes(gap)) existing.gaps.push(gap);
      for (const r of rec.evidence_refs ?? []) if (!existing.refs.includes(r)) existing.refs.push(r);
      continue;
    }
    const s: Suggestion = { key, lead: rec, gaps: gap ? [gap] : [], refs: [...(rec.evidence_refs ?? [])] };
    byKey.set(key, s);
    out.push(s);
  }
  return out;
}

function SuggestionCard({
  s,
  index,
  brandKey,
  runId,
  entities,
  labelOf,
}: {
  s: Suggestion;
  index: number;
  brandKey: string;
  runId: string;
  entities?: Record<string, string>;
  labelOf: (id: string) => string;
}) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const whyId = useId();
  const rec = s.lead;
  const copy = actionCopy(rec.action);

  const competitorId = s.gaps.find((g) => typeof g.detail?.competitor_id === "string")?.detail.competitor_id as
    | string
    | undefined;
  const competitor = competitorId ? (entities?.[competitorId] ?? humanizeId(competitorId)) : null;

  let title: string;
  if (!copy) title = humanizeId(rec.action);
  else if (copy.titleGeneric && !competitor) title = t(copy.titleGeneric);
  else title = t(copy.title, { competitor: competitor ?? "" });

  const points = Math.round(rec.delta_composite ?? 0);

  return (
    <li className="card next-card">
      <div className="next-card-head">
        <span className="next-num" aria-hidden="true">
          {index + 1}
        </span>
        <h3 className="next-title">{title}</h3>
      </div>
      <div className="next-chips">
        <span className={`pill next-effort next-effort-${rec.effort >= 5 ? "big" : rec.effort >= 2 ? "some" : "quick"}`}>
          {t(effortKey(rec.effort))}
        </span>
        {points > 0 && <span className="pill pill-accent">{t("dashboard.next.points", { n: fmt.number(points) })}</span>}
      </div>

      {copy ? (
        <ol className="next-steps" aria-label={t("dashboard.next.stepsLabel")}>
          {copy.steps.map((k) => (
            <li key={k}>{t(k, { competitor: competitor ?? "" })}</li>
          ))}
        </ol>
      ) : (
        <p className="next-fallback" lang="en">
          {rec.reasoning}
        </p>
      )}

      <div className="next-why">
        <button
          type="button"
          className="btn-link next-why-toggle"
          aria-expanded={open}
          aria-controls={whyId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="disclosure-caret" aria-hidden="true" />
          {t("dashboard.next.why")}
        </button>
        <div id={whyId} className="next-why-body" hidden={!open}>
          {s.gaps.length > 0 ? (
            s.gaps.map((g) => {
              const f = gapFinding(g, t, fmt, entities, labelOf);
              return (
                <p key={g.gap_id}>
                  <T k={f.key} vars={f.vars} />
                </p>
              );
            })
          ) : (
            <p>{t("dashboard.why.unknown")}</p>
          )}
          {s.refs.length > 0 && (
            <Link to={evidenceHref(brandKey, runId, s.refs)} className="next-evidence">
              {t("dashboard.next.seeAnswers")}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** "What to do next": the top suggestions as plain, local steps; the rest behind a button. */
export function NextSteps({
  recommendations,
  gaps,
  brandKey,
  runId,
  entities,
  labelOf,
}: {
  recommendations: Recommendation[];
  gaps: Gap[];
  brandKey: string;
  runId: string;
  entities?: Record<string, string>;
  labelOf: (id: string) => string;
}) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const gapById = new Map(gaps.map((g) => [g.gap_id, g]));
  const suggestions = groupSuggestions(recommendations, gapById);
  const visible = showAll ? suggestions : suggestions.slice(0, TOP);

  return (
    <section className="dash-section" aria-labelledby="next-title">
      <h2 id="next-title">{t("dashboard.next.title")}</h2>
      {suggestions.length === 0 ? (
        <p className="muted">{t("dashboard.next.empty")}</p>
      ) : (
        <>
          <p className="section-note">{t("dashboard.next.intro")}</p>
          <ol className="next-list" id={listId}>
            {visible.map((s, i) => (
              <SuggestionCard
                key={s.key}
                s={s}
                index={i}
                brandKey={brandKey}
                runId={runId}
                entities={entities}
                labelOf={labelOf}
              />
            ))}
          </ol>
          {suggestions.length > TOP && (
            <button
              type="button"
              className="btn btn-secondary next-more"
              aria-expanded={showAll}
              aria-controls={listId}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? t("dashboard.next.showFewer") : t.n("dashboard.next.showAll", suggestions.length)}
            </button>
          )}
        </>
      )}
    </section>
  );
}
