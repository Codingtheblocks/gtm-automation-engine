import SectionPanel from '../components/dashboard/SectionPanel.jsx';
import StatCard from '../components/dashboard/StatCard.jsx';
import MetricBarChart from '../components/dashboard/MetricBarChart.jsx';
import ScatterPlot from '../components/dashboard/ScatterPlot.jsx';
import { getSystemCards, formatCurrency } from '../utils/dashboardMetrics.js';

function SystemPerformancePage({ systemPerformance }) {
  const cards = getSystemCards(systemPerformance);

  return (
    <div className="space-y-6">
      <SectionPanel
        eyebrow="RevOps + engineering view"
        title="System efficiency and cost-aware performance"
        description="This page translates the lead engine into operational efficiency: how expensive each path is, where tiering saves money, and how enrichment load is distributed."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} helper={card.helper} accent="amber" />
          ))}
        </div>
      </SectionPanel>

      <SectionPanel eyebrow="Visual diagnostics" title="Cost vs quality" description="High-cost, low-score outliers are the fastest way to spot wasted enrichment spend.">
        <ScatterPlot title="Cost vs lead score" subtitle="X = lead score, Y = estimated cost" points={systemPerformance?.visuals?.costVsLeadScore || []} />
      </SectionPanel>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionPanel eyebrow="Enrichment load" title="Enrichment distribution" description="Shows how many drafted leads ran through full enrichment vs cheaper paths.">
          <MetricBarChart
            title="Enrichment mix"
            subtitle="Distribution of drafted lead paths"
            data={(systemPerformance?.visuals?.enrichmentDistribution || []).map((item) => ({ label: item.label, value: item.value }))}
            colorClassName="bg-violet-500"
            valueFormatter={(value) => `${Number(value || 0)}`}
          />
        </SectionPanel>

        <SectionPanel eyebrow="Spend composition" title="Cost breakdown" description="Provider-level cost is derived centrally from the persisted lead path and estimated lead cost.">
          <div className="space-y-3">
            {(systemPerformance?.visuals?.costBreakdown || []).map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">{item.label}</span>
                  <span className="text-sm font-semibold text-white">{formatCurrency(item.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionPanel>
      </div>

      {systemPerformance?.notes?.length ? (
        <SectionPanel eyebrow="Assumptions" title="Estimated metrics currently in use" description="These are centralized estimates, not raw provider telemetry.">
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
