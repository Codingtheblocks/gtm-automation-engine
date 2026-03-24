import { useState } from 'react';
import SearchForm from '../components/SearchForm.jsx';
import LeadTable from '../components/LeadTable.jsx';
import SectionPanel from '../components/dashboard/SectionPanel.jsx';
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
  generating,
  onGenerateEmails,
  generatingLeadId,
  onViewProfile,
  onGenerateEmail,
  promptSettings,
  loadingPromptSettings,
  savingPromptSettings,
  promptSettingsStatus,
  onPromptSettingsChange,
  onSavePromptSettings,
  onClearSavedState,
}) {
  const [expandedPromptField, setExpandedPromptField] = useState(null);
  const topEnrichCount = searchMetadata?.topEnrichCount || 20;
  const enrichedCount = leads.filter((lead) => lead.enriched).length;
  const engagedCount = leads.filter((lead) => Number(lead.clicks || 0) > 0 || Number(lead.opens || 0) > 0).length;
  const missedOpportunityCount = leads.filter((lead) => Number(lead.leadScore ?? lead.score ?? 0) >= 75 && !lead.clicks && !lead.opens).length;

  const promptFieldLabels = {
    companyAbout: 'Company About',
    offerA: 'Offer A',
    offerB: 'Offer B',
  };

  const renderPromptPreview = (field, placeholder) => (
    <label className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{promptFieldLabels[field]}</span>
      <button
        type="button"
        disabled={loadingPromptSettings || savingPromptSettings}
        onClick={() => setExpandedPromptField(field)}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-left text-sm text-slate-100 outline-none transition hover:border-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="block max-h-16 overflow-hidden whitespace-pre-line text-ellipsis">
          {promptSettings[field]?.trim() || <span className="text-slate-500">{placeholder}</span>}
        </span>
      </button>
    </label>
  );

  const handleCloseExpandedField = () => setExpandedPromptField(null);

  const handleExpandedKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCloseExpandedField();
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleCloseExpandedField();
    }
  };

  return (
    <div className="space-y-6">
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
          {renderPromptPreview('companyAbout', 'Click to describe the company positioning...')}
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Company URL</span>
            <input name="companyUrl" value={promptSettings.companyUrl} onChange={onPromptSettingsChange} disabled={loadingPromptSettings || savingPromptSettings} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500 disabled:opacity-60" placeholder="https://yourcompany.com/offer" />
          </label>
          {renderPromptPreview('offerA', 'Click to compose Variant A offer copy...')}
          {renderPromptPreview('offerB', 'Click to compose Variant B offer copy...')}
        </div>
        {promptSettingsStatus ? <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{promptSettingsStatus}</div> : null}
      </SectionPanel>

      <SectionPanel
        eyebrow="Operations layer"
        title="Lead pipeline and outreach workflow"
        description="Search the market, generate tracked drafts, and work the queue with GTM-style operational filters."
        actions={(
          <button
            type="button"
            disabled={!leads.length || generating}
            onClick={onGenerateEmails}
            className="rounded-xl border border-brand-400/40 bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? 'Generating Drafts...' : `Generate Emails for Top ${topEnrichCount}`}
          </button>
        )}
      >
        <SearchForm
          form={{ ...form, ...searchFilters }}
          loading={loading}
          onChange={(event) => {
            const fieldName = event.target.name;

            if (fieldName === 'minimumRating' || fieldName === 'minRating' || fieldName === 'maxDistance') {
              onSearchFilterChange(fieldName, event.target.value);
              return;
            }

            onFormChange(event);
          }}
          onSubmit={onSearch}
        />
      </SectionPanel>

      <SectionPanel
        eyebrow="Lead operations"
        title="Lead queue"
        description="Review the ranked queue and work the next best leads based on the active search constraints."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Top enriched</p>
            <p className="mt-3 text-2xl font-semibold text-white">{formatNumber(enrichedCount)}</p>
            <p className="mt-2 text-sm text-slate-300">Top {topEnrichCount} leads are enriched first so spend concentrates where it should.</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">High engagement leads</p>
            <p className="mt-3 text-2xl font-semibold text-white">{formatNumber(engagedCount)}</p>
            <p className="mt-2 text-sm text-slate-300">These leads already have open or click activity and deserve immediate follow-up.</p>
          </div>
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-rose-200">Missed opportunity</p>
            <p className="mt-3 text-2xl font-semibold text-white">{formatNumber(missedOpportunityCount)}</p>
            <p className="mt-2 text-sm text-slate-300">High-score leads with no engagement are your best candidates for offer or tone changes.</p>
          </div>
        </div>

        <div className="mt-5">
          <LeadTable
            leads={leads}
            generatingLeadId={generatingLeadId}
            onViewProfile={onViewProfile}
            onGenerateEmail={onGenerateEmail}
            topEnrichCount={topEnrichCount}
          />
        </div>
      </SectionPanel>

      <SectionPanel eyebrow="Persistence" title="Saved lead state" description="Current search results and drafts are still persisted in local storage on this machine.">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-400">Use this to reset the local search workspace without touching tracked campaign analytics stored in SQLite.</p>
          <button type="button" onClick={onClearSavedState} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white">Clear Saved Leads & Drafts</button>
        </div>
      </SectionPanel>

      {expandedPromptField ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={handleCloseExpandedField}>
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-brand-200">{promptFieldLabels[expandedPromptField]}</span>
              <textarea
                name={expandedPromptField}
                value={promptSettings[expandedPromptField]}
                onChange={onPromptSettingsChange}
                onKeyDown={handleExpandedKeyDown}
                autoFocus
                rows="12"
                className="w-full rounded-xl border border-brand-500/40 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-400"
              />
            </label>
            <div className="mt-4 flex flex-col gap-3 text-xs text-slate-400 md:flex-row md:items-center md:justify-between">
              <p>Press Enter to collapse • Shift+Enter for newline • Esc to cancel</p>
              <div className="flex gap-2">
                <button type="button" onClick={handleCloseExpandedField} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white">Done</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LeadsPage;