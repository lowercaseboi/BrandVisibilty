import { useState } from "react";
import { Link } from "react-router-dom";
import { getLatestSnapshot, listBrands } from "../api/client";
import type { BrandSummary } from "../api/types";
import { useAsync } from "../api/useAsync";
import { AddBrandForm } from "../components/AddBrandForm";
import { RATING_KEY, ratingFromRange, scoreOutOf100, scoreRange } from "../format";
import type { RatingBand } from "../format";
import { useFormat, useT } from "../i18n";
import { Details } from "../settings/details";

const THIN_QUESTIONS = 10;

/** Score as a ring that fills to the value; colour follows the rating band. Decorative — the card carries the label. */
function ScoreRing({ score, band }: { score: number | null; band?: RatingBand }) {
  const fmt = useFormat();
  return (
    <div className={`score-ring${band ? ` score-ring-${band}` : ""}${score === null ? " is-empty" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <circle className="score-ring-track" cx="60" cy="60" r="52" pathLength={100} />
        {score !== null && (
          <circle
            className="score-ring-fill"
            cx="60"
            cy="60"
            r="52"
            pathLength={100}
            style={{ strokeDasharray: `${Math.max(score, 0.5)} 100` }}
          />
        )}
      </svg>
      <span className="score-ring-value">
        {score === null ? "—" : fmt.number(score)}
        {score !== null && <small>/100</small>}
      </span>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function BrandCard({ brand }: { brand: BrandSummary }) {
  const t = useT();
  const fmt = useFormat();
  const latest = useAsync(
    () => (brand.has_data ? getLatestSnapshot(brand.brand_key) : Promise.resolve(null)),
    [brand.brand_key, brand.has_data],
  );
  const snap = latest.status === "ready" ? latest.data : null;
  const qCount = brand.question_count;

  let ring;
  let foot;
  let label: string | undefined;
  if (snap) {
    const score = scoreOutOf100(snap.analysis_result.composite_score);
    // Rating word from the low end of the likely range, so a lucky point estimate can't overclaim.
    const rating = ratingFromRange(...scoreRange(snap.analysis_result));
    const when = fmt.relativeTime(snap.collection_completed_at);
    label = t("pages.brands.scoreLabel", { score: fmt.number(score) });
    ring = <ScoreRing score={score} band={rating.band} />;
    foot = (
      <>
        <span className={`pg-rating pg-rating-${rating.band}`}>{t(RATING_KEY[rating.band])}</span>
        {rating.upper && (
          <p className="pg-rating-upper">{t("pages.rating.couldBe", { rating: t(RATING_KEY[rating.upper]) })}</p>
        )}
        <div className="pg-card-meta">
          {when && <span className="muted small">{t("pages.brands.checked", { when })}</span>}
          {snap.data_origin === "synthetic" && <span className="badge badge-synthetic">{t("pages.origin.synthetic")}</span>}
          {snap.data_origin === "replay" && <span className="badge badge-replay">{t("pages.origin.replay")}</span>}
        </div>
      </>
    );
  } else {
    ring = <ScoreRing score={null} />;
    if (!brand.has_data) foot = <span className="status-dot status-dot-idle">{t("pages.brands.noChecks")}</span>;
    else if (latest.status === "loading") foot = <span className="muted small">{t("common.loading")}</span>;
    else foot = <span className="status-dot status-dot-ok">{t("pages.brands.hasResults")}</span>;
  }

  return (
    <Link to={`/brands/${encodeURIComponent(brand.brand_key)}`} className="card sample-card">
      <div className="sample-card-top">
        <h3>{brand.brand}</h3>
        <span className="sample-card-go">
          <ArrowIcon />
        </span>
      </div>
      <div className="sample-card-ring">
        {label && <span className="sr-only">{label}</span>}
        {ring}
      </div>
      <div className="sample-card-foot">{foot}</div>
      {typeof qCount === "number" && qCount < THIN_QUESTIONS && <p className="pg-thin">{t.n("pages.brands.thin", qCount)}</p>}
    </Link>
  );
}

function BrandRow({ id, title, brands }: { id: string; title: string; brands: BrandSummary[] }) {
  if (brands.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby={id}>
      <h2 id={id} className="home-label">
        {title}
      </h2>
      <div className="sample-grid stagger">
        {brands.map((b) => (
          <BrandCard key={b.brand_key} brand={b} />
        ))}
      </div>
    </section>
  );
}

export function BrandListPage() {
  const t = useT();
  const [reload, setReload] = useState(0);
  const state = useAsync(listBrands, [reload]);

  const brands = state.status === "ready" ? state.data : [];
  const samples = brands.filter((b) => b.is_pilot);
  const yours = brands.filter((b) => !b.is_pilot);

  return (
    <div className="home">
      <h1 className="sr-only">{t("common.app.tagline")}</h1>

      {state.status === "loading" && (
        <section className="home-section" aria-busy="true">
          <p className="home-label">{t("pages.brands.samples")}</p>
          <div className="sample-grid" aria-hidden="true">
            <div className="card sample-card is-skeleton" />
            <div className="card sample-card is-skeleton" />
            <div className="card sample-card is-skeleton" />
          </div>
          <p className="sr-only">{t("pages.brands.loading")}</p>
        </section>
      )}
      {state.status === "error" && (
        <div className="alert alert-error" role="alert">
          <p>{t("pages.brands.loadError")}</p>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setReload((n) => n + 1)}>
            {t("common.retry")}
          </button>
          <Details>
            <p className="small">{state.error instanceof Error ? state.error.message : String(state.error)}</p>
          </Details>
        </div>
      )}

      <BrandRow id="samples-title" title={t("pages.brands.samples")} brands={samples} />
      <BrandRow id="yours-title" title={t("pages.brands.yours")} brands={yours} />

      <section id="add-brand" className="home-section pg-add-section" aria-labelledby="add-brand-title">
        <h2 id="add-brand-title" className="home-label">
          {t("pages.brands.tryOwn")}
        </h2>
        <AddBrandForm onCreated={() => setReload((n) => n + 1)} />
      </section>
    </div>
  );
}
