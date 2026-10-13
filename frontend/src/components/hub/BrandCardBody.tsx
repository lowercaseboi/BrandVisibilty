import type { ReactNode } from "react";
import type { Snapshot } from "../../api/types";
import { RATING_KEY } from "../../format";
import { headlineRating, headlineValue } from "../dashboard/visibility";
import { useFormat, useT } from "../../i18n";
import { Details, useDetails } from "../../settings/details";
import { MeasuredNote } from "../MeasuredNote";
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
 * The inside of a brand card — name, score ring with its band colour, rating word and "updated"
 * badges; the question count, "could be …", measured-on note and compact metric strip are Analytical
 * view only — as six fixed slots that line up across a row of cards via subgrid. Shared by the
 * brand list and the hub's centre card so the two are identical and the View Transition morph
 * between them is seamless.
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
  const { showDetails } = useDetails();

  // Six fixed slots, always rendered (empty when unused), so cards in a row line up via subgrid.
  let ring;
  let rating: ReactNode = null;
  let upper: ReactNode = null;
  let meta: ReactNode = null;
  let extra: ReactNode = null;
  let label: string | undefined;
  if (snap) {
    const score = headlineValue(snap);
    // Rating word from the low end of the likely range, so a lucky point estimate can't overclaim.
    const r = headlineRating(snap);
    const when = fmt.relativeTime(snap.collection_completed_at);
    label = t("pages.brands.scoreLabel", { score: fmt.number(score) });
    ring = <ScoreRing score={score} band={r.band} play={play} instant={instantRing} />;
    rating = (
      <>
        <span className={`pg-rating pg-rating-${r.band}`}>{t(RATING_KEY[r.band])}</span>
        {/* On the list the card is a link, so the tip can't be a nested button there. */}
        <Details>
          <MeasuredNote analysis={snap.analysis_result} className="pg-measured" interactive={corner === "live"} />
        </Details>
      </>
    );
    if (r.upper)
      upper = (
        <Details>
          <p className="pg-rating-upper">{t("pages.rating.couldBe", { rating: t(RATING_KEY[r.upper]) })}</p>
        </Details>
      );
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
          {typeof questionCount === "number" && (
            <p className="sample-card-sub">
              {showDetails ? t.n("pages.brands.tracked", questionCount) : t("pages.brands.checksQuestions")}
            </p>
          )}
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
          <p className="pg-thin">{t("pages.brands.thin")}</p>
        )}
      </div>
    </>
  );
}
