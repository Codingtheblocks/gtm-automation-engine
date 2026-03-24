import { useEffect, useMemo, useState } from 'react';
import EmailModal from './components/EmailModal.jsx';
import DashboardNav from './components/dashboard/DashboardNav.jsx';
import CampaignOverviewPage from './pages/CampaignOverviewPage.jsx';
import LeadsPage from './pages/LeadsPage.jsx';
import SystemPerformancePage from './pages/SystemPerformancePage.jsx';
import {
  filterOperationalLeads,
  getDefaultLeadFilters,
  getLeadFilterOptions,
  mergeLeadWithTracking,
} from './utils/dashboardMetrics.js';
import {
  enrichDemoLead,
  generateDemoEmailForLead,
  generateDemoEmails,
  isDemoMode,
  loadDemoState,
  persistDemoState,
  recordDemoLeadEvent,
  resetDemoState,
  saveDemoPromptSettings,
  searchDemoLeads,
} from './demo/demoDataService.js';

const LEADS_API_BASE_URL = 'http://localhost:3001/api/leads';
const DASHBOARD_API_BASE_URL = 'http://localhost:3001/api/dashboard';
const DASHBOARD_POLL_INTERVAL_MS = 5000;
const STORAGE_KEY = 'repair-shops-dashboard-state';
const DEFAULT_COMPANY_URL = 'http://localhost:5173/company-site';
const EMPTY_PROMPT_SETTINGS = {
  companyName: '',
  companyAbout: '',
  companyUrl: DEFAULT_COMPANY_URL,
  offerA: '',
  offerB: '',
};
const EMPTY_DASHBOARD_DATA = {
  overview: null,
  leads: {
    rows: [],
    filters: {
      variants: [],
      cities: [],
      enrichmentLevels: ['full', 'partial', 'none'],
      scoreRange: { min: 0, max: 100 },
    },
  },
  systemPerformance: null,
};

const getInitialDashboardState = () => {
  if (typeof window === 'undefined') {
    return {
      form: { city: '', keyword: 'car repair' },
      filters: { minimumRating: 1, minRating: 0, maxDistance: 50 },
      leads: [],
      searchMetadata: null,
    };
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return {
        form: { city: '', keyword: 'car repair' },
        filters: { minimumRating: 1, minRating: 0, maxDistance: 50 },
        leads: [],
        searchMetadata: null,
      };
    }

    const parsed = JSON.parse(rawValue);

    return {
      form: parsed.form || { city: '', keyword: 'car repair' },
      filters: parsed.filters || { minimumRating: 1, minRating: 0, maxDistance: 50 },
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      searchMetadata: parsed.searchMetadata || null,
    };
  } catch {
    return {
      form: { city: '', keyword: 'car repair' },
      filters: { minimumRating: 1, minRating: 0, maxDistance: 50 },
      leads: [],
      searchMetadata: null,
    };
  }
};

