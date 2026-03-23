import SectionPanel from '../components/dashboard/SectionPanel.jsx';
import StatCard from '../components/dashboard/StatCard.jsx';
import VariantComparisonTable from '../components/dashboard/VariantComparisonTable.jsx';
import MetricBarChart from '../components/dashboard/MetricBarChart.jsx';
import InsightList from '../components/dashboard/InsightList.jsx';
import { getKpiCards } from '../utils/dashboardMetrics.js';

function CampaignOverviewPage({ overview, draftedLeadCount }) {
  const kpiCards = getKpiCards(overview);

  return (
    <div className="space-y-6">
      <SectionPanel
        eyebrow="Executive view"
        title="Campaign health and decision signals"
        description="This page focuses on campaign quality, A/B performance, and which lead segments are most likely to respond."
      >
        <div className="mb-5 rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-100">
          {draftedLeadCount
            ? `${draftedLeadCount} drafted leads are currently feeding the campaign metrics below.`
            : 'Generate a few tracked drafts to populate campaign metrics, A/B comparisons, and response segments.'}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} helper={card.helper} />
          ))}
        </div>
      </SectionPanel>

      <SectionPanel
        eyebrow="Most important section"
        title="A/B performance by offer variant"
        description="Compare which message strategy is producing opens, clicks, and efficient downstream engagement."
      >
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <VariantComparisonTable variants={overview?.abPerformance?.variants || []} replyNote={overview?.abPerformance?.notes?.replies || ''} />
          <div className="grid gap-4">
            <MetricBarChart title="CTR by variant" subtitle="Unique clicks / drafted leads" data={overview?.abPerformance?.charts?.ctrByVariant || []} colorClassName="bg-sky-400" />
            <MetricBarChart title="Open rate by variant" subtitle="Unique opens / drafted leads" data={overview?.abPerformance?.charts?.openRateByVariant || []} colorClassName="bg-emerald-500" />
          </div>
        </div>
      </SectionPanel>

      <SectionPanel
        eyebrow="Segment intelligence"
        title="Where the campaign is actually landing"
        description="Use segment winners to guide territory selection, enrichment investment, and which cohorts deserve more personalization."
      >
        <InsightList insights={overview?.segmentInsights} />
      </SectionPanel>
    </div>
  );
}

export default CampaignOverviewPage;
