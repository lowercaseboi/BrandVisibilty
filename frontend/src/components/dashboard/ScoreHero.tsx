import type { Snapshot } from "../../api/types";
import { T, useT } from "../../i18n";
import { ratingKey, ratingTone, toScore } from "./helpers";

// A wide range means the score could move a lot by chance; suggest asking more times.
const WIDE_RANGE = 0.25;

/** "How visible is your shop?" — the 0–100 score, a rating word, plain counts and the honest range. */
export function ScoreHero({ snapshot, previous }: { snapshot: Snapshot; previous: Snapshot | null }) {
  const t = useT();
  const a = snapshot.analysis_result;
  const score = toScore(a.composite_score);
  const lo = toScore(a.ci_low);
  const hi = Math.max(lo, toScore(a.ci_high));

  const summary = snapshot.mention_summary;
  const self = summary?.entities?.self;
  const total = summary?.total_answers ?? snapshot.observation_count ?? 0;
  const mentioned = self?.answers_mentioning ?? snapshot.mentioned_count ?? 0;
  const first = self?.answers_ranked_first;

  const wide = (a.ci_high ?? 0) - (a.ci_low ?? 0) > WIDE_RANGE;
  const samples = snapshot.sampling_config?.samples_per_query ?? 0;

  // Only compare with the previous check when it measured the same thing.
  const change =
    previous && previous.comparability_key === snapshot.comparability_key
      ? score - toScore(previous.analysis_result.composite_score)
      : null;

  return (
    <section className="card score-hero" aria-labelledby="score-hero-title">
      <h2 id="score-hero-title" className="score-hero-title">
        {t("dashboard.hero.title")}
      </h2>
      <div className="score-hero-grid">
        <div className="score-hero-number">
          <p className="score-hero-value">
            <span className="sr-only">{t("dashboard.hero.scoreAria", { score })}</span>
            <span aria-hidden="true">
              <span className="score-big">{score}</span>
              <span className="score-outof">/100</span>
            </span>
          </p>
          <p className={`score-rating score-rating-${ratingTone(score)}`}>{t(ratingKey(score))}</p>
          {change !== null && (
            <p className={`score-change ${change > 0 ? "is-up" : change < 0 ? "is-down" : ""}`}>
              {change > 0
                ? t.n("dashboard.hero.change.up", change)
                : change < 0
                  ? t.n("dashboard.hero.change.down", -change)
                  : t("dashboard.hero.change.same")}
            </p>
          )}
        </div>

        <div className="score-hero-text">
          <p className="score-sentence">
            <T k={total === 1 ? "dashboard.hero.mentioned_one" : "dashboard.hero.mentioned_other"} vars={{ m: mentioned, n: total }} />
            {mentioned > 0 && first !== undefined && (
              <>
                {" "}
                {first === 0 ? (
                  t("dashboard.hero.firstNever")
                ) : (
                  <T k={first === 1 ? "dashboard.hero.first_one" : "dashboard.hero.first_other"} vars={{ n: first }} />
                )}
              </>
            )}
          </p>

          <div className="score-range">
            <p className="score-range-text">
              <strong>{t("dashboard.hero.range", { lo, hi })}</strong>{" "}
              <span className="muted">{t("dashboard.hero.rangeWhy")}</span>
            </p>
            <div
              className="range-bar"
              role="img"
              aria-label={t("dashboard.hero.bandAria", { lo, hi, score })}
            >
              <div className="range-bar-track" />
              <div className="range-bar-band" style={{ left: `${lo}%`, width: `${Math.max(1, hi - lo)}%` }} />
              <div className="range-bar-point" style={{ left: `${score}%` }} />
              <span className="range-bar-min" aria-hidden="true">
                0
              </span>
              <span className="range-bar-max" aria-hidden="true">
                100
              </span>
            </div>
            {wide && (
              <p className="score-range-hint">
                <T k={samples >= 5 ? "dashboard.hero.rangeWideMax" : "dashboard.hero.rangeWide"} />
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
