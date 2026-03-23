import { formatCurrency, formatPercent } from '../../utils/dashboardMetrics.js';

function VariantComparisonTable({ variants = [], replyNote = '' }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-left">
          <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3">Leads</th>
              <th className="px-4 py-3">Open Rate</th>
              <th className="px-4 py-3">CTR</th>
              <th className="px-4 py-3">Replies</th>
              <th className="px-4 py-3">Cost / Lead</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-sm text-slate-200">
            {variants.map((variant) => (
              <tr key={variant.variant}>
                <td className="px-4 py-4 font-semibold text-white">Variant {variant.variant}</td>
                <td className="px-4 py-4">{variant.leads}</td>
                <td className="px-4 py-4">{formatPercent(variant.openRate)}</td>
                <td className="px-4 py-4">{formatPercent(variant.ctr)}</td>
                <td className="px-4 py-4">{variant.replies}{variant.repliesModeled ? ' (modeled)' : ''}</td>
                <td className="px-4 py-4">{formatCurrency(variant.costPerLead)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {replyNote ? <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">{replyNote}</div> : null}
    </div>
  );
}

export default VariantComparisonTable;
