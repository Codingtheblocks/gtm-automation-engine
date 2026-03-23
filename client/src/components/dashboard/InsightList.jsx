import { formatPercent } from '../../utils/dashboardMetrics.js';

function InsightCard({ title, insight }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <p className="mt-3 text-lg font-semibold text-white">{insight?.label || 'Not enough tracked data yet'}</p>
      {insight ? (
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-400">
          <span>{insight.leads} leads</span>
          <span>{formatPercent(insight.openRate)} open rate</span>
          <span>{formatPercent(insight.ctr)} CTR</span>
        </div>
      ) : null}
    </div>
  );
}

function InsightList({ insights }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <InsightCard title="Top performing segment" insight={insights?.topPerformingSegment} />
      <InsightCard title="Best city" insight={insights?.bestPerformingCity} />
      <InsightCard title="Best score range" insight={insights?.bestPerformingLeadScoreRange} />
      <InsightCard title="Best review segment" insight={insights?.bestPerformingReviewSegment} />
    </div>
  );
}

export default InsightList;
