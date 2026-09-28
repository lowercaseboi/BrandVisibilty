import type { ReactNode } from "react";
import type { Snapshot } from "../../api/types";
import { RATING_KEY, ratingFromRange, scoreOutOf100, scoreRange } from "../../format";
import { useFormat, useT } from "../../i18n";
import { Details } from "../../settings/details";
import { MetricStrip } from "../MetricStrip";
import { ScoreRing } from "../ScoreRing";

const THIN_QUESTIONS = 10;

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export interface BrandCardBodyProps {
  name: string;
  /** Scored questions tracked for the brand (the list's `question_count`). */
  questionCount?: number | null;
  /** Latest snapshot, or null when there is none (yet). */
  snap: Snapshot | null;
  /** The brand has at least one stored run (false → "Not yet analysed"). */
  hasData: boolean;
  /** The snapshot is still being fetched. */
  loading: boolean;
  /** Bumped to replay the score ring's fill (hover / focus). */
  play: number;
  /** Show the score ring's final value on mount (no count-up) — set when a morph carries the card in. */
  instantRing?: boolean;
  /**
   * The round badge in the top-right corner: an arrow on the brand list (the card is a link), a
   * pulsing "live" dot on the hub, where the card is the source the module wires draw from.
   */
  corner?: "go" | "live";
}

/**
 * The inside of a brand card — name, question count, score ring with its band colour, rating word,
 * "could be …", meta badges and (numbers view) the compact metric strip — as six fixed slots that
 * line up across a row of cards via subgrid. Shared by the brand list and the hub's centre card so
 * the two are identical and the View Transition morph between them is seamless.
 */
export function BrandCardBody({
  name,
  questionCount,
  snap,
  hasData,
  loading,
  play,
  instantRing = false,
  corner = "go",
}: BrandCardBodyProps) {
  const t = useT();
  const fmt = useFormat();

  // Six fixed slots, always rendered (empty when unused), so cards in a row line up via subgrid.
  let ring;
  let rating: ReactNode = null;
  let upper: ReactNode = null;
  let meta: ReactNode = null;
  let extra: ReactNode = null;
  let label: string | undefined;
  if (snap) {
    const score = scoreOutOf100(snap.analysis_result.composite_score);
    // Rating word from the low end of the likely range, so a lucky point estimate can't overclaim.
    const r = ratingFromRange(...scoreRange(snap.analysis_result));
    const when = fmt.relativeTime(snap.collection_completed_at);
    label = t("pages.brands.scoreLabel", { score: fmt.number(score) });
    ring = <ScoreRing score={score} band={r.band} play={play} instant={instantRing} />;
    rating = <span className={`pg-rating pg-rating-${r.band}`}>{t(RATING_KEY[r.band])}</span>;
    if (r.upper) upper = <p className="pg-rating-upper">{t("pages.rating.couldBe", { rating: t(RATING_KEY[r.upper]) })}</p>;
    meta = (
      <>
        {when && <span className="muted small">{t("pages.brands.checked", { when })}</span>}
        {snap.data_origin === "synthetic" && <span className="badge badge-synthetic">{t("pages.origin.synthetic")}</span>}
        {snap.data_origin === "replay" && <span className="badge badge-replay">{t("pages.origin.replay")}</span>}
      </>
    );
    extra = (
      <Details>
        <MetricStrip analysis={snap.analysis_result} compact />
      </Details>
    );
  } else {
    ring = <ScoreRing score={null} play={play} />;
    if (!hasData) rating = <span className="status-dot status-dot-idle">{t("pages.brands.noChecks")}</span>;
    else if (loading) rating = <span className="muted small">{t("common.loading")}</span>;
    else rating = <span className="status-dot status-dot-ok">{t("pages.brands.hasResults")}</span>;
  }

  return (
    <>
      <div className="sample-card-top">
        <div className="sample-card-title">
          <h3>{name}</h3>
          {typeof questionCount === "number" && <p className="sample-card-sub">{t.n("pages.brands.tracked", questionCount)}</p>}
        </div>
        <span className={`sample-card-go${corner === "live" ? " is-live" : ""}`}>
          {corner === "live" ? <span className="hub-live-dot" /> : <ArrowIcon />}
        </span>
      </div>
      <div className="sample-card-ring">
        {label && <span className="sr-only">{label}</span>}
        {ring}
      </div>
      <div className="sample-card-slot">{rating}</div>
      <div className="sample-card-slot">{upper}</div>
      <div className="sample-card-slot pg-card-meta">{meta}</div>
      <div className="sample-card-slot">
        {extra}
        {typeof questionCount === "number" && questionCount < THIN_QUESTIONS && (
          <p className="pg-thin">{t.n("pages.brands.thin", questionCount)}</p>
        )}
      </div>
    </>
  );
}
