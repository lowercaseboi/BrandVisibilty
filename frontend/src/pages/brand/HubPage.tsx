import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ModuleId } from "../../components/module/modules";
import { MODULES, brandVtName } from "../../components/module/modules";
import { TransitionLink, viewTransitionFinished } from "../../components/module/transition";
import { getBoard } from "../../api/client";
import type { BoardState } from "../../api/types";
import { buildBoard, summarizeBoard } from "../../components/board/boardModel";
import { BoardPreview } from "../../components/hub/BoardPreview";
import { BrandCardBody } from "../../components/hub/BrandCardBody";
import { peekBrandSummary } from "../../components/hub/brandCache";
import { LiveWires } from "../../components/hub/LiveWires";
import { ModuleCard } from "../../components/hub/ModuleCard";
import { AnalysisPreview, DetailsPreview, GapsPreview, PreviewSkeleton } from "../../components/hub/previews";
import { useT } from "../../i18n";
import { useBrandData } from "./BrandContext";

/**
 * How the hub was reached: a plain load, the list → hub card morph, or back from one of its
 * modules (whose header shrinks back into its card). Called while rendering inside the View
 * Transition's flushSync, before commit, so the page being left is still in the DOM.
 */
function arrival(): "direct" | "morph" | "module" {
  if (typeof document === "undefined" || !("vt" in document.documentElement.dataset)) return "direct";
  return document.querySelector(".module[data-module]") ? "module" : "morph";
}

/**
 * `/brands/:key` — the brand hub. The brand's card from the list sits in the centre (the list card
 * morphs into it through a View Transition), with the four module cards around it in 3D glass,
 * joined to it by live wires. Each module card previews what's inside and opens the module.
 */
