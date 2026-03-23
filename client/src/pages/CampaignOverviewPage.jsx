import SectionPanel from '../components/dashboard/SectionPanel.jsx';
import StatCard from '../components/dashboard/StatCard.jsx';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  getConfidenceBadgeClassName,
  getOverviewKpiCards,
} from '../utils/dashboardMetrics.js';

const variantNameMap = {
  A: 'Flexible Billing',
  B: 'Fast Delivery',
};

function formatComparisonValue(metric, value) {
  if (metric === 'Leads') {
    return formatNumber(value);
  }

  if (metric.includes('Cost')) {
    return formatCurrency(value);
  }

  return formatPercent(value);
}

function InsightCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function CampaignOverviewPage({ overview, draftedLeadCount }) {
  const kpiCards = getOverviewKpiCards(overview);
  const comparisonRows = overview?.abPerformance?.comparisonRows || [];
  const winner = overview?.abPerformance?.winner;
  const dataConfidence = overview?.abPerformance?.dataConfidence;
  const bestScoreRange = overview?.segmentInsights?.bestScoreRange;
  const bestCity = overview?.segmentInsights?.bestCity;
  const enrichmentImpact = overview?.segmentInsights?.enrichmentImpact;
  const benchmarkNote = overview?.abPerformance?.notes?.benchmark;

  return (
    <div className="space-y-6">
      <SectionPanel
        eyebrow="Decision layer"
        title="Campaign overview"
        description="This page is built to answer two questions fast: where to double down and what to change next."
      >
        <div className="mb-5 rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-100">
          {draftedLeadCount
            ? `${draftedLeadCount} processed leads are currently feeding these campaign decisions.`
            : 'Generate tracked drafts to unlock campaign recommendations, winner detection, and ROI insights.'}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kpiCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} helper={card.helper} />
          ))}
        </div>
      </SectionPanel>

      <SectionPanel
        eyebrow="A/B testing"
        title="Variant performance and winner detection"
        description="This section is intentionally opinionated: it makes the experiment winner obvious instead of leaving you to infer it."
      >
        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Experiment read quality</p>
                <p className="mt-1 text-sm text-slate-300">{dataConfidence?.reason || 'Collect more tracked events to improve confidence.'}</p>
              </div>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getConfidenceBadgeClassName(dataConfidence?.level)}`}>
                Data Confidence: {dataConfidence?.level || 'Low'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-left">
                <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Metric</th>
                    <th className="px-4 py-3">Variant A</th>
                    <th className="px-4 py-3">Variant B</th>
                    <th className="px-4 py-3">Winner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm text-slate-200">
                  {comparisonRows.map((row) => (
                    <tr key={row.metric}>
                      <td className="px-4 py-4 font-medium text-white">{row.metric}</td>
                      <td className="px-4 py-4">{formatComparisonValue(row.metric, row.variantA)}</td>
                      <td className="px-4 py-4">{formatComparisonValue(row.metric, row.variantB)}</td>
                      <td className="px-4 py-4">{row.winner === '—' ? '—' : `Variant ${row.winner}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {benchmarkNote ? (
              <div className="border-t border-slate-800 px-4 py-3 text-xs text-amber-200">
                {benchmarkNote}
              </div>
            ) : null}
            {overview?.abPerformance?.notes?.replies ? (
              <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
                {overview.abPerformance.notes.replies}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Winner callout</p>
              <p className="mt-3 text-2xl font-semibold text-white">
                {winner?.variant ? `Winning Variant: ${winner.variant} (${variantNameMap[winner.variant]})` : 'Winning Variant: Not enough data yet'}
              </p>
              <p className="mt-3 text-sm text-emerald-100">
                {winner?.variant
                  ? `+${winner.ctrLiftPercent}% higher CTR • ${winner.costPerClickReductionPercent}% lower cost per click`
                  : 'Generate more tracked drafts to create a reliable decision signal.'}
              </p>
              <p className="mt-3 text-xs text-emerald-200/80">
                {dataConfidence?.level === 'High'
                  ? 'This winner is strong enough to inform allocation changes.'
                  : 'Treat this as directional until sample size and event density improve.'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recommended action</p>
              <div className="mt-3 space-y-3 text-sm text-slate-200">
                {(overview?.recommendations || []).map((recommendation) => (
                  <div key={`${recommendation.category}-${recommendation.title}`} className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{recommendation.category}</p>
                    <p className="mt-2 font-medium text-white">{recommendation.title}</p>
                    <p className="mt-1 text-slate-300">{recommendation.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SectionPanel>

      <SectionPanel
        eyebrow="Segment intelligence"
        title="Where the campaign is actually working"
        description="Only three segment cuts matter here: quality band, geography, and whether enrichment is actually paying off."
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <InsightCard title="Best performing segment">
            <p className="text-lg font-semibold text-white">Score Range: {bestScoreRange?.label || 'Not enough tracked data yet'}</p>
            <p className="text-sm text-slate-300">CTR: {formatPercent(bestScoreRange?.ctr)}</p>
            <p className="text-sm text-slate-400">{bestScoreRange?.insight || 'No score-range insight available yet.'}</p>
          </InsightCard>

          <InsightCard title="Best geography">
            <p className="text-lg font-semibold text-white">City: {bestCity?.label || 'Not enough tracked data yet'}</p>
            <p className="text-sm text-slate-300">CTR: {formatPercent(bestCity?.ctr)}</p>
            <p className="text-sm text-slate-400">{bestCity?.insight || 'No geographic insight available yet.'}</p>
          </InsightCard>

          <InsightCard title="Enrichment impact">
            {enrichmentImpact?.hasEnoughData ? (
              <>
                <p className="text-sm text-slate-300">Enriched CTR: {formatPercent(enrichmentImpact?.enrichedCtr)}</p>
                <p className="text-sm text-slate-300">Non-enriched CTR: {formatPercent(enrichmentImpact?.nonEnrichedCtr)}</p>
                <p className="text-sm text-slate-400">{enrichmentImpact?.insight || 'No enrichment impact signal available yet.'}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-white">{enrichmentImpact?.message || 'Not enough enriched leads yet to measure performance'}</p>
                <p className="text-sm text-slate-300">Enriched leads: {formatNumber(enrichmentImpact?.enrichedLeadCount || 0)}</p>
                <p className="text-sm text-slate-300">Non-enriched leads: {formatNumber(enrichmentImpact?.nonEnrichedLeadCount || 0)}</p>
                <p className="text-sm text-slate-400">{enrichmentImpact?.insight || 'No enrichment impact signal available yet.'}</p>
              </>
            )}
          </InsightCard>
        </div>
      </SectionPanel>
    </div>
  );
}

export default CampaignOverviewPage;