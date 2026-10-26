import type { MetricsV2, Snapshot } from "../../api/types";
import { RATING_KEY, ratingFromRange, scoreBandClass, scoreRange } from "../../format";
import { T, useFormat, useT } from "../../i18n";
import { Details } from "../../settings/details";
import { MeasuredNote } from "../MeasuredNote";
import { MetricStrip } from "../MetricStrip";
import { humanizeId, toScore } from "./helpers";
import { CHANGE_KEY, headline, leader, position, ratingFromVi, verdictTone, viDigits } from "./visibility";

// A wide range (in points) means the score could move a lot by chance; suggest asking more times.
const WIDE_RANGE = 25;

/**
 * How often each brand is named in the AI answers, for you and every competitor. Deliberately NOT
 * the composite score: competitors only have mention counts, and mixing the two metrics on one axis
 * would mislead.
 */
function peerData(snapshot: Snapshot) {
  const summary = snapshot.mention_summary;
  const total = summary?.total_answers ?? 0;
  if (!summary?.entities || total <= 0 || !summary.entities.self) return null;
  const rate = (id: string) => (summary.entities[id]?.answers_mentioning ?? 0) / total;
  const others = Object.keys(summary.entities)
    .filter((id) => id !== "self")
    .map((id) => ({ id, name: snapshot.entities?.[id] ?? humanizeId(id), rate: rate(id) }));
  if (others.length === 0) return null;
  const you = rate("self");
  return { others, you, ahead: others.filter((o) => o.rate > you).length };
}

/** One plain sentence: how many competitors are named more often than you. */
function PeerLine({ snapshot }: { snapshot: Snapshot }) {
  const t = useT();
  const peers = peerData(snapshot);
  if (!peers) return null;
  const { others, ahead } = peers;
  const text =
    ahead === 0
      ? t("dashboard.hero.peersAhead.none")
      : ahead === others.length
        ? t.n("dashboard.hero.peersAhead.all", ahead)
        : t.n("dashboard.hero.peersAhead.some", ahead, { total: others.length });
  return <p className="score-peers">{text}</p>;
}