export function HubPage() {
  const t = useT();
  const data = useBrandData();
  const { brandKey, brandName, latest, history, questions, profile, status } = data;

  // Decided once at mount, so the entrance choreography (hub.css: wires and modules grow out of the
  // centre card as the card morph lands, or are already in place back from a module) never restarts.
  const [from] = useState(arrival);
  const [play, setPlay] = useState(0);
  const [active, setActive] = useState<ModuleId | null>(null);
  // While the list → hub morph runs, the module cards stay out of it (see ModuleCard `named`).
  const [landing, setLanding] = useState(() => from === "morph" && viewTransitionFinished() !== null);
  useEffect(() => {
    const done = landing ? viewTransitionFinished() : null;
    if (!done) return;
    let live = true;
    done.then(() => live && setLanding(false));
    return () => {
      live = false;
    };
  }, [landing]);
  // The morph (or a click) often leaves the pointer over the centre card as it lands: don't let
  // that "hover" restart the score count-up in the middle of the entrance.
  const [mountedAt] = useState(() => performance.now());
  const replay = () => {
    if (performance.now() - mountedAt > 1000) setPlay((n) => n + 1);
  };

  const stageRef = useRef<HTMLDivElement | null>(null);
  const centreRef = useRef<HTMLDivElement | null>(null);
  const moduleRefs = useRef<Partial<Record<ModuleId, HTMLElement | null>>>({});
  const setModuleRef = useCallback(
    (id: ModuleId) => (el: HTMLElement | null) => {
      moduleRefs.current[id] = el;
    },
    [],
  );
  // Each module card emerges from the centre card: give it the offset from its resting place to the
  // centre card's middle (--from-x/--from-y, hub.css hub-emerge) before the first paint. Layout
  // boxes only (offsets ignore transforms), so the tilt or the animation itself never skews it.
  useLayoutEffect(() => {
    const centre = centreRef.current;
    if (!centre) return;
    const mid = (el: HTMLElement) => {
      let x = el.offsetWidth / 2;
      let y = el.offsetHeight / 2;
      for (let n: HTMLElement | null = el; n && n !== stageRef.current; n = n.offsetParent as HTMLElement | null) {
        x += n.offsetLeft;
        y += n.offsetTop;
      }
      return { x, y };
    };
    const c = mid(centre);
    for (const el of Object.values(moduleRefs.current)) {
      if (!el) continue;
      const m = mid(el);
      el.style.setProperty("--from-x", `${Math.round(c.x - m.x)}px`);
      el.style.setProperty("--from-y", `${Math.round(c.y - m.y)}px`);
    }
  });
  const activate = (id: ModuleId) => (on: boolean) => setActive((cur) => (on ? id : cur === id ? null : cur));

  // Name / question count: the list's summary fills the first frame, then the loaded data.
  const summary = peekBrandSummary(brandKey);
  const questionCount = questions?.scored_count ?? summary?.question_count ?? null;
  const hasData = latest !== null || (status === "loading" ? (summary?.has_data ?? true) : history.length > 0);
  const skeleton = status === "loading" && !latest && !summary;
  const recCount = latest?.recommendations?.length ?? 0;

  // Where the brand's suggestions sit on the recommendation board (read-only here; the board
  // module owns saving). Until the board loads — or if it can't — everything counts as Suggested.
  const [board, setBoard] = useState<BoardState | null>(null);
  useEffect(() => {
    let cancelled = false;
    getBoard(brandKey)
      .then((b) => !cancelled && setBoard(b))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [brandKey]);
  // Grouped the same way as the board (one card per suggestion group), so counts always match it.
  const boardSummary = useMemo(
    () => (latest ? summarizeBoard(buildBoard(latest.recommendations, latest.gaps, latest.entities, board)) : null),
    [board, latest],
  );

  // Until the first load lands, previews show placeholder lines rather than "nothing yet".
  const pending = status === "loading" && !latest;
  const previews: Record<ModuleId, ReactNode> = pending
    ? { details: <PreviewSkeleton />, analysis: <PreviewSkeleton />, gaps: <PreviewSkeleton />, recommendations: <PreviewSkeleton /> }
    : {
        details: <DetailsPreview profile={profile} questions={questions} />,
        analysis: <AnalysisPreview latest={latest} history={history} />,
        gaps: <GapsPreview latest={latest} />,
        recommendations: <BoardPreview total={boardSummary ? boardSummary.total - boardSummary.resolved : recCount} columns={boardSummary?.counts} />,
      };

  return (
    <div className={`hub${from === "morph" ? " is-vt" : from === "module" ? " is-back" : ""}`}>
      <h1 className="sr-only">{brandName}</h1>
      <p className="crumbs hub-crumbs">
        <TransitionLink to="/app">← {t("hub.back.brands")}</TransitionLink>
      </p>

      {status === "error" && (
        <div className="alert alert-error" role="alert">
          {t("hub.error.load")} <span className="small">{data.error}</span>
        </div>
      )}

      <div className="hub-stage" ref={stageRef} data-active={active ?? undefined}>
        <section className="hub-centre" aria-label={t("hub.centre.label", { brand: brandName })}>
          {skeleton ? (
            <div ref={centreRef} className="card sample-card is-skeleton hub-centre-card" aria-busy="true">
              <span className="sr-only">{t("hub.loading")}</span>
            </div>
          ) : (
            <div
              ref={centreRef}
              className="card sample-card hub-centre-card"
              style={{ viewTransitionName: brandVtName(brandKey) } as CSSProperties}
              onMouseEnter={replay}
            >
              <BrandCardBody
                name={brandName}
                questionCount={questionCount}
                snap={latest}
                hasData={hasData}
                loading={status === "loading"}
                play={play}
                corner="live"
                instantRing={from !== "direct"}
              />
            </div>
          )}
        </section>

        <nav className="hub-modules" aria-label={t("hub.modules.label", { brand: brandName })}>
          {MODULES.map((m, i) => (
            <ModuleCard
              key={m.id}
              def={m}
              index={i}
              brandKey={brandKey}
              cardRef={setModuleRef(m.id)}
              named={!landing}
              onActive={activate(m.id)}
            >
              {previews[m.id]}
            </ModuleCard>
          ))}
        </nav>

        {/* Last, so the cards' refs are attached by the time its layout effect measures them
            (it paints underneath them anyway: z-index in hub.css). */}
        <LiveWires stageRef={stageRef} centreRef={centreRef} moduleRefs={moduleRefs} active={active} />
      </div>
    </div>
  );
}
