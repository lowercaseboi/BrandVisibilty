import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { getObservations } from "../../api/client";
import type { Gap } from "../../api/types";
import { useAsync } from "../../api/useAsync";
import { EmptyState } from "../../components/EmptyState";
import { GapList } from "../../components/GapList";
import { SampleAnswer } from "../../components/dashboard/SampleAnswer";
import { pickSample, sampleReason } from "../../components/dashboard/answerHighlight";
import { gapScopeText, gapTypeText } from "../../components/dashboard/helpers";
import { EvidenceBrowser } from "../../components/evidence/EvidenceBrowser";
import { gapKey, parseRefs, sameRefs, scopeObservations } from "../../components/evidence/filter";
import { ModuleShell } from "../../components/module/ModuleShell";
import { brandHref } from "../../components/module/modules";
import { TransitionLink } from "../../components/module/transition";
import { T, useFormat, useT } from "../../i18n";
import { Details } from "../../settings/details";
import { prefersReducedMotion } from "../../settings/motion";
import { useBrandData } from "./BrandContext";

/**
 * Gaps & evidence: the detected gaps (left) connected to the verbatim AI responses behind them
 * (right). Selecting a gap narrows the evidence to its `evidence_refs`; nothing selected shows a
 * spotlight answer and every response. The URL is the state, so links deep-link straight in:
 *   ?run=<id>   which analysis (default: the latest; an older one shows a note)
 *   ?gap=<id>   a selected gap (scrolled into view on arrival)
 *   ?refs=a,b   specific responses, e.g. behind a recommendation (old /runs/:id/evidence links)
 */
