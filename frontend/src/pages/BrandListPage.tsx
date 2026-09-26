import { useState } from "react";
import { Link } from "react-router-dom";
import { getLatestSnapshot, listBrands } from "../api/client";
import type { BrandSummary } from "../api/types";
import { useAsync } from "../api/useAsync";
import { AddBrandForm } from "../components/AddBrandForm";
import { RATING_KEY, ratingFromRange, scoreOutOf100, scoreRange } from "../format";
import { useFormat, useT } from "../i18n";
import { Details } from "../settings/details";

const THIN_QUESTIONS = 10;

function BrandCard({ brand }: { brand: BrandSummary }) {
  const t = useT();
  const fmt = useFormat();
  const latest = useAsync(
    () => (brand.has_data ? getLatestSnapshot(brand.brand_key) : Promise.resolve(null)),
    [brand.brand_key, brand.has_data],
  );
  const snap = latest.status === "ready" ? latest.data : null;
  const qCount = brand.question_count;

  let body;
  if (!brand.has_data) {
    body = <span className="status-dot status-dot-idle">{t("pages.brands.noChecks")}</span>;
  } else if (snap) {
    const score = scoreOutOf100(snap.analysis_result.composite_score);
    // Rating word from the low end of the likely range, so a lucky point estimate can't overclaim.
    const rating = ratingFromRange(...scoreRange(snap.analysis_result));
    const when = fmt.relativeTime(snap.collection_completed_at);
    body = (
      <>
        <div className="pg-score" aria-label={t("pages.brands.scoreLabel", { score: fmt.number(score) })}>
          <span className="pg-score-value" aria-hidden="true">
            {fmt.number(score)}
          </span>
          <span className="pg-score-max" aria-hidden="true">
            {t("pages.brands.outOf100")}
          </span>
          <span className={`pg-rating pg-rating-${rating.band}`}>{t(RATING_KEY[rating.band])}</span>
        </div>
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
  } else if (latest.status === "loading") {
    body = <span className="muted small">{t("common.loading")}</span>;
  } else {
    body = <span className="status-dot status-dot-ok">{t("pages.brands.hasResults")}</span>;
  }

  return (
    <Link to={`/brands/${encodeURIComponent(brand.brand_key)}`} className="card brand-card">
      <div className="brand-card-top">
        <h3>{brand.brand}</h3>
        <Details>{brand.is_pilot && <span className="badge badge-accent">{t("pages.brands.pilot")}</span>}</Details>
      </div>
      <div className="brand-card-body">{body}</div>
      {typeof qCount === "number" && qCount < THIN_QUESTIONS && <p className="pg-thin">{t.n("pages.brands.thin", qCount)}</p>}
    </Link>
  );
}

export function BrandListPage() {
  const t = useT();
  const [reload, setReload] = useState(0);
  const state = useAsync(listBrands, [reload]);
  const [q, setQ] = useState("");

  const query = q.trim().toLowerCase();
  const brands = state.status === "ready" ? state.data : [];
  const visible = brands.filter((b) => b.brand.toLowerCase().includes(query));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t("pages.brands.title")}</h1>
          <p className="lede">{t("pages.brands.lede")}</p>
        </div>
      </div>

      {state.status === "loading" && <p className="status">{t("pages.brands.loading")}</p>}
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
      {state.status === "ready" &&
        (brands.length === 0 ? (
          <div className="card pg-empty">
            <h2>{t("pages.brands.emptyTitle")}</h2>
            <p className="muted">{t("pages.brands.emptyBody")}</p>
            <a className="btn btn-primary" href="#add-brand">
              {t("pages.brands.emptyCta")}
            </a>
          </div>
        ) : (
          <>
            {brands.length > 3 && (
              <input
                className="search-input"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("pages.brands.searchPlaceholder")}
                aria-label={t("pages.brands.searchLabel")}
              />
            )}
            {visible.length === 0 ? (
              <p className="empty">{t("pages.brands.noMatch", { q: q.trim() })}</p>
            ) : (
              <div className="brand-grid">
                {visible.map((b) => (
                  <BrandCard key={b.brand_key} brand={b} />
                ))}
              </div>
            )}
          </>
        ))}

      <section id="add-brand" className="pg-add-section" aria-labelledby="add-brand-title">
        <h2 id="add-brand-title">{t("pages.brands.addTitle")}</h2>
        <AddBrandForm onCreated={() => setReload((n) => n + 1)} />
      </section>
    </div>
  );
}
