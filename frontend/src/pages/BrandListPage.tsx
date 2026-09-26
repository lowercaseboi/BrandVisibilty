import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { getLatestSnapshot, listBrands } from "../api/client";
import type { BrandSummary } from "../api/types";
import { useAsync } from "../api/useAsync";
import { AddBrandForm } from "../components/AddBrandForm";
import { ScoreRing } from "../components/ScoreRing";
import { MetricStrip } from "../components/MetricStrip";
import { RATING_KEY, ratingFromRange, scoreOutOf100, scoreRange } from "../format";
import { useFormat, useT } from "../i18n";
import { Details } from "../settings/details";

const THIN_QUESTIONS = 10;

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
  const [play, setPlay] = useState(0);
  const replay = () => setPlay((n) => n + 1);

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
    ring = <ScoreRing score={score} band={r.band} play={play} />;
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
    if (!brand.has_data) rating = <span className="status-dot status-dot-idle">{t("pages.brands.noChecks")}</span>;
    else if (latest.status === "loading") rating = <span className="muted small">{t("common.loading")}</span>;
    else rating = <span className="status-dot status-dot-ok">{t("pages.brands.hasResults")}</span>;
  }

  return (
    <Link
      to={`/brands/${encodeURIComponent(brand.brand_key)}`}
      className="card sample-card"
      onMouseEnter={replay}
      onFocus={replay}
    >
      <div className="sample-card-top">
        <div className="sample-card-title">
          <h3>{brand.brand}</h3>
          {typeof qCount === "number" && <p className="sample-card-sub">{t.n("pages.brands.tracked", qCount)}</p>}
        </div>
        <span className="sample-card-go">
          <ArrowIcon />
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
        {typeof qCount === "number" && qCount < THIN_QUESTIONS && <p className="pg-thin">{t.n("pages.brands.thin", qCount)}</p>}
      </div>
    </Link>
  );
}

function SectionHead({ id, eyebrow, title, sub }: { id: string; eyebrow: string; title: string; sub: string }) {
  return (
    <div className="home-head">
      <span className="eyebrow">{eyebrow}</span>
      <h2 id={id} className="home-title">
        {title}
      </h2>
      <p className="home-sub">{sub}</p>
    </div>
  );
}

function BrandRow({ id, eyebrow, title, sub, brands }: { id: string; eyebrow: string; title: string; sub: string; brands: BrandSummary[] }) {
  if (brands.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby={id}>
      <SectionHead id={id} eyebrow={eyebrow} title={title} sub={sub} />
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
          <SectionHead
            id="samples-loading"
            eyebrow={t("pages.brands.samplesEyebrow")}
            title={t("pages.brands.samples")}
            sub={t("pages.brands.samplesSub")}
          />
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

      <BrandRow
        id="samples-title"
        eyebrow={t("pages.brands.samplesEyebrow")}
        title={t("pages.brands.samples")}
        sub={t("pages.brands.samplesSub")}
        brands={samples}
      />
      <BrandRow
        id="yours-title"
        eyebrow={t("pages.brands.yoursEyebrow")}
        title={t("pages.brands.yours")}
        sub={t("pages.brands.yoursSub")}
        brands={yours}
      />

      <section id="add-brand" className="home-section pg-add-section" aria-labelledby="add-brand-title">
        <SectionHead
          id="add-brand-title"
          eyebrow={t("pages.brands.tryOwnEyebrow")}
          title={t("pages.brands.tryOwn")}
          sub={t("pages.brands.tryOwnSub")}
        />
        <AddBrandForm onCreated={() => setReload((n) => n + 1)} />
      </section>
    </div>
  );
}