/** The tick strip behind that sentence, on one 0–100% axis (Analytical view). */
function PeerStrip({ snapshot }: { snapshot: Snapshot }) {
  const t = useT();
  const fmt = useFormat();
  const peers = peerData(snapshot);
  if (!peers) return null;
  const { others, you, ahead } = peers;
  const pct = (x: number) => fmt.percent(x);
  const vars = { you: pct(you), ahead, n: others.length };
  return (
    <div className="peer-strip">
      <p className="eyebrow">{t("dashboard.hero.peers")}</p>
      <div className="peer-axis" role="img" aria-label={t("dashboard.hero.peersLegend", vars)}>
        <div className="peer-track" />
        {others.map((o) => (
          <span key={o.id} className="peer-tick" style={{ left: `${o.rate * 100}%` }} title={`${o.name} · ${pct(o.rate)}`} />
        ))}
        <span className="peer-tick peer-you" style={{ left: `${you * 100}%` }} title={pct(you)} />
      </div>
      <p className="peer-legend">{t("dashboard.hero.peersLegend", vars)}</p>
      {/* Which tick is which, readable on touch screens too (the ticks' titles need a hover). */}
      <ul className="peer-names">
        {[...others]
          .sort((x, y) => y.rate - x.rate)
          .map((o) => (
            <li key={o.id}>
              {o.name} <span className="muted">{pct(o.rate)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

/** "You're #5 of 6 tracked places", or a range when the order isn't settled. */
function PositionLine({ m }: { m: MetricsV2 }) {
  const p = position(m);
  if (p.of < 2) return null;
  return (
    <p className="score-peers">
      {p.stable ? (
        <T k="dashboard.v2.position" vars={{ rank: p.rank, of: p.of }} />
      ) : (
        <T k="dashboard.v2.positionRange" vars={{ low: p.low, high: p.high, of: p.of }} />
      )}
    </p>
  );
}

/** "You came up for 3 of 17 questions customers ask, never reliably." */
function ReachLine({ m }: { m: MetricsV2 }) {
  const r = m.question_reach;
  if (!r.of) return null;
  const k =
    r.named === 0
      ? "dashboard.v2.reachZero"
      : r.reliable === 0
        ? "dashboard.v2.reachNever"
        : "dashboard.v2.reach";
  return (
    <p className="score-peers">
      <T k={k} vars={{ named: r.named, of: r.of, reliable: r.reliable }} />
    </p>
  );
}

/** "Ashok Vada Pav is named in 36 answers, you in 4" — counts, not ratios of tiny numbers. */
function LeaderLine({ m, entities }: { m: MetricsV2; entities?: Record<string, string> }) {
  const lead = leader(m);
  const own = m.entities[m.self_id];
  if (!lead || !own || lead.vi <= own.vi) return null;
  return (
    <p className="score-peers">
      <T k="dashboard.v2.leader" vars={{ name: entities?.[lead.id] ?? humanizeId(lead.id), named: lead.named, you: own.named }} />
    </p>
  );
}

/**
 * Metrics v2 hero: the Visibility Index (unconditional, position-weighted, 0–100), a rating word from
 * the low end of its interval, the change since the last check as a verdict (not a raw difference),
 * and three plain facts — position among tracked places, questions reached, the leader in counts.
 * Analytical view: the interval bar, how the index decomposes, share of recommendations, the smallest
 * detectable change, the answer rate and the legacy v1 composite.
 */
function ScoreHeroV2({ snapshot, m }: { snapshot: Snapshot; m: MetricsV2 }) {
  const t = useT();
  const fmt = useFormat();
  const h = headline(snapshot);
  const own = m.entities[m.self_id];
  const digits = viDigits(h.value);
  const rating = ratingFromVi(h.lo, h.hi);
  const show = (v: number) => fmt.number(v, viDigits(v));
  // Only when the comparison is about this run: an incomplete newest run is left out of the trend,
  // and the verdict then describes the two runs before it.
  const v2 = snapshot.trend_verdict_v2;
  const comparison = v2?.comparison && (v2.latest_run_id ?? snapshot.run_id) === snapshot.run_id ? v2.comparison : null;
  const v1 = snapshot.analysis_result;
  const [v1lo, v1hi] = scoreRange(v1);

  return (
    <section className="card score-hero" aria-labelledby="score-hero-title">
      <h2 id="score-hero-title" className="eyebrow">
        {t("dashboard.hero.title")}
      </h2>
      <div className="score-hero-grid">
        <div className={`score-hero-number score-band-${scoreBandClass(rating.band)}`}>
          <p className="score-hero-value">
            <span className="sr-only">{t("dashboard.hero.scoreAria", { score: fmt.number(h.value, digits) })}</span>
            <span aria-hidden="true">
              <span className="score-big score-num">{fmt.number(h.value, digits)}</span>
              <span className="score-outof score-of">/100</span>
            </span>
          </p>
          <p className={`score-rating score-rating-${rating.band}`}>{t(RATING_KEY[rating.band])}</p>
          <Details>
            {rating.upper && (
              <p className="score-rating-upper">{t("pages.rating.couldBe", { rating: t(RATING_KEY[rating.upper]) })}</p>
            )}
          </Details>
          {comparison && (
            <p className={`score-change is-${verdictTone(comparison.verdict)}`}>
              <T k={CHANGE_KEY[comparison.verdict]} />
            </p>
          )}
        </div>

        <div className="score-hero-text">
          {own && (
            <p className="score-sentence">
              <T k={own.answers === 1 ? "dashboard.hero.mentioned_one" : "dashboard.hero.mentioned_other"} vars={{ m: own.named, n: own.answers }} />
              {own.named > 0 && (
                <>
                  {" "}
                  {own.first === 0 ? (
                    t("dashboard.hero.firstNever")
                  ) : (
                    <T k={own.first === 1 ? "dashboard.hero.first_one" : "dashboard.hero.first_other"} vars={{ n: own.first }} />
                  )}
                </>
              )}
            </p>
          )}
          {/* Never named: a rank would only reflect a tie at zero ("#2 of 6"), so the reach line speaks for it. */}
          {own && own.named > 0 && <PositionLine m={m} />}
          <ReachLine m={m} />
          <LeaderLine m={m} entities={snapshot.entities} />
          {m.low_information && <p className="score-range-hint">{t("dashboard.v2.lowInfo")}</p>}

          <Details block>
            <div className="score-range">
              <p className="score-range-text">
                <strong>{t("dashboard.hero.range", { lo: show(h.lo), hi: show(h.hi) })}</strong>{" "}
                <span className="muted">{t("dashboard.hero.rangeWhy")}</span>
              </p>
              <div className="range-bar" role="img" aria-label={t("dashboard.hero.bandAria", { lo: show(h.lo), hi: show(h.hi), score: show(h.value) })}>
                <div className="range-bar-track" />
                <div className="range-bar-band" style={{ left: `${h.lo}%`, width: `${Math.max(1, h.hi - h.lo)}%` }} />
                <div className="range-bar-point" style={{ left: `${h.value}%` }} />
                <span className="range-bar-min" aria-hidden="true">
                  0
                </span>
                <span className="range-bar-max" aria-hidden="true">
                  100
                </span>
              </div>
              <ul className="score-v2-facts">
                {/* The change's numbers live here, in the wide column: under the score they
                    stretched the narrow one. */}
                {comparison && comparison.delta != null && comparison.ci95 && (
                  <li>
                    {t("dashboard.v2.changeDetail", {
                      delta: fmt.number(comparison.delta, 1),
                      lo: fmt.number(comparison.ci95[0], 1),
                      hi: fmt.number(comparison.ci95[1], 1),
                      q: fmt.number(comparison.questions),
                      overlap: fmt.percent(comparison.overlap),
                      mde: fmt.number(comparison.mde ?? 0, 1),
                    })}
                  </li>
                )}
                {own && own.mean_weight_named != null && (
                  <li>
                    {t("dashboard.v2.decomp", {
                      presence: fmt.percent(own.presence),
                      weight: fmt.number(own.mean_weight_named, 2),
                    })}
                  </li>
                )}
                {m.share_of_recommendations && (
                  <li>
                    {t("dashboard.v2.sor", {
                      sor: fmt.percent(m.share_of_recommendations.value),
                      lo: fmt.percent(m.share_of_recommendations.ci?.[0] ?? m.share_of_recommendations.value),
                      hi: fmt.percent(m.share_of_recommendations.ci?.[1] ?? m.share_of_recommendations.value),
                    })}
                  </li>
                )}
                {(snapshot.mde_reference?.value ?? m.mde_design) != null && (
                  <li>{t("dashboard.v2.mde", { mde: fmt.number(snapshot.mde_reference?.value ?? m.mde_design ?? 0, 1) })}</li>
                )}
                <li>{t("dashboard.v2.answerRate", { pct: fmt.percent(m.answer_rate) })}</li>
                {m.rescored && <li>{t("dashboard.v2.rescored")}</li>}
                <li>
                  {t("dashboard.v2.legacy", { score: fmt.number(toScore(v1.composite_score)), lo: v1lo, hi: v1hi })}
                </li>
              </ul>
            </div>
          </Details>
        </div>
      </div>
      <Details>
        <div className="score-hero-metrics">
          <MetricStrip analysis={v1} />
        </div>
      </Details>
    </section>
  );
}

/**
 * "How visible is your brand?" — the 0–100 score, a rating word and plain counts. The honest range,
 * its bar and the measured-parts note belong to the Analytical view. Runs with metrics v2 show the
 * Visibility Index (ScoreHeroV2); older payloads fall back to the v1 composite below.
 */
export function ScoreHero({ snapshot, previous }: { snapshot: Snapshot; previous: Snapshot | null }) {
  if (snapshot.metrics_v2?.entities?.[snapshot.metrics_v2.self_id]) {
    return <ScoreHeroV2 snapshot={snapshot} m={snapshot.metrics_v2} />;
  }
  return <ScoreHeroV1 snapshot={snapshot} previous={previous} />;
}

function ScoreHeroV1({ snapshot, previous }: { snapshot: Snapshot; previous: Snapshot | null }) {
  const t = useT();
  const a = snapshot.analysis_result;
  const score = toScore(a.composite_score);
  const [lo, hi] = scoreRange(a);
  // The rating word follows the low end of the range, never the point estimate.
  const rating = ratingFromRange(lo, hi);

  const summary = snapshot.mention_summary;
  const self = summary?.entities?.self;
  const total = summary?.total_answers ?? snapshot.observation_count ?? 0;
  const mentioned = self?.answers_mentioning ?? snapshot.mentioned_count ?? 0;
  const first = self?.answers_ranked_first;

  const wide = hi - lo > WIDE_RANGE;
  const samples = snapshot.sampling_config?.samples_per_query ?? 0;

  // Only compare with the previous check when it measured the same thing.
  const change =
    previous && previous.comparability_key === snapshot.comparability_key
      ? score - toScore(previous.analysis_result.composite_score)
      : null;

  return (
    <section className="card score-hero" aria-labelledby="score-hero-title">
      <h2 id="score-hero-title" className="eyebrow">
        {t("dashboard.hero.title")}
      </h2>
      <div className="score-hero-grid">
        <div className={`score-hero-number score-band-${scoreBandClass(rating.band)}`}>
          <p className="score-hero-value">
            <span className="sr-only">{t("dashboard.hero.scoreAria", { score })}</span>
            <span aria-hidden="true">
              <span className="score-big score-num">{score}</span>
              <span className="score-outof score-of">/100</span>
            </span>
          </p>
          <p className={`score-rating score-rating-${rating.band}`}>{t(RATING_KEY[rating.band])}</p>
          <Details>
            {rating.upper && (
              <p className="score-rating-upper">{t("pages.rating.couldBe", { rating: t(RATING_KEY[rating.upper]) })}</p>
            )}
            <MeasuredNote analysis={a} className="score-measured" />
          </Details>
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

          <PeerLine snapshot={snapshot} />

          <Details block>
            <div className="score-range">
              <p className="score-range-text">
                <strong>{t("dashboard.hero.range", { lo, hi })}</strong>{" "}
                <span className="muted">{t("dashboard.hero.rangeWhy")}</span>
              </p>
              <div className="range-bar" role="img" aria-label={t("dashboard.hero.bandAria", { lo, hi, score })}>
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
              <PeerStrip snapshot={snapshot} />
              {wide && (
                <p className="score-range-hint">
                  <T k={samples >= 5 ? "dashboard.hero.rangeWideMax" : "dashboard.hero.rangeWide"} />
                </p>
              )}
            </div>
          </Details>
        </div>
      </div>
      <Details>
        <div className="score-hero-metrics">
          <MetricStrip analysis={a} />
        </div>
      </Details>
    </section>
  );
}
