import ScoreBadge from './ScoreBadge.jsx';

function LeadTable({ leads, generatingLeadId = '', onViewProfile, onViewEmail, onGenerateEmail }) {
  const formatVariantLabel = (lead) => {
    const variant = String(lead.variant || '').trim().toUpperCase();
    const tier = String(lead.tier || lead.scoreTier || '').trim().toLowerCase();

    if (!variant && !tier) {
      return '—';
    }

    if (!variant) {
      return tier;
    }

    if (!tier) {
      return variant;
    }

    return `${variant}_${tier}`;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-left">
          <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3"># Reviews</th>
              <th className="px-4 py-3">Avg Rating</th>
              <th className="px-4 py-3">Distance</th>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3 text-right">Lead Score</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {leads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => onViewProfile(lead)}
                className="cursor-pointer transition hover:bg-slate-800/70"
              >
                <td className="px-4 py-4 text-sm font-medium text-white">{lead.name}</td>
                <td className="px-4 py-4 text-sm text-slate-300">{lead.reviewCount ?? 0}</td>
                <td className="px-4 py-4 text-sm text-slate-300">{lead.rating === null || lead.rating === undefined ? '—' : Number(lead.rating).toFixed(1)}</td>
                <td className="px-4 py-4 text-sm text-slate-300">{lead.distanceMiles === null || lead.distanceMiles === undefined ? '—' : `${Number(lead.distanceMiles).toFixed(1)} mi`}</td>
                <td className="px-4 py-4 text-sm text-slate-300">{formatVariantLabel(lead)}</td>
                <td className="px-4 py-4 text-right text-sm text-slate-300">
                  <div className="flex justify-end">
                    <ScoreBadge tier={lead.tier || lead.scoreTier} score={lead.leadScore ?? lead.score} />
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-slate-300">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();

                        if (lead.generatedEmail) {
                          onViewEmail(lead);
                          return;
                        }

                        onGenerateEmail?.(lead);
                      }}
                      disabled={generatingLeadId === lead.id}
                      className="rounded-lg border border-brand-500/40 px-2 py-1 text-xs font-medium text-brand-100 transition hover:border-brand-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generatingLeadId === lead.id ? 'Generating...' : lead.generatedEmail ? 'View Profile' : 'Generate Email'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LeadTable;
