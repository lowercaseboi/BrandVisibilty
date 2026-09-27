import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import type { Gap, Recommendation } from "../../api/types";
import { evidenceHref } from "../../format";
import { T, useFormat, useT } from "../../i18n";
import { actionCopy } from "./actions";
import { effortKey, effortLevel, gapFinding, humanizeId, sortByPriority } from "./helpers";

const TOP = 3;

// "Done" ticks live in this browser only (no backend), per brand, keyed by the suggestion's group
// key (action|competitor). That key is stable across runs, unlike recommendation IDs.
const doneKey = (brandKey: string) => `bv.done.${brandKey}`;

function readDone(brandKey: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(doneKey(brandKey)) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDone(brandKey: string, done: Set<string>) {
  try {
    localStorage.setItem(doneKey(brandKey), JSON.stringify([...done]));
  } catch {
    /* storage unavailable */
  }
}

interface Suggestion {
  key: string;
  /** Highest-priority recommendation in the group; drives title, effort and points. */
  lead: Recommendation;
  gaps: Gap[];
  refs: string[];
}

// The backend can suggest the same action for two gaps (e.g. "get listed" for two AIs).
// A brand owner should see one card per thing to do, with every reason under "Why?".
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
  done,
  onToggleDone,
}: {
  s: Suggestion;
  index: number;
  done: boolean;
  onToggleDone: () => void;
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
    <li className={`card next-card${done ? " is-done" : ""}`}>
      <div className="next-card-head">
        <span className="next-num" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="next-title">{title}</h3>
      </div>
      <label className="next-done">
        <input type="checkbox" checked={done} onChange={onToggleDone} />
        <span>{t("dashboard.next.markDone")}</span>
      </label>
      <dl className="next-meta">
        <div>
          <dt className="eyebrow">{t("dashboard.next.effortLabel")}</dt>
          <dd>
            <span className={`effort-meter effort-${effortLevel(rec.effort)}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {t(effortKey(rec.effort))}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t("dashboard.next.impactLabel")}</dt>
          <dd className="next-impact">{points > 0 ? t("dashboard.next.points", { n: fmt.number(points) }) : "—"}</dd>
        </div>
      </dl>

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

/**
 * "What to do next": the top suggestions as plain, local steps; the rest behind a button.
 * Renders only its body — the caller (BrandDashboardPage) supplies the heading via
 * CollapsibleSection. `onSummaryChange` reports the live "done of total" count upward so the
 * caller can show it in the section's collapsed summary.
 */
export function NextSteps({
  recommendations,
  gaps,
  brandKey,
  runId,
  entities,
  labelOf,
  onSummaryChange,
}: {
  recommendations: Recommendation[];
  gaps: Gap[];
  brandKey: string;
  runId: string;
  entities?: Record<string, string>;
  labelOf: (id: string) => string;
  onSummaryChange?: (done: number, total: number) => void;
}) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const [done, setDone] = useState<Set<string>>(() => readDone(brandKey));
  const toggleDone = (key: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeDone(brandKey, next);
      return next;
    });
  const listId = useId();
  const gapById = new Map(gaps.map((g) => [g.gap_id, g]));
  const suggestions = groupSuggestions(recommendations, gapById);
  const visible = showAll ? suggestions : suggestions.slice(0, TOP);
  const doneCount = suggestions.filter((s) => done.has(s.key)).length;

  useEffect(() => {
    onSummaryChange?.(doneCount, suggestions.length);
  }, [doneCount, suggestions.length, onSummaryChange]);

  if (suggestions.length === 0) {
    return <p className="muted">{t("dashboard.next.empty")}</p>;
  }

  return (
    <>
      <p className="section-note">{t("dashboard.next.intro")}</p>
      <div className="next-progress">
        <span>{t("dashboard.next.progress", { done: doneCount, total: suggestions.length })}</span>
        <div className="progress progress-mini" aria-hidden="true">
          <div className="progress-bar" style={{ width: `${(doneCount / suggestions.length) * 100}%` }} />
        </div>
      </div>
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
            done={done.has(s.key)}
            onToggleDone={() => toggleDone(s.key)}
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
  );
}
