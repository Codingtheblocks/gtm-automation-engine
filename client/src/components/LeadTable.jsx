import ScoreBadge from './ScoreBadge.jsx';
import { formatDateTime, formatVariantBucket } from '../utils/dashboardMetrics.js';

function LeadTable({ leads, generatingLeadId = '', onViewProfile, onGenerateEmail, topEnrichCount = 20 }) {
  const topEnrichedIds = new Set(
    leads
      .filter((lead) => lead.enriched)
      .sort((left, right) => Number(right.leadScore ?? right.score ?? 0) - Number(left.leadScore ?? left.score ?? 0))
      .slice(0, topEnrichCount)
      .map((lead) => lead.id),
  );

  const getHighlightBadges = (lead) => {
    const badges = [];
    const score = Number(lead.leadScore ?? lead.score ?? 0);
    const clicks = Number(lead.clicks || 0);
    const opens = Number(lead.opens || 0);

    if (topEnrichedIds.has(lead.id)) {
      badges.push({ label: `Top ${topEnrichCount}`, className: 'bg-amber-500/15 text-amber-200 ring-amber-400/30' });
    }

    if (clicks > 0 || opens > 1) {
      badges.push({ label: 'High engagement', className: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' });
    }

    if (score >= 75 && clicks === 0 && opens === 0) {
      badges.push({ label: 'Missed opportunity', className: 'bg-rose-500/15 text-rose-200 ring-rose-400/30' });
    }

    return badges;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-left">
          <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Business Name</th>
              <th className="px-4 py-3">Lead Score</th>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3">Enriched</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Reviews</th>
              <th className="px-4 py-3">Distance</th>
              <th className="px-4 py-3">Clicks</th>
              <th className="px-4 py-3">Opens</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {leads.map((lead) => {
              const highlightBadges = getHighlightBadges(lead);

              return (
                <tr
                  key={lead.id}
                  onClick={() => onViewProfile(lead)}
                  className="cursor-pointer transition hover:bg-slate-800/70"
                >
                  <td className="px-4 py-4 align-top text-sm text-white">
                    <div className="font-medium">{lead.name}</div>
                    {highlightBadges.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {highlightBadges.map((badge) => (
                          <span key={badge.label} className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${badge.className}`}>
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-slate-300">
                    <ScoreBadge tier={lead.tier || lead.scoreTier} score={lead.leadScore ?? lead.score} />
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-slate-300">{formatVariantBucket(lead)}</td>
                  <td className="px-4 py-4 align-top text-sm text-slate-300">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${lead.enriched ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' : 'bg-slate-700/60 text-slate-300 ring-slate-500/30'}`}>
                      {lead.enriched ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-slate-300">{lead.rating === null || lead.rating === undefined ? '—' : Number(lead.rating).toFixed(1)}</td>
                  <td className="px-4 py-4 align-top text-sm text-slate-300">{lead.reviewCount ?? 0}</td>
                  <td className="px-4 py-4 align-top text-sm text-slate-300">{lead.distanceMiles === null || lead.distanceMiles === undefined ? '—' : `${Number(lead.distanceMiles).toFixed(1)} mi`}</td>
                  <td className="px-4 py-4 align-top text-sm text-slate-300">{lead.clicks ?? 0}</td>
                  <td className="px-4 py-4 align-top text-sm text-slate-300">{lead.opens ?? 0}</td>
                  <td className="px-4 py-4 align-top text-sm text-slate-300">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onViewProfile(lead);
                        }}
                        className="rounded-lg border border-brand-500/40 px-3 py-1.5 text-xs font-medium text-brand-100 transition hover:border-brand-400 hover:text-white"
                      >
                        View Profile
                      </button>
                      {!lead.generatedEmail ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onGenerateEmail?.(lead);
                          }}
                          disabled={generatingLeadId === lead.id}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {generatingLeadId === lead.id ? 'Generating...' : 'Generate Email'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LeadTable;