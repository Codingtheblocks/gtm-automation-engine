import { useEffect, useState } from 'react';
import { formatDateTime, formatVariantBucket, getLeadScoreReasons } from '../utils/dashboardMetrics.js';

const getGenerationModeLabel = (generationMode = '') => {
  if (generationMode === 'generic_template' || generationMode === 'template') {
    return 'Template-based generation';
  }

  if (generationMode === 'prompt_gemini' || generationMode === 'full_enrichment') {
    return 'Full enrichment + Gemini';
  }

  if (generationMode === 'partial') {
    return 'Partial personalization';
  }

  return 'Not generated yet';
};

function InsightCard({ label, value, helper }) {
  return (
    <div className="rounded-xl bg-slate-950/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-200">{value}</p>
      {helper ? <p className="mt-1 text-sm text-slate-400">{helper}</p> : null}
    </div>
  );
}

function EmailModal({ lead, initialTab = 'profile', enrichingLeadId = '', generatingLeadId = '', manualEventKey = '', onEnrich, onGenerateEmail, onRecordEvent, onClose }) {
  if (!lead) {
    return null;
  }

  const [activeTab, setActiveTab] = useState(initialTab === 'email' ? 'email' : 'overview');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    setActiveTab(initialTab === 'email' ? 'email' : 'overview');
  }, [initialTab, lead?.id]);

  useEffect(() => {
    setCopyStatus('');
  }, [lead?.id, activeTab]);

  const isEnriching = enrichingLeadId === lead.id;
  const isGeneratingEmail = generatingLeadId === lead.id;
  const isRecordingOpen = manualEventKey === `${lead.id}:open`;
  const isRecordingClick = manualEventKey === `${lead.id}:click`;
  const services = lead.enrichment?.inferredServices || [];
  const scoreReasons = getLeadScoreReasons(lead);
  const engagementEvents = lead.events || [];
  const pipelineStageLabel = lead.enrichmentStatus === 'enriched'
    ? 'Enriched and ready for personalized follow-up'
    : lead.generatedEmail
      ? 'Draft generated using the lightweight path'
      : 'Queued for enrichment or draft generation';

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
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{lead.name}</h2>
            <p className="text-sm text-slate-400">Lead insights, engagement events, and draft details</p>
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

        <div className="space-y-5 px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {[
              ['overview', 'Overview'],
              ['engagement', 'Engagement'],
              ['email', 'Email'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                disabled={key === 'email' && !lead.generatedEmail}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === key ? 'bg-brand-600 text-white' : 'border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <InsightCard label="Assigned Variant" value={formatVariantBucket(lead)} helper="This combines the offer experiment with the score tier bucket." />
                <InsightCard label="Auto-assigned Tone" value={lead.tone || lead.outreachTone || 'Not assigned yet'} helper="Tone is chosen automatically from the lead context and generation path." />
                <InsightCard label="Processing Strategy" value={getGenerationModeLabel(lead.generationMode)} helper={pipelineStageLabel} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <InsightCard
                  label="Services detected"
                  value={services.length ? services.join(', ') : 'No scraped services available yet'}
                  helper="Services are inferred from the website / Playwright pass when enrichment is available."
                />
                <InsightCard
                  label="Why it scored high"
                  value={scoreReasons.join(', ')}
                  helper="These are the strongest input signals currently visible for this lead."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <InsightCard label="Website" value={lead.website || 'No website available'} />
                <InsightCard label="Phone" value={lead.phone || 'No phone available'} />
                <InsightCard label="Address" value={lead.address || 'No address available'} />
              </div>
            </div>
          ) : null}

          {activeTab === 'engagement' ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <InsightCard label="Opens" value={String(lead.opens ?? 0)} helper="Total tracked opens" />
                <InsightCard label="Clicks" value={String(lead.clicks ?? 0)} helper="Total tracked clicks" />
                <InsightCard label="Last Activity" value={formatDateTime(lead.lastActivityAt)} helper="Most recent recorded open or click event" />
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Manual QA controls</p>
                    <p className="mt-1 text-sm text-slate-400">Use these to force local open or click events into the same tracking pipeline used by real CTA and pixel interactions.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onRecordEvent?.(lead, 'open')}
                      disabled={!lead.generatedEmail || isRecordingOpen || isRecordingClick}
                      className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isRecordingOpen ? 'Marking Opened...' : 'Mark Email Opened'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRecordEvent?.(lead, 'click')}
                      disabled={!lead.generatedEmail || isRecordingOpen || isRecordingClick}
                      className="rounded-lg border border-brand-500/40 px-3 py-2 text-xs font-medium text-brand-100 transition hover:border-brand-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isRecordingClick ? 'Marking Clicked...' : 'Mark URL Clicked'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Engagement events</p>
                <div className="mt-3 space-y-3">
                  {engagementEvents.length ? engagementEvents.map((event, index) => (
                    <div key={`${event.type}-${event.timestamp}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
                      <span className="capitalize">{event.type}</span>
                      <span className="text-slate-400">{formatDateTime(event.timestamp)}</span>
                    </div>
                  )) : <div className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400">No engagement events recorded yet.</div>}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'email' ? (
            <div className="rounded-xl bg-slate-950/60 p-4">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Generated Email</p>
                  <p className="mt-1 text-sm text-slate-400">The profile view owns email access so reps stay in a single lead context.</p>
                </div>
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