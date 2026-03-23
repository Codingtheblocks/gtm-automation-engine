import SearchForm from '../components/SearchForm.jsx';
import LeadTable from '../components/LeadTable.jsx';
import SectionPanel from '../components/dashboard/SectionPanel.jsx';
import StatCard from '../components/dashboard/StatCard.jsx';
import LeadFilterBar from '../components/dashboard/LeadFilterBar.jsx';
import { formatNumber } from '../utils/dashboardMetrics.js';

function LeadsPage({
  form,
  loading,
  onFormChange,
  onSearch,
  leads,
  searchMetadata,
  searchFilters,
  onSearchFilterChange,
  leadFilters,
  leadFilterOptions,
  onLeadFilterChange,
  generating,
  onGenerateEmails,
  generatingLeadId,
  onViewProfile,
  onViewEmail,
  onGenerateEmail,
  promptSettings,
  loadingPromptSettings,
  savingPromptSettings,
  promptSettingsStatus,
  onPromptSettingsChange,
  onSavePromptSettings,
  onClearSavedState,
}) {
  const draftedLeads = leads.filter((lead) => lead.generatedEmail).length;
  const enrichedLeads = leads.filter((lead) => lead.enrichmentStatus === 'enriched').length;

  return (
    <div className="space-y-6">
      <SectionPanel
        eyebrow="Operational view"
        title="Lead pipeline and outreach workflow"
        description="Search territory, enrich selectively, generate tracked drafts, and work the queue with GTM-style filters."
        actions={(
          <button
            type="button"
            disabled={!leads.length || generating}
            onClick={onGenerateEmails}
            className="rounded-xl border border-brand-400/40 bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? 'Generating Drafts...' : `Generate Emails for Top ${searchMetadata?.topEnrichCount || 20}`}
          </button>
        )}
      >
        <SearchForm form={form} loading={loading} onChange={onFormChange} onSubmit={onSearch} />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <StatCard label="Visible Leads" value={formatNumber(leads.length)} helper={searchMetadata ? `Radius expansion: ${searchMetadata.radiiUsedMiles?.join(' → ')} miles` : 'Filtered operational lead list'} />
          <StatCard label="Drafted" value={formatNumber(draftedLeads)} helper="Leads with generated tracked drafts" accent="emerald" />
          <StatCard label="Enriched" value={formatNumber(enrichedLeads)} helper={`Top ${searchMetadata?.topEnrichCount || 20} prioritized for enrichment`} accent="amber" />
        </div>
      </SectionPanel>

      <SectionPanel eyebrow="Queue controls" title="Lead filters" description="Focus the list by experiment variant, quality band, geography, and enrichment investment.">
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Minimum rating</span>
              <input type="range" min="0" max="5" step="0.5" value={searchFilters.minRating} onChange={(event) => onSearchFilterChange('minRating', event.target.value)} className="w-full" />
              <span className="text-xs text-slate-400">{searchFilters.minRating}+</span>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Maximum distance</span>
              <input type="range" min="1" max="50" step="1" value={searchFilters.maxDistance} onChange={(event) => onSearchFilterChange('maxDistance', event.target.value)} className="w-full" />
              <span className="text-xs text-slate-400">Within {searchFilters.maxDistance} miles</span>
            </label>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
              These search-stage filters still apply before operational filters so you can narrow territory without losing your existing workflow.
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <LeadFilterBar filters={leadFilters} options={leadFilterOptions} onChange={onLeadFilterChange} />
          </div>
        </div>
      </SectionPanel>

      <SectionPanel eyebrow="Lead operations" title="Lead queue" description="Decision-focused columns only: quality, experiment assignment, engagement, enrichment, and cost.">
        <LeadTable
          leads={leads}
          generatingLeadId={generatingLeadId}
          onViewProfile={onViewProfile}
          onViewEmail={onViewEmail}
          onGenerateEmail={onGenerateEmail}
        />
      </SectionPanel>

      <SectionPanel
        eyebrow="Prompt system"
        title="Company and offer settings"
        description="Saving updates the prompt files and refreshes the reusable low-score templates for future generic-template drafts."
        actions={(
          <button
            type="button"
            disabled={loadingPromptSettings || savingPromptSettings}
            onClick={onSavePromptSettings}
            className="rounded-xl border border-brand-400/40 bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPromptSettings ? 'Saving...' : 'Save Prompt Settings'}
          </button>
        )}
      >
        <div className="grid gap-3 md:grid-cols-5">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Company Name</span>
            <input name="companyName" value={promptSettings.companyName} onChange={onPromptSettingsChange} disabled={loadingPromptSettings || savingPromptSettings} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500 disabled:opacity-60" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Company About</span>
            <textarea name="companyAbout" value={promptSettings.companyAbout} onChange={onPromptSettingsChange} disabled={loadingPromptSettings || savingPromptSettings} rows="4" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500 disabled:opacity-60" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Company URL</span>
            <input name="companyUrl" value={promptSettings.companyUrl} onChange={onPromptSettingsChange} disabled={loadingPromptSettings || savingPromptSettings} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500 disabled:opacity-60" placeholder="https://yourcompany.com/offer" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Offer A</span>
            <textarea name="offerA" value={promptSettings.offerA} onChange={onPromptSettingsChange} disabled={loadingPromptSettings || savingPromptSettings} rows="4" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500 disabled:opacity-60" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Offer B</span>
            <textarea name="offerB" value={promptSettings.offerB} onChange={onPromptSettingsChange} disabled={loadingPromptSettings || savingPromptSettings} rows="4" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500 disabled:opacity-60" />
          </label>
        </div>
        {promptSettingsStatus ? <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{promptSettingsStatus}</div> : null}
      </SectionPanel>

      <SectionPanel eyebrow="Persistence" title="Saved lead state" description="Current search results and drafts are still persisted in local storage on this machine.">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-400">Use this to reset the local search workspace without touching tracked campaign analytics stored in SQLite.</p>
          <button type="button" onClick={onClearSavedState} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white">Clear Saved Leads & Drafts</button>
        </div>
      </SectionPanel>
    </div>
  );
}

export default LeadsPage;
