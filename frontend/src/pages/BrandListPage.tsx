import { useState } from "react";
import type { MouseEvent } from "react";
import { deleteBrand, getLatestSnapshot, listBrands, peekLatestSnapshot } from "../api/client";
import type { BrandSummary } from "../api/types";
import { useAsync } from "../api/useAsync";
import { AddBrandForm } from "../components/AddBrandForm";
import { BrandCardBody } from "../components/hub/BrandCardBody";
import { forgetBrand, peekBrands, rememberBrands } from "../components/hub/brandCache";
import { brandHref, brandVtName } from "../components/module/modules";
import { TransitionLink } from "../components/module/transition";
import { toast } from "../components/Toaster";
import { useT } from "../i18n";
import { Details } from "../settings/details";

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function BrandCard({ brand, onDeleted }: { brand: BrandSummary; onDeleted?: () => void }) {
  const t = useT();
  const latest = useAsync(
    () => (brand.has_data ? getLatestSnapshot(brand.brand_key) : Promise.resolve(null)),
    [brand.brand_key, brand.has_data],
  );
  // Until the fetch lands, show the last snapshot seen for this brand (e.g. coming back from its
  // hub), so the card is complete on the first frame and the hub's centre card can morph into it.
  const cached = brand.has_data ? (peekLatestSnapshot(brand.brand_key) ?? null) : null;
  const snap = latest.status === "ready" ? latest.data : cached;
  const [play, setPlay] = useState(0);
  const replay = () => setPlay((n) => n + 1);
  const [deleting, setDeleting] = useState(false);
  const href = brandHref(brand.brand_key);
  // Shared with the hub's centre card: the browser morphs this card into it (and back).
  const vt = { viewTransitionName: brandVtName(brand.brand_key) };

  async function handleDelete(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    if (!window.confirm(t("pages.brands.deleteConfirm", { brand: brand.brand }))) return;
    setDeleting(true);
    try {
      await deleteBrand(brand.brand_key);
      forgetBrand(brand.brand_key);
      toast(t("pages.brands.deleteDone", { brand: brand.brand }));
      onDeleted?.();
    } catch (err) {
      toast(t("pages.brands.deleteError", { brand: brand.brand }) + " " + errMessage(err));
      setDeleting(false);
    }
  }

  const body = (
    <BrandCardBody
      name={brand.brand}
      questionCount={brand.question_count}
      snap={snap}
      hasData={brand.has_data}
      loading={latest.status === "loading"}
      play={play}
    />
  );

  // Sample (pilot) brands: the plain link card — no delete button.
  if (brand.is_pilot) {
    return (
      <TransitionLink to={href} className="card sample-card" style={vt} onMouseEnter={replay} onFocus={replay}>
        {body}
      </TransitionLink>
    );
  }

  // A user's own brand: the same card, but wrapped so a delete button can sit beside the
  // link instead of nested inside it (`.sample-card-link` is `display: contents`, so the
  // link itself stays invisible to layout and the subgrid rows still line up). The delete
  // control is its own footer row (the card's 7th subgrid row) so it's always visible instead
  // of a hover-only corner button.
  return (
    <div className={`card sample-card sample-card-user${deleting ? " is-deleting" : ""}`} style={vt}>
      <TransitionLink to={href} className="sample-card-link" onMouseEnter={replay} onFocus={replay}>
        {body}
      </TransitionLink>
      <div className="sample-card-footer">
        <button
          type="button"
          className="sample-card-delete"
          onClick={handleDelete}
          disabled={deleting}
          aria-label={t("pages.brands.deleteAriaLabel", { brand: brand.brand })}
        >
          <TrashIcon />
          <span aria-hidden="true">{t("pages.brands.deleteLabel")}</span>
        </button>
      </div>
    </div>
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

function BrandRow({
  id,
  eyebrow,
  title,
  sub,
  brands,
  onDeleted,
}: {
  id: string;
  eyebrow: string;
  title: string;
  sub: string;
  brands: BrandSummary[];
  onDeleted?: () => void;
}) {
  if (brands.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby={id}>
      <SectionHead id={id} eyebrow={eyebrow} title={title} sub={sub} />
      <div className="sample-grid stagger">
        {brands.map((b) => (
          <BrandCard key={b.brand_key} brand={b} onDeleted={onDeleted} />
        ))}
      </div>
    </section>
  );
}

export function BrandListPage() {
  const t = useT();
  const [reload, setReload] = useState(0);
  const state = useAsync(() => listBrands().then(rememberBrands), [reload]);
  // Arrived through a View Transition (back from a brand hub)? Decided once at mount: the morph is
  // the entrance, so the page/card rise animations are skipped (hub.css) instead of replaying
  // when the transition ends.
  const [viaVt] = useState(() => typeof document !== "undefined" && "vt" in document.documentElement.dataset);

  // The last list seen fills the first frame (so the hub card can morph back into its slot).
  const cached = peekBrands();
  const brands = state.status === "ready" ? state.data : (cached ?? []);
  const loading = state.status === "loading" && !cached;
  const samples = brands.filter((b) => b.is_pilot);
  const yours = brands.filter((b) => !b.is_pilot);

  return (
    <div className={`home${viaVt ? " is-vt" : ""}`}>
      <h1 className="sr-only">{t("common.app.tagline")}</h1>

      {loading && (
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
        id="yours-title"
        eyebrow={t("pages.brands.yoursEyebrow")}
        title={t("pages.brands.yours")}
        sub={t("pages.brands.yoursSub")}
        brands={yours}
        onDeleted={() => setReload((n) => n + 1)}
      />
      <BrandRow
        id="samples-title"
        eyebrow={t("pages.brands.samplesEyebrow")}
        title={t("pages.brands.samples")}
        sub={t("pages.brands.samplesSub")}
        brands={samples}
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