export function GapsModule() {
  const t = useT();
  const fmt = useFormat();
  const { brandKey, latest, history, labelOf } = useBrandData();
  const [params, setParams] = useSearchParams();
  const evidenceId = useId();
  const evidenceRef = useRef<HTMLDivElement>(null);
  const listPaneRef = useRef<HTMLDivElement>(null);

  const runParam = params.get("run");
  const gapParam = params.get("gap");
  const refsParam = params.get("refs");

  // ---- which run
  const runId = runParam ?? latest?.run_id ?? null;
  const isOlder = !!runParam && !!latest && runParam !== latest.run_id;
  const runSnap = runId ? (latest?.run_id === runId ? latest : (history.find((s) => s.run_id === runId) ?? null)) : null;
  const gaps: Gap[] = useMemo(() => runSnap?.gaps ?? [], [runSnap]);

  // ---- which gap / refs: an explicit ?gap=, else a ?refs= that is exactly one gap's evidence
  const urlRefs = useMemo(() => parseRefs(refsParam), [refsParam]);
  const selectedIndex = useMemo(() => {
    if (gapParam) return gaps.findIndex((g, i) => gapKey(g, i) === gapParam);
    if (urlRefs) return gaps.findIndex((g) => sameRefs(g, urlRefs));
    return -1;
  }, [gaps, gapParam, urlRefs]);
  const selectedGap = selectedIndex >= 0 ? gaps[selectedIndex] : null;
  const selectedId = selectedGap ? gapKey(selectedGap, selectedIndex) : null;
  const refs = useMemo(
    () => (selectedGap ? new Set(selectedGap.evidence_refs ?? []) : urlRefs),
    [selectedGap, urlRefs],
  );
  // A ?gap= that isn't in this run (e.g. a board card whose gap was resolved by a later run).
  const gapMissing = !!gapParam && !selectedGap && !!runSnap;

  // ---- the run's responses
  const obsState = useAsync(
    () => (runId ? getObservations(brandKey, runId) : Promise.resolve(null)),
    [brandKey, runId],
  );
  const obsData = obsState.status === "ready" ? obsState.data : null;
  const all = useMemo(() => obsData?.observations ?? [], [obsData]);
  const entities = obsData?.entities ?? runSnap?.entities ?? {};
  const scoped = useMemo(() => scopeObservations(all, refs), [all, refs]);
  const sample = useMemo(() => (refs ? null : pickSample(all)), [all, refs]);

  // ---- URL updates (replace: picking gaps shouldn't fill the back button)
  const pickedByUser = useRef(false);
  const select = useCallback(
    (id: string) => {
      const deselect = id === selectedId;
      pickedByUser.current = !deselect;
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("refs");
          if (deselect) next.delete("gap");
          else next.set("gap", id);
          return next;
        },
        { replace: true },
      );
    },
    [setParams, selectedId],
  );
  const clear = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("gap");
        next.delete("refs");
        return next;
      },
      { replace: true },
    );
  }, [setParams]);
  // Gaps and refs belong to the old run, so going to the latest starts clean.
  const toLatest = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  // ---- scrolling: a deep-linked ?gap= is brought into view once; a gap picked here brings the
  // re-filtered evidence into view when it's off-screen (stacked panes on narrow screens).
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) {
      handled.current = null;
      return;
    }
    if (handled.current === selectedId) return;
    handled.current = selectedId;
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
    if (pickedByUser.current) {
      pickedByUser.current = false;
      const el = evidenceRef.current;
      const top = el?.getBoundingClientRect().top ?? 0;
      if (el && (top < 0 || top > window.innerHeight * 0.66)) el.scrollIntoView({ behavior, block: "start" });
      return;
    }
    // Deep link: centre the gap. On wide screens only the sticky list pane scrolls, so the page
    // (module header, evidence heading) stays put; stacked on narrow screens, the page scrolls.
    const card = document.getElementById(`gap-${selectedId}`);
    const pane = listPaneRef.current;
    if (card && pane && getComputedStyle(pane).position === "sticky" && pane.scrollHeight > pane.clientHeight) {
      pane.scrollTo({ top: card.offsetTop - (pane.clientHeight - card.offsetHeight) / 2, behavior });
    } else {
      card?.scrollIntoView({ behavior, block: "center" });
    }
  }, [selectedId]);

  if (!runId) {
    return (
      <ModuleShell id="gaps">
        <EmptyState
          icon="chart"
          title={t("dashboard.empty.title")}
          body={t("modules.gaps.none.body")}
          primary={
            <TransitionLink to={brandHref(brandKey, "analysis")} className="btn btn-primary">
              {t("modules.gaps.none.cta")}
            </TransitionLink>
          }
        />
      </ModuleShell>
    );
  }

  const selecting = !!refs;
  const found = scoped.length;
  const n = refs?.size ?? 0;

  return (
    <ModuleShell id="gaps">
      {isOlder && (
        <div className="alert alert-info filter-note" role="note">
          <span>
            {runSnap
              ? t("modules.evidence.olderRun", { when: fmt.date(runSnap.collection_completed_at) })
              : t("modules.evidence.olderRunUnknown")}
          </span>
          <button type="button" className="btn btn-link" onClick={toLatest}>
            {t("modules.evidence.toLatest")}
          </button>
        </div>
      )}

      <div className="gaps-layout">
        {/* Left: the gaps. Sticky on wide screens so another gap is one click away while reading evidence. */}
        <div ref={listPaneRef} className="gaps-pane gaps-list-pane">
          <div className="module-section-head">
            <div>
              <p className="eyebrow">{t("modules.gaps.eyebrow")}</p>
              <h2>
                {t("dashboard.gaps.title")} <span className="count">{fmt.number(gaps.length)}</span>
              </h2>
              <p>{gaps.length > 0 ? t("modules.gaps.hint") : t("dashboard.gaps.intro")}</p>
            </div>
          </div>
          <GapList
            gaps={gaps}
            brandKey={brandKey}
            runId={runId}
            entities={runSnap?.entities}
            selectedGapId={selectedId}
            onSelect={select}
            controlsId={evidenceId}
            labelOf={labelOf}
          />
        </div>

        {/* Right: the responses, narrowed to the selection. */}
        <div
          ref={evidenceRef}
          id={evidenceId}
          className={`gaps-pane gaps-evidence-pane${selecting ? " is-linked" : ""}`}
          aria-labelledby={`${evidenceId}-title`}
          role="region"
        >
          <div className="module-section-head">
            <div>
              <p className="eyebrow">{t("modules.evidence.eyebrow")}</p>
              <h2 id={`${evidenceId}-title`}>{t("pages.answers.title")}</h2>
              <p>{t("pages.answers.lede")}</p>
              <Details>
                <p className="small muted pg-tech">
                  {t("pages.answers.runLabel")} <code>{runId}</code>
                </p>
              </Details>
            </div>
          </div>

          {/* The link between the panes: what's selected, how many responses back it, and a way out. */}
          <div className="evidence-selection-slot" role="status">
            {selecting && (
              <div className="evidence-selection">
                {selectedGap && (
                  <span className="evidence-selection-gap">
                    <span className={`badge gap-type gap-type-${selectedGap.gap_type}`}>
                      {gapTypeText(selectedGap.gap_type, t)}
                    </span>
                    <span className="gap-scope">{gapScopeText(selectedGap, t, runSnap?.entities, labelOf)}</span>
                  </span>
                )}
                <span className="evidence-selection-text">
                  <T
                    k={
                      selectedGap
                        ? n === 1
                          ? "modules.evidence.forGap_one"
                          : "modules.evidence.forGap_other"
                        : n === 1
                          ? "modules.evidence.forRefs_one"
                          : "modules.evidence.forRefs_other"
                    }
                    vars={{ n: fmt.number(n) }}
                  />
                  {obsData && found !== n && found > 0 && (
                    <> {t("modules.evidence.found", { found: fmt.number(found) })}</>
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-small evidence-clear"
                  onClick={clear}
                  aria-label={t("modules.evidence.clearAria")}
                >
                  {t("modules.evidence.clear")}
                </button>
              </div>
            )}
          </div>

          {gapMissing && (
            <div className="alert alert-warn filter-note" role="note">
              <span>{t("modules.evidence.gapMissing")}</span>
            </div>
          )}

          {obsState.status === "loading" && <p className="status">{t("pages.answers.loading")}</p>}
          {obsState.status === "error" && (
            <div className="alert alert-error" role="alert">
              <p>{t("pages.answers.loadError")}</p>
              <Details>
                <p className="small">
                  {obsState.error instanceof Error ? obsState.error.message : String(obsState.error)}
                </p>
              </Details>
            </div>
          )}

          {obsData && !selecting && sample && (
            <div className="evidence-spotlight">
              <p className="eyebrow evidence-spotlight-label">{t("modules.evidence.spotlight")}</p>
              <SampleAnswer
                obs={sample}
                runId={runId}
                labelOf={labelOf}
                caption={
                  sampleReason(sample) === "outranked"
                    ? t("modules.evidence.spotlightOutranked")
                    : t("modules.evidence.spotlightNamed")
                }
              />
            </div>
          )}
          {obsData && !selecting && gaps.length > 0 && <p className="evidence-hint">{t("modules.evidence.hint")}</p>}

          {obsData &&
            (selecting && found === 0 ? (
              <p className="empty evidence-none">{t("modules.evidence.noneLinked")}</p>
            ) : (
              <>
                {!selecting && sample && <h3 className="dash-sub evidence-all">{t("modules.evidence.all")}</h3>}
                <EvidenceBrowser
                  key={`${runId}|${selectedId ?? refsParam ?? "all"}`}
                  observations={scoped}
                  entities={entities}
                  aiName={labelOf}
                />
              </>
            ))}
        </div>
      </div>
    </ModuleShell>
  );
}
