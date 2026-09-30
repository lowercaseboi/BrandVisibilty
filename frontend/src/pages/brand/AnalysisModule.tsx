import type { ReactNode } from "react";
import { AdmissionBanner } from "../../components/AdmissionBanner";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { MetricCards } from "../../components/MetricCards";
import { ModuleShell } from "../../components/module/ModuleShell";
import { ProviderTable } from "../../components/ProviderTable";
import { RunPanel } from "../../components/RunPanel";
import { TrendChart } from "../../components/TrendChart";
import { SinceCampaignCard } from "../../components/campaign/SinceCampaignCard";
import { usePublishMarkers } from "../../components/campaign/usePublishMarkers";
import { HonestyBanners } from "../../components/dashboard/Banners";
import { CompetitorBars } from "../../components/dashboard/CompetitorBars";
import { ScoreHero } from "../../components/dashboard/ScoreHero";
import { useListFormat } from "../../components/dashboard/helpers";
import { useFormat, useT } from "../../i18n";
import { useBrandData } from "./BrandContext";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv">
      <dt className="kv-label">{label}</dt>
      <dd className="kv-value">{children}</dd>
    </div>
  );
}

/**
 * Analysis: how visible the brand is now (ScoreHero) next to running a new check (RunPanel), the
 * score over time with its AC-8 verdict (TrendChart), and the diagnostics behind it all in one
 * collapsed "Deeper numbers" section.
 */
export function AnalysisModule() {
  const t = useT();
  const fmt = useFormat();
  const list = useListFormat();
  const { brandKey, brandName, latest: snapshot, history, questions, providers, labelOf, reload } = useBrandData();

  const publishMarkers = usePublishMarkers(brandKey);
  const idx = snapshot ? history.findIndex((s) => s.run_id === snapshot.run_id) : -1;
  const previous = idx > 0 ? history[idx - 1] : null;
  const askedIds = snapshot
    ? (snapshot.providers ?? snapshot.analysis_result.per_provider_coverage.map((p) => p.provider_id))
    : [];
  const analysisCount = history.length > 0 ? history.length : snapshot ? 1 : 0;

  return (
    <ModuleShell id="analysis">
      {snapshot && (
        <p className="analysis-meta">
          {snapshot.data_origin === "synthetic"
            ? t("dashboard.head.lastCheckedPractice", { when: fmt.relativeTime(snapshot.collection_completed_at) })
            : t("dashboard.head.lastChecked", {
                when: fmt.relativeTime(snapshot.collection_completed_at),
                ais: list(askedIds.map(labelOf)),
              })}
        </p>
      )}

      <HonestyBanners snapshot={snapshot} questions={questions} brandKey={brandKey} labelOf={labelOf} />

      {/* The two main cards: where the brand stands, and running the next check. */}
      <div className="analysis-main">
        {snapshot ? (
          <ScoreHero snapshot={snapshot} previous={previous} />
        ) : (
          <div className="card empty-state dash-empty analysis-empty">
            <h2>{t("dashboard.empty.title")}</h2>
            <p>{t("dashboard.empty.body")}</p>
            <p className="muted">{t("modules.analysis.empty.body2")}</p>
          </div>
        )}
        <RunPanel brandKey={brandKey} providers={providers} questions={questions} hasData={!!snapshot} onComplete={reload} />
      </div>

      {snapshot && <SinceCampaignCard markers={publishMarkers} />}

      {snapshot && (
        <>
          <section className="card analysis-trend" aria-labelledby="analysis-trend-title">
            <div className="module-section-head">
              <div>
                <p className="eyebrow">{t("modules.analysis.trend.eyebrow")}</p>
                <h2 id="analysis-trend-title">{t("dashboard.trend.title")}</h2>
              </div>
              <span className="count">{t.n("dashboard.trend.count", analysisCount)}</span>
            </div>
            <TrendChart snapshots={history.length ? history : [snapshot]} currentRunId={snapshot.run_id} labelOf={labelOf} events={publishMarkers} />
          </section>

          <CollapsibleSection
            id="analysis-deeper"
            title={t("modules.analysis.deeper.title")}
            summary={t("modules.analysis.deeper.summary")}
          >
            <p className="section-note">{t("dashboard.details.intro")}</p>

            <h3 className="dash-sub">{t("modules.analysis.deeper.facts")}</h3>
            <dl className="card dash-facts">
              <Fact label={t("dashboard.details.runId")}>
                <code>{snapshot.run_id}</code>
              </Fact>
              <Fact label={t("dashboard.details.checkedOn")}>{fmt.date(snapshot.collection_completed_at)}</Fact>
              <Fact label={t("dashboard.details.scored")}>{fmt.number(snapshot.observation_count)}</Fact>
              <Fact label={t("dashboard.details.mentioning")}>{fmt.number(snapshot.mentioned_count)}</Fact>
              <Fact label={t("dashboard.details.unscored")}>{fmt.number(snapshot.unscored_observation_count ?? 0)}</Fact>
              <Fact label={t("dashboard.details.clusters")}>{fmt.number(snapshot.cluster_count)}</Fact>
              <Fact label={t("dashboard.details.samples")}>{fmt.number(snapshot.sampling_config?.samples_per_query ?? 0)}</Fact>
            </dl>

            <h3 className="dash-sub">{t("dashboard.details.metrics")}</h3>
            <MetricCards analysis={snapshot.analysis_result} />

            <h3 className="dash-sub">{t("dashboard.details.admission")}</h3>
            <AdmissionBanner admission={snapshot.admission} runStatus={snapshot.status} labelOf={labelOf} />

            <h3 className="dash-sub">{t("dashboard.details.perAi")}</h3>
            <div className="card card-flush">
              <ProviderTable providers={snapshot.analysis_result.per_provider_coverage ?? []} labelOf={labelOf} />
            </div>

            <h3 className="dash-sub">{t("dashboard.who.title")}</h3>
            <CompetitorBars summary={snapshot.mention_summary} entities={snapshot.entities} selfName={brandName} />
          </CollapsibleSection>
        </>
      )}
    </ModuleShell>
  );
}