function App() {
  const demoMode = isDemoMode();
  const initialDashboardState = demoMode
    ? loadDemoState()
    : getInitialDashboardState();
  const [activePage, setActivePage] = useState('overview');
  const [form, setForm] = useState(initialDashboardState.form);
  const [filters, setFilters] = useState(initialDashboardState.filters);
  const [leadFilters, setLeadFilters] = useState(getDefaultLeadFilters());
  const [loading, setLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(!demoMode);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [leads, setLeads] = useState(initialDashboardState.leads);
  const [searchMetadata, setSearchMetadata] = useState(initialDashboardState.searchMetadata);
  const [dashboardData, setDashboardData] = useState(initialDashboardState.dashboardData || EMPTY_DASHBOARD_DATA);
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedLeadTab, setSelectedLeadTab] = useState('profile');
  const [enrichingLeadId, setEnrichingLeadId] = useState('');
  const [generatingLeadId, setGeneratingLeadId] = useState('');
  const [promptSettings, setPromptSettings] = useState(initialDashboardState.promptSettings || EMPTY_PROMPT_SETTINGS);
  const [loadingPromptSettings, setLoadingPromptSettings] = useState(!demoMode);
  const [savingPromptSettings, setSavingPromptSettings] = useState(false);
  const [promptSettingsStatus, setPromptSettingsStatus] = useState('');
  const [manualEventKey, setManualEventKey] = useState('');
  const [syncingHubSpot, setSyncingHubSpot] = useState(false);
  const [hubspotSyncStatus, setHubspotSyncStatus] = useState('');

  const loadPromptSettings = async () => {
    if (demoMode) {
      setPromptSettings(initialDashboardState.promptSettings || EMPTY_PROMPT_SETTINGS);
      setLoadingPromptSettings(false);
      return;
    }

    setLoadingPromptSettings(true);

    try {
      const response = await fetch(`${LEADS_API_BASE_URL}/prompt-settings`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load prompt settings');
      }

      setPromptSettings({
        companyName: data.companyName || '',
        companyAbout: data.companyAbout || '',
        companyUrl: data.companyUrl || DEFAULT_COMPANY_URL,
        offerA: data.offerA || '',
        offerB: data.offerB || '',
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingPromptSettings(false);
    }
  };

  const loadDashboardData = async ({ showLoading = true } = {}) => {
    if (demoMode) {
      setDashboardData((current) => current || initialDashboardState.dashboardData || EMPTY_DASHBOARD_DATA);
      setLoadingDashboard(false);
      return;
    }

    if (showLoading) {
      setLoadingDashboard(true);
    }

    try {
      const response = await fetch(DASHBOARD_API_BASE_URL);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load dashboard data');
      }

      setDashboardData({
        overview: data.overview || EMPTY_DASHBOARD_DATA.overview,
        leads: data.leads || EMPTY_DASHBOARD_DATA.leads,
        systemPerformance: data.systemPerformance || EMPTY_DASHBOARD_DATA.systemPerformance,
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoading) {
        setLoadingDashboard(false);
      }
    }
  };

  useEffect(() => {
    loadPromptSettings();
    loadDashboardData();
  }, [demoMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (demoMode) {
      persistDemoState({
        form,
        filters,
        leads,
        searchMetadata,
        dashboardData,
        promptSettings,
      });
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        form,
        filters,
        leads,
        searchMetadata,
      }),
    );
  }, [dashboardData, demoMode, filters, form, leads, promptSettings, searchMetadata]);

  useEffect(() => {
    if (demoMode) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      loadDashboardData({ showLoading: false });
    }, DASHBOARD_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [demoMode]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSearchFilterChange = (name, value) => {
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleLeadFilterChange = (name, value) => {
    setLeadFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handlePromptSettingsChange = (event) => {
    const { name, value } = event.target;
    setPromptSettings((current) => ({
      ...current,
      [name]: value,
    }));
    setPromptSettingsStatus('');
  };

  const handleOpenLead = (lead, tab = 'profile') => {
    setSelectedLead(lead);
    setSelectedLeadTab(tab);
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    if (demoMode) {
      const data = searchDemoLeads({ dashboardData, form });
      setLeads(data.leads || []);
      setSearchMetadata(data.searchMetadata || null);
      setActivePage('leads');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${LEADS_API_BASE_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch leads');
      }

      setLeads(data.leads || []);
      setSearchMetadata(data.searchMetadata || null);
      setActivePage('leads');
    } catch (requestError) {
      setError(requestError.message);
      setLeads([]);
      setSearchMetadata(null);
    } finally {
      setLoading(false);
    }
  };

  const handleEnrichLead = async (lead) => {
    if (!lead?.id) {
      return;
    }

    setEnrichingLeadId(lead.id);
    setError('');

    if (demoMode) {
      const data = enrichDemoLead({ dashboardData, leads, leadId: lead.id });
      setDashboardData(data.dashboardData || EMPTY_DASHBOARD_DATA);
      setLeads(data.leads || []);
      setSelectedLead((currentLead) => (currentLead?.id === lead.id ? data.lead : currentLead));
      setEnrichingLeadId('');
      return;
    }

    try {
      const response = await fetch(`${LEADS_API_BASE_URL}/enrich-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lead }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to enrich lead');
      }

      setLeads((currentLeads) => currentLeads.map((item) => (item.id === data.lead.id ? { ...item, ...data.lead } : item)));
      setSelectedLead((currentLead) => (currentLead?.id === data.lead.id ? { ...currentLead, ...data.lead } : currentLead));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setEnrichingLeadId('');
    }
  };

  const handleSavePromptSettings = async () => {
    setSavingPromptSettings(true);
    setError('');
    setPromptSettingsStatus('');

    if (demoMode) {
      const result = saveDemoPromptSettings(promptSettings);
      setPromptSettings(result.promptSettings);
      setPromptSettingsStatus(result.status);
      setSavingPromptSettings(false);
      return;
    }

    try {
      const response = await fetch(`${LEADS_API_BASE_URL}/prompt-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(promptSettings),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save prompt settings');
      }

      setPromptSettings({
        companyName: data.companyName || '',
        companyAbout: data.companyAbout || '',
        companyUrl: data.companyUrl || DEFAULT_COMPANY_URL,
        offerA: data.offerA || '',
        offerB: data.offerB || '',
      });
      setPromptSettingsStatus('Saved settings and refreshed low-score templates. Future drafts will use the updated prompt inputs.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingPromptSettings(false);
    }
  };

  const handleGenerateEmailForLead = async (lead, tab = 'email') => {
    if (!lead?.id) {
      return;
    }

    setGeneratingLeadId(lead.id);
    setError('');

    if (demoMode) {
      const data = generateDemoEmailForLead({ dashboardData, leads, leadId: lead.id });
      setDashboardData(data.dashboardData || EMPTY_DASHBOARD_DATA);
      setLeads(data.leads || []);
      setSelectedLead((currentLead) => {
        const nextLead = currentLead?.id === lead.id ? data.lead : currentLead;

        if (nextLead && tab === 'email') {
          setSelectedLeadTab('email');
        }

        return nextLead;
      });

      if (selectedLead?.id !== lead.id && data.lead) {
        handleOpenLead(data.lead, tab);
      }

      setGeneratingLeadId('');
      return;
    }

    try {
      const response = await fetch(`${LEADS_API_BASE_URL}/generate-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lead }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate email');
      }

      setLeads((currentLeads) => currentLeads.map((item) => (item.id === data.lead.id ? { ...item, ...data.lead } : item)));
      setSelectedLead((currentLead) => {
        const nextLead = currentLead?.id === data.lead.id ? { ...currentLead, ...data.lead } : currentLead;

        if (nextLead && tab === 'email') {
          setSelectedLeadTab('email');
        }

        return nextLead;
      });

      if (selectedLead?.id !== data.lead.id) {
        handleOpenLead(data.lead, tab);
      }

      await loadDashboardData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setGeneratingLeadId('');
    }
  };

  const handleGenerateEmails = async () => {
    setGenerating(true);
    setError('');

    if (demoMode) {
      const data = generateDemoEmails({ dashboardData, leads });
      setDashboardData(data.dashboardData || EMPTY_DASHBOARD_DATA);
      setLeads(data.leads || []);
      setSelectedLead((currentLead) => (currentLead ? (data.leads || []).find((lead) => lead.id === currentLead.id) || currentLead : currentLead));
      setGenerating(false);
      return;
    }

    try {
      const batchSize = searchMetadata?.topEnrichCount || 20;
      const response = await fetch(`${LEADS_API_BASE_URL}/generate-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leads, topN: batchSize }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate emails');
      }

      const emailMap = new Map(data.emails.map((item) => [item.id, item]));
      setLeads((currentLeads) =>
        currentLeads.map((lead) => ({
          ...lead,
          ...(emailMap.get(lead.id) || {}),
          generatedEmail: emailMap.get(lead.id)?.generatedEmail || lead.generatedEmail,
        })),
      );
      setSelectedLead((currentLead) =>
        currentLead
          ? {
              ...currentLead,
              ...(emailMap.get(currentLead.id) || {}),
              generatedEmail: emailMap.get(currentLead.id)?.generatedEmail || currentLead.generatedEmail,
            }
          : currentLead,
      );

      await loadDashboardData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRecordLeadEvent = async (lead, eventType) => {
    if (!lead?.id) {
      return;
    }

    const nextManualEventKey = `${lead.id}:${eventType}`;
    setManualEventKey(nextManualEventKey);
    setError('');

    if (demoMode) {
      const data = recordDemoLeadEvent({ dashboardData, leads, leadId: lead.id, eventType });
      setDashboardData(data.dashboardData || EMPTY_DASHBOARD_DATA);
      setLeads(data.leads || []);
      setSelectedLead((currentLead) => (currentLead?.id === lead.id ? data.lead : currentLead));
      setManualEventKey('');
      return;
    }

    try {
      const response = await fetch(`${LEADS_API_BASE_URL}/${lead.id}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to record lead event');
      }

      await loadDashboardData({ showLoading: false });
      setSelectedLead((currentLead) => (currentLead?.id === lead.id ? { ...currentLead, ...(data.lead || {}) } : currentLead));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setManualEventKey('');
    }
  };

  const handleSyncAllToHubSpot = async () => {
    setError('');
    setHubspotSyncStatus('');

    if (demoMode) {
      setHubspotSyncStatus('HubSpot sync is unavailable in demo mode because the frontend is not connected to the backend CRM pipeline.');
      return;
    }

    setSyncingHubSpot(true);

    try {
      const response = await fetch(`${LEADS_API_BASE_URL}/sync-hubspot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to sync tracked leads to HubSpot');
      }

      setHubspotSyncStatus(`Synced ${data.syncedContacts || 0} of ${data.totalLeads || 0} tracked leads to HubSpot • Generated: ${data.generatedEvents || 0} • Opens: ${data.openEvents || 0} • Clicks: ${data.clickEvents || 0}`);
      await loadDashboardData({ showLoading: false });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSyncingHubSpot(false);
    }
  };

  const trackedLeadMap = useMemo(
    () => new Map((dashboardData.leads?.rows || []).map((lead) => [lead.id, lead])),
    [dashboardData.leads?.rows],
  );

  const operationalLeads = useMemo(
    () => leads.map((lead) => ({
      ...mergeLeadWithTracking(lead, trackedLeadMap.get(lead.id)),
      city: trackedLeadMap.get(lead.id)?.city || lead.city || form.city || 'Unknown',
    })),
    [form.city, leads, trackedLeadMap],
  );

  useEffect(() => {
    if (!selectedLead?.id) {
      return;
    }

    const nextSelectedLead = operationalLeads.find((lead) => lead.id === selectedLead.id);

    if (nextSelectedLead) {
      setSelectedLead(nextSelectedLead);
    }
  }, [operationalLeads, selectedLead?.id]);

  const visibleLeads = useMemo(
    () => filterOperationalLeads({ leads: operationalLeads, filters: leadFilters, searchFilters: filters }),
    [filters, leadFilters, operationalLeads],
  );

  const leadFilterOptions = useMemo(
    () => getLeadFilterOptions({ visibleLeads: operationalLeads, dashboardFilters: dashboardData.leads?.filters }),
    [dashboardData.leads?.filters, operationalLeads],
  );

  const handleClearSavedState = () => {
    if (demoMode) {
      const resetState = resetDemoState();
      setForm(resetState.form);
      setFilters(resetState.filters);
      setLeadFilters(getDefaultLeadFilters());
      setLeads(resetState.leads);
      setSearchMetadata(resetState.searchMetadata);
      setDashboardData(resetState.dashboardData);
      setPromptSettings(resetState.promptSettings);
      setSelectedLead(null);
      setSelectedLeadTab('profile');
      setPromptSettingsStatus('');
      setError('');
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    setForm({ city: '', keyword: 'car repair' });
    setFilters({ minimumRating: 1, minRating: 0, maxDistance: 50 });
    setLeadFilters(getDefaultLeadFilters());
    setLeads([]);
    setSearchMetadata(null);
    setSelectedLead(null);
    setError('');
  };

  const renderedPage = activePage === 'overview'
    ? <CampaignOverviewPage overview={dashboardData.overview} draftedLeadCount={dashboardData.overview?.kpis?.totalLeads || 0} />
    : activePage === 'system'
      ? <SystemPerformancePage systemPerformance={dashboardData.systemPerformance} />
      : (
          <LeadsPage
            form={form}
            loading={loading}
            onFormChange={handleFormChange}
            onSearch={handleSearch}
            leads={visibleLeads}
            searchMetadata={searchMetadata}
            searchFilters={filters}
            onSearchFilterChange={handleSearchFilterChange}
            generating={generating}
            onGenerateEmails={handleGenerateEmails}
            generatingLeadId={generatingLeadId}
            onViewProfile={(lead) => handleOpenLead(lead, 'profile')}
            onViewEmail={(lead) => handleOpenLead(lead, 'email')}
            onGenerateEmail={(lead) => handleGenerateEmailForLead(lead, 'email')}
            promptSettings={promptSettings}
            loadingPromptSettings={loadingPromptSettings}
            savingPromptSettings={savingPromptSettings}
            promptSettingsStatus={promptSettingsStatus}
            onPromptSettingsChange={handlePromptSettingsChange}
            onSavePromptSettings={handleSavePromptSettings}
            syncingHubSpot={syncingHubSpot}
            hubspotSyncStatus={hubspotSyncStatus}
            onSyncAllToHubSpot={handleSyncAllToHubSpot}
            onClearSavedState={handleClearSavedState}
          />
        );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 px-4 py-10 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="space-y-3">
          {demoMode ? (
            <span className="inline-flex rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-100">
              GTM Engineering Demo
            </span>
          ) : null}
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white">AI Lead Generation & Outreach System</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                A 3-page GTM dashboard for campaign health, lead operations, and system performance built on the existing enrichment, personalization, and tracked CTA pipeline.
              </p>
            </div>
            <DashboardNav activePage={activePage} onChange={setActivePage} />
          </div>
        </header>

        {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
        {demoMode ? <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">Demo mode is running from a static seed with per-browser persistence. Your interactions stay local to this browser and do not require API keys or a backend.</div> : null}
        {loadingDashboard ? <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">Refreshing dashboard metrics from tracked drafts...</div> : null}

        {renderedPage}

        {activePage === 'leads' && !loading && !visibleLeads.length ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
            No leads to display yet. Run a search, generate drafts, or widen your filters.
          </div>
        ) : null}

        <footer className="text-xs text-slate-500">
          {demoMode ? 'Frontend-only demo mode. Campaign state persists locally in this browser only.' : 'Public business data only. Emails are generated as drafts and are never sent.'}
        </footer>
      </div>

      <EmailModal
        lead={selectedLead}
        initialTab={selectedLeadTab}
        enrichingLeadId={enrichingLeadId}
        generatingLeadId={generatingLeadId}
        manualEventKey={manualEventKey}
        onEnrich={handleEnrichLead}
        onGenerateEmail={handleGenerateEmailForLead}
        onRecordEvent={handleRecordLeadEvent}
        onClose={() => {
          setSelectedLead(null);
          setSelectedLeadTab('profile');
        }}
      />
    </div>
  );
}

export default App;
