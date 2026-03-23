import ScoreBadge from './ScoreBadge.jsx';

function LeadTable({ leads, generatingLeadId = '', onViewProfile, onViewEmail, onGenerateEmail }) {
  const getStatusClassName = (status) => {
    if (status === 'clicked') {
      return 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30';
    }

    if (status === 'opened') {
      return 'bg-sky-500/15 text-sky-300 ring-sky-400/30';
    }

    if (status === 'enriched') {
      return 'bg-amber-500/15 text-amber-300 ring-amber-400/30';
    }

    return 'bg-slate-700/60 text-slate-300 ring-slate-500/30';
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-left">
          <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Opens</th>
              <th className="px-4 py-3">Clicks</th>
              <th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3">Enriched</th>
              <th className="px-4 py-3">Tone</th>
              <th className="px-4 py-3">Email Preview</th>
              <th className="px-4 py-3">Actions</th>
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
                <td className="px-4 py-4 text-sm text-slate-300">{lead.city || 'Unknown'}</td>
                <td className="px-4 py-4 text-sm text-slate-300">
                  <ScoreBadge tier={lead.tier || lead.scoreTier} score={lead.leadScore ?? lead.score} />
                </td>
                <td className="px-4 py-4 text-sm text-slate-300">{lead.variant || '—'}</td>
                <td className="px-4 py-4 text-sm capitalize text-slate-300">{lead.tier || lead.scoreTier || '—'}</td>
                <td className="px-4 py-4 text-sm text-slate-300">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ${getStatusClassName(lead.status)}`}>
                    {lead.status || 'queued'}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-slate-300">{lead.opens ?? 0}</td>
                <td className="px-4 py-4 text-sm text-slate-300">{lead.clicks ?? 0}</td>
                <td className="px-4 py-4 text-sm text-slate-300">${Number(lead.cost || 0).toFixed(2)}</td>
                <td className="px-4 py-4 text-sm text-slate-300">{lead.enriched ? 'Yes' : 'No'}</td>
                <td className="px-4 py-4 text-sm text-slate-300">{lead.tone || '—'}</td>
                <td className="max-w-[240px] px-4 py-4 text-sm text-slate-300">{lead.emailPreview || '—'}</td>
                <td className="px-4 py-4 text-sm text-slate-300">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onViewProfile(lead);
                      }}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                    >
                      View Profile
                    </button>
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
                      {generatingLeadId === lead.id ? 'Generating...' : lead.generatedEmail ? 'View Email' : 'Generate Email'}
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
