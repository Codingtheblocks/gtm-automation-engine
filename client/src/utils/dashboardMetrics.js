const HIGH_SCORE_THRESHOLD = 75;
const MID_SCORE_THRESHOLD = 45;

export const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

export const formatCurrency = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0));

export const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

export const formatDuration = (seconds) => `${Number(seconds || 0).toFixed(1)}s`;

export const toTitleCase = (value = '') => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

export const getTierFromScore = (score) => {
  const numericScore = Number(score || 0);

  if (numericScore >= HIGH_SCORE_THRESHOLD) {
    return 'high';
  }

  if (numericScore >= MID_SCORE_THRESHOLD) {
    return 'medium';
  }

  return 'low';
};

export const getScoreBand = (score) => {
  const numericScore = Number(score || 0);

  if (numericScore >= HIGH_SCORE_THRESHOLD) {
    return '75-100';
  }

  if (numericScore >= MID_SCORE_THRESHOLD) {
    return '45-74';
  }

  return '0-44';
};

export const getLocalLeadStatus = (lead) => {
  if (lead.generatedEmail) {
    return 'drafted';
  }

  if (lead.enrichmentStatus === 'enriched') {
    return 'enriched';
  }

  return 'queued';
};

export const getLocalEnrichmentLevel = (lead) => {
  if (lead.enrichmentStatus === 'enriched' && lead.generationMode === 'prompt_gemini') {
    return 'full';
  }

  if (lead.enrichmentStatus === 'enriched' || lead.generationMode === 'generic_template') {
    return 'partial';
  }

  return 'none';
};

export const mergeLeadWithTracking = (lead, trackedLead) => ({
  ...lead,
  variant: trackedLead?.variant || (lead.offerVariant ? String(lead.offerVariant).toUpperCase() : '—'),
  tier: trackedLead?.tier || lead.scoreTier || getTierFromScore(lead.leadScore),
  status: trackedLead?.status || getLocalLeadStatus(lead),
  opens: trackedLead?.opens || 0,
  clicks: trackedLead?.clicks || 0,
  uniqueOpens: trackedLead?.uniqueOpens || 0,
  uniqueClicks: trackedLead?.uniqueClicks || 0,
  cost: trackedLead?.cost ?? lead.estimatedCost ?? 0,
  enriched: trackedLead?.enriched ?? (lead.enrichmentStatus === 'enriched'),
  enrichmentLevel: trackedLead?.enrichmentLevel || getLocalEnrichmentLevel(lead),
  tone: trackedLead?.tone || lead.outreachTone || '—',
  emailPreview: trackedLead?.emailPreview || String(lead.generatedEmail || '').split('\n').find(Boolean) || '—',
  generationMode: trackedLead?.generationMode || lead.generationMode || '—',
});

export const getDefaultLeadFilters = () => ({
  variant: 'all',
  city: 'all',
  enrichmentLevel: 'all',
  minScore: '0',
  maxScore: '100',
});

export const filterOperationalLeads = ({ leads, filters, searchFilters }) => leads
  .filter((lead) => Number(lead.rating || 0) >= Number(searchFilters.minRating || 0))
  .filter((lead) => lead.distanceMiles === null || lead.distanceMiles === undefined || Number(lead.distanceMiles) <= Number(searchFilters.maxDistance || 50))
  .filter((lead) => filters.variant === 'all' || lead.variant === filters.variant)
  .filter((lead) => filters.city === 'all' || (lead.city || 'Unknown') === filters.city)
  .filter((lead) => filters.enrichmentLevel === 'all' || lead.enrichmentLevel === filters.enrichmentLevel)
  .filter((lead) => Number(lead.leadScore ?? lead.score ?? 0) >= Number(filters.minScore || 0))
  .filter((lead) => Number(lead.leadScore ?? lead.score ?? 0) <= Number(filters.maxScore || 100))
  .sort((left, right) => Number(right.leadScore ?? right.score ?? 0) - Number(left.leadScore ?? left.score ?? 0));

export const getLeadFilterOptions = ({ visibleLeads, dashboardFilters }) => ({
  variants: dashboardFilters?.variants?.length ? dashboardFilters.variants : [...new Set(visibleLeads.map((lead) => lead.variant).filter((variant) => variant && variant !== '—'))].sort(),
  cities: dashboardFilters?.cities?.length ? dashboardFilters.cities : [...new Set(visibleLeads.map((lead) => lead.city).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
  enrichmentLevels: dashboardFilters?.enrichmentLevels?.length ? dashboardFilters.enrichmentLevels : ['full', 'partial', 'none'],
});

export const getKpiCards = (overview) => {
  const kpis = overview?.kpis;

  if (!kpis) {
    return [];
  }

  return [
    { label: 'Total Leads', value: formatNumber(kpis.totalLeads), helper: 'Drafted leads tracked in SQLite' },
    { label: 'Enriched Leads', value: formatNumber(kpis.enrichedLeads), helper: 'Partial + full enrichment paths' },
    { label: 'Avg Lead Score', value: Number(kpis.averageLeadScore || 0).toFixed(1), helper: 'Average drafted lead quality' },
    { label: 'Total Cost', value: formatCurrency(kpis.totalCost), helper: 'Estimated blended spend' },
    { label: 'Cost / Lead', value: formatCurrency(kpis.costPerLead), helper: 'Estimated cost efficiency' },
    { label: 'Overall CTR', value: formatPercent(kpis.overallCtr), helper: 'Unique clicks / drafted leads' },
    { label: 'Open Rate', value: formatPercent(kpis.openRate), helper: 'Unique opens / drafted leads' },
  ];
};

export const getSystemCards = (systemPerformance) => {
  const metrics = systemPerformance?.coreMetrics;

  if (!metrics) {
    return [];
  }

  return [
    { label: 'Leads Enriched', value: formatNumber(metrics.leadsEnriched), helper: 'Leads receiving added context before drafting' },
    { label: 'Total Gemini Calls', value: formatNumber(metrics.totalGeminiCalls.value), helper: metrics.totalGeminiCalls.estimated ? 'Estimated from draft path mix' : 'Directly tracked' },
    { label: 'Avg API Calls / Lead', value: Number(metrics.averageApiCallsPerLead.value || 0).toFixed(1), helper: metrics.averageApiCallsPerLead.estimated ? 'Centralized derived estimate' : 'Directly tracked' },
    { label: 'Avg Processing Time', value: formatDuration(metrics.averageProcessingTimeSeconds.value), helper: metrics.averageProcessingTimeSeconds.estimated ? 'Derived from lead path complexity' : 'Directly tracked' },
    { label: 'Total Cost', value: formatCurrency(metrics.totalCost), helper: 'Estimated blended spend' },
    { label: 'Cost Saved via Tiering', value: formatCurrency(metrics.costSavedViaTiering), helper: 'Versus full-personalization baseline' },
  ];
};
