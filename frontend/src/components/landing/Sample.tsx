import { useState } from "react";
import { Link } from "react-router-dom";
import { getLatestSnapshot, getObservations, listBrands } from "../../api/client";
import type { Mention } from "../../api/types";
import { useAsync } from "../../api/useAsync";
import { cutPoint, highlight, KIND_KEY, pickSample } from "../dashboard/answerHighlight";
import { RATING_KEY, ratingFromRange, scoreOutOf100, scoreRange } from "../../format";
import { useT } from "../../i18n";
import { ScoreRing } from "../ScoreRing";
import { Reveal } from "./Reveal";

/**
 * "Sample analysis": pick a pilot brand, show one real answer from its latest run (highlighted)
 * next to its score. All simulated/sample data — a link points at the live workspace for real runs.
 * The answer card cross-fades (keyed by brand) whenever a different brand is picked.
 */
export function Sample() {
  const t = useT();
  const brandsState = useAsync(listBrands, []);
  const pilots = brandsState.status === "ready" ? brandsState.data.filter((b) => b.is_pilot) : [];

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeKey = selectedKey ?? pilots[0]?.brand_key ?? null;

  const snapState = useAsync(() => (activeKey ? getLatestSnapshot(activeKey) : Promise.resolve(null)), [activeKey]);
  const snap = snapState.status === "ready" ? snapState.data : null;

  const obsState = useAsync(
    () => (activeKey && snap ? getObservations(activeKey, snap.run_id) : Promise.resolve(null)),
    [activeKey, snap?.run_id],
  );
  const observations = obsState.status === "ready" && obsState.data ? obsState.data.observations : [];
  const obs = pickSample(observations);

  // Replayed by the event that changes the brand (a click), not by an effect.
  const [play, setPlay] = useState(0);
  const selectBrand = (key: string) => {
    setSelectedKey(key);
    setPlay((n) => n + 1);
  };

  const kindLabel = (k: Mention["entity_kind"]) => t(KIND_KEY[k] ?? "dashboard.sample.markOther");
  const score = snap ? scoreOutOf100(snap.analysis_result.composite_score) : null;
  const rating = snap ? ratingFromRange(...scoreRange(snap.analysis_result)) : null;

  const loading = brandsState.status === "loading" || (activeKey !== null && (snapState.status === "loading" || obsState.status === "loading"));
  const failed = brandsState.status === "error" || snapState.status === "error" || obsState.status === "error";
  const noPilots = brandsState.status === "ready" && pilots.length === 0;

  const text = obs?.response_text ?? "";
  const mentions = obs?.mentions ?? [];
  const kinds = new Set(mentions.map((m) => m.entity_kind));

  return (
    <section id="demo" className="lp-band-light lp-section">
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">{t("pages.landing.sample.eyebrow")}</p>
          <h2 className="lp-h2 lp-sample-title">{t("pages.landing.sample.title")}</h2>
          <p className="lp-sample-note">
            {t("pages.landing.sample.note")} <Link to="/app">{t("pages.landing.sample.liveCta")}</Link>
          </p>
        </Reveal>
        {pilots.length > 0 && (
          <Reveal delay={60}>
            <div className="lp-chip-row" role="group" aria-label={t("pages.landing.sample.pickBrand")}>
              {pilots.map((b) => (
                <button
                  key={b.brand_key}
                  type="button"
                  className={`lp-chip${b.brand_key === activeKey ? " is-active" : ""}`}
                  aria-pressed={b.brand_key === activeKey}
                  onClick={() => selectBrand(b.brand_key)}
                >
                  {b.brand}
                </button>
              ))}
            </div>
          </Reveal>
        )}
        <Reveal delay={100}>
          <div className="lp-sample-grid">
            <div className="lp-sample-panel">
              <ScoreRing score={score} band={rating?.band} play={play} />
              {rating && <span className={`pg-rating pg-rating-${rating.band}`}>{t(RATING_KEY[rating.band])}</span>}
              <p className="lp-sample-simulated">{t("pages.landing.sample.simulatedTag")}</p>
            </div>
            <div className="card lp-sample-card">
              <div key={activeKey ?? "none"} className="lp-sample-fade">
                {noPilots || failed ? (
                  <p className="muted lp-sample-status">{t("pages.landing.sample.unavailable")}</p>
                ) : loading || !obs ? (
                  <p className="muted lp-sample-status">{loading ? t("pages.landing.sample.loading") : t("pages.landing.sample.unavailable")}</p>
                ) : (
                  <>
                    <p className="lp-sample-label">{t("pages.landing.sample.question")}</p>
                    <blockquote className="lp-sample-question">{obs.query_text}</blockquote>
                    <p className="lp-sample-label">{t("pages.landing.sample.answer")}</p>
                    <div className="lp-sample-answer">{highlight(text, mentions, cutPoint(text, mentions), kindLabel)}</div>
                    {kinds.size > 0 && (
                      <p className="lp-sample-legend">
                        <span className="muted">{t("pages.landing.sample.legend")}</span>
                        {(["self", "competitor", "discovered"] as const)
                          .filter((k) => kinds.has(k))
                          .map((k) => (
                            <mark key={k} className={`hl hl-${k}`}>
                              {kindLabel(k)}
                            </mark>
                          ))}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
