import SectionPanel from '../components/dashboard/SectionPanel.jsx';
import StatCard from '../components/dashboard/StatCard.jsx';
import ScatterPlot from '../components/dashboard/ScatterPlot.jsx';
import {
  formatCurrency,
  formatPercent,
  getSystemCards,
} from '../utils/dashboardMetrics.js';

function SystemPerformancePage({ systemPerformance }) {
  const cards = getSystemCards(systemPerformance);
  const costBreakdown = systemPerformance?.visuals?.costBreakdown || [];
  const enrichmentEfficiency = systemPerformance?.enrichmentEfficiency;
  const processingStrategy = systemPerformance?.processingStrategy || [];

  return (
    <div className="space-y-6">
      <SectionPanel
        eyebrow="Engineering layer"
        title="System performance"
        description="This page ties spend, processing complexity, and outcomes together so the pipeline looks intentional instead of random."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} helper={card.helper} accent="amber" />
          ))}
        </div>
      </SectionPanel>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionPanel eyebrow="Spend composition" title="Cost breakdown" description="Provider-level cost estimates make it obvious where the system is spending money.">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <table className="min-w-full divide-y divide-slate-800 text-left">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Component</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm text-slate-200">
                {costBreakdown.map((item) => (
                  <tr key={item.label}>
                    <td className="px-4 py-4">{item.label}</td>
                    <td className="px-4 py-4 text-right">{formatCurrency(item.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionPanel>

        <SectionPanel eyebrow="Cost vs performance" title="Where spend follows conversion potential" description="Each point represents a score cohort and includes CTR in the tooltip so you can see whether higher-cost paths are justified.">
          <ScatterPlot title="Cost vs lead score" subtitle="X = lead score, Y = average cost, tooltip = CTR by score cohort" points={systemPerformance?.visuals?.costVsLeadScore || []} />
        </SectionPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionPanel eyebrow="Enrichment efficiency" title="Did enrichment earn its keep?" description="This isolates whether the enriched path is actually beating the cheaper path in engagement quality.">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Top enriched CTR" value={formatPercent(enrichmentEfficiency?.enrichedCtr)} helper="CTR for enriched leads" accent="emerald" />
            <StatCard label="Remaining CTR" value={formatPercent(enrichmentEfficiency?.remainingCtr)} helper="CTR for non-enriched leads" accent="amber" />
            <StatCard label="Cost Delta" value={formatCurrency(enrichmentEfficiency?.costDelta)} helper="Cost / lead delta between enriched and non-enriched paths" accent="brand" />
          </div>
        </SectionPanel>

        <SectionPanel eyebrow="Processing strategy" title="How the pipeline allocates expensive work" description="This is the intentional system design that keeps costs aligned with likely conversion value.">
          <div className="space-y-3">
            {processingStrategy.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </SectionPanel>
      </div>

      {systemPerformance?.notes?.length ? (
        <SectionPanel eyebrow="Assumptions" title="Current estimated metrics" description="These metrics are centralized estimates until raw provider telemetry is stored directly.">
          <div className="space-y-3 text-sm text-slate-300">
            {systemPerformance.notes.map((note) => (
              <div key={note} className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">{note}</div>
            ))}
          </div>
        </SectionPanel>
      ) : null}
    </div>
  );
}

export default SystemPerformancePage;