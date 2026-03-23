import { useEffect, useState } from 'react';

function EmailModal({ lead, initialTab = 'profile', enrichingLeadId = '', generatingLeadId = '', onEnrich, onGenerateEmail, onClose }) {
  if (!lead) {
    return null;
  }

  const [activeTab, setActiveTab] = useState(initialTab);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, lead?.id]);

  useEffect(() => {
    setCopyStatus('');
  }, [lead?.id, activeTab]);

  const hasWebsite = lead.enrichmentStatus === 'enriched' && Boolean(lead.website);
  const isEnriching = enrichingLeadId === lead.id;
  const isGeneratingEmail = generatingLeadId === lead.id;
  const enrichmentDiagnostics = lead.enrichment?.diagnostics;
  const pipelineStageLabel = enrichmentDiagnostics?.reason === 'missing_website'
    ? 'Place Details enriched, but no website was available to analyze'
    : lead.enrichmentStatus === 'enriched'
      ? 'Fully enriched with Place Details and website analysis'
      : 'Lightweight lead from cheap search-stage scoring only';
  const generationModeLabel = lead.generationMode === 'generic_template'
    ? 'Reusable generic template'
    : lead.generationMode === 'prompt_gemini'
      ? 'Prompt-driven Gemini'
      : 'Not generated yet';
  const geminiUsageLabel = lead.generationMode
    ? lead.usedGemini
      ? 'Yes'
      : 'No'
    : 'Not generated yet';

  const handleCopyHtml = async () => {
    if (!lead.generatedEmailHtml) {
      setCopyStatus('No HTML email is available yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(lead.generatedEmailHtml);
      setCopyStatus('HTML copied with tracking included.');
    } catch {
      setCopyStatus('Failed to copy HTML.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{lead.name}</h2>
            <p className="text-sm text-slate-400">Profile and outreach details</p>
          </div>
          <div className="flex items-center gap-2">
            {!lead.generatedEmail ? (
              <button
                type="button"
                onClick={() => onGenerateEmail?.(lead, 'email')}
                disabled={isGeneratingEmail}
                className="rounded-lg border border-brand-500/40 px-3 py-2 text-sm text-brand-100 transition hover:border-brand-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingEmail ? 'Generating Email...' : 'Generate Email'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onEnrich?.(lead)}
              disabled={isEnriching}
              className="rounded-lg border border-brand-500/40 px-3 py-2 text-sm text-brand-100 transition hover:border-brand-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEnriching ? 'Enriching...' : 'Enrich Profile'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === 'profile' ? 'bg-brand-600 text-white' : 'border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'}`}
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('email')}
              disabled={!lead.generatedEmail}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === 'email' ? 'bg-brand-600 text-white' : 'border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Email
            </button>
          </div>

          {activeTab === 'profile' ? (
            <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Website</p>
              {hasWebsite ? (
                <a href={lead.website} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm text-brand-100 hover:text-white">
                  {lead.website}
                </a>
              ) : (
                <p className="mt-2 text-sm text-slate-300">
                  {lead.enrichmentStatus === 'enriched' ? 'No website found' : 'Website lookup deferred until enrichment'}
                </p>
              )}
            </div>
            <div className="rounded-xl bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Inferred Services</p>
              <p className="mt-2 text-sm text-slate-200">{lead.enrichment?.inferredServices?.join(', ') || 'Not available'}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Address</p>
              <p className="mt-2 text-sm text-slate-200">{lead.address || 'Not available'}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Phone</p>
              <p className="mt-2 text-sm text-slate-200">{lead.phone || 'Not available'}</p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pipeline Stage</p>
            <p className="mt-2 text-sm text-slate-200">{pipelineStageLabel}</p>
          </div>

          <div className="rounded-xl bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Enrichment Diagnostics</p>
            <p className="mt-2 text-sm text-slate-200">{enrichmentDiagnostics?.reason || 'No enrichment diagnostics available yet.'}</p>
            <p className="mt-1 text-sm text-slate-400">{enrichmentDiagnostics?.details || 'Run Enrich Profile to inspect the single-profile enrichment path.'}</p>
          </div>
            </>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Offer Variant</p>
              <p className="mt-2 text-sm text-slate-200">{lead.offerVariant || 'Not generated yet'}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Outreach Tone</p>
              <p className="mt-2 text-sm text-slate-200">{lead.outreachTone || 'Not generated yet'}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Generation Mode</p>
              <p className="mt-2 text-sm text-slate-200">{generationModeLabel}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Used Gemini</p>
              <p className="mt-2 text-sm text-slate-200">{geminiUsageLabel}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Template Source</p>
              <p className="mt-2 break-all text-sm text-slate-200">{lead.templatePath || 'Not applicable'}</p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Gemini Diagnostics</p>
            <p className="mt-2 text-sm text-slate-200">{lead.geminiReason || 'Not generated yet'}</p>
            <p className="mt-1 text-sm text-slate-400">{lead.geminiDetails || 'No Gemini diagnostics available yet.'}</p>
          </div>

          {!lead.generatedEmail && activeTab === 'profile' ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4">
              <p className="text-sm text-slate-300">No email draft has been generated for this lead yet.</p>
              <button
                type="button"
                onClick={() => onGenerateEmail?.(lead, 'email')}
                disabled={isGeneratingEmail}
                className="mt-3 rounded-lg border border-brand-500/40 px-3 py-2 text-sm text-brand-100 transition hover:border-brand-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingEmail ? 'Generating Email...' : 'Generate Email'}
              </button>
            </div>
          ) : null}

          {activeTab === 'email' ? (
            <div className="rounded-xl bg-slate-950/60 p-4">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs uppercase tracking-wide text-slate-500">Generated Email</p>
                <div className="flex items-center gap-3">
                  {copyStatus ? <span className="text-xs text-slate-400">{copyStatus}</span> : null}
                  <button
                    type="button"
                    onClick={handleCopyHtml}
                    disabled={!lead.generatedEmailHtml}
                    className="rounded-lg border border-brand-500/40 px-3 py-2 text-xs font-medium text-brand-100 transition hover:border-brand-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Copy HTML
                  </button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{lead.generatedEmail || 'No email draft generated yet.'}</pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default EmailModal;
