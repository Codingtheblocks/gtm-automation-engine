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

export const formatDateTime = (value) => {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

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

const hashVariantSeed = (value = '') => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
};

const normalizeVariant = (value = '') => {
  const normalizedValue = String(value || '').trim().toUpperCase();

  if (!normalizedValue) {
    return '';
  }

  if (normalizedValue.includes('OFFER_A') || normalizedValue === 'A' || normalizedValue.endsWith('_A') || normalizedValue.includes('VARIANT_A')) {
    return 'A';
  }

  if (normalizedValue.includes('OFFER_B') || normalizedValue === 'B' || normalizedValue.endsWith('_B') || normalizedValue.includes('VARIANT_B')) {
    return 'B';
  }

  return '';
};

const getPreferredNumber = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const parsed = Number(value);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
};

const getPreferredPositiveNumber = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const parsed = Number(value);

    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const fallback = getPreferredNumber(...values);
  return fallback === null ? null : fallback;
};

const getFallbackVariant = (lead) => {
  const explicitVariant = normalizeVariant(lead.variant) || normalizeVariant(lead.offerVariant);

  if (explicitVariant) {
    return explicitVariant;
  }

  const assignmentSeed = String(lead.id || '').trim() || `${lead.name || ''}::${lead.address || ''}::${lead.city || ''}`;
  return hashVariantSeed(assignmentSeed) % 2 === 0 ? 'A' : 'B';
};

export const formatVariantBucket = (lead) => {
  const variant = normalizeVariant(lead.variant) || getFallbackVariant(lead);
  const tier = lead.generationMode === 'full_enrichment' || lead.generationMode === 'prompt_gemini'
    ? 'High'
    : 'Low';

  return `Offer ${variant} ${tier}`;
};

export const getLocalLeadStatus = (lead) => {
  if (Number(lead.clicks || 0) > 0 || Number(lead.uniqueClicks || 0) > 0) {
    return 'clicked';
  }

  if (Number(lead.opens || 0) > 0 || Number(lead.uniqueOpens || 0) > 0) {
    return 'opened';
  }

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
  ...trackedLead,
  variant: normalizeVariant(trackedLead?.variant) || normalizeVariant(lead.variant) || normalizeVariant(lead.offerVariant) || getFallbackVariant(lead),
  tier: trackedLead?.tier || lead.scoreTier || getTierFromScore(lead.leadScore),
  status: trackedLead?.status || getLocalLeadStatus(lead),
  opens: trackedLead?.opens ?? 0,
  clicks: trackedLead?.clicks ?? 0,
  uniqueOpens: trackedLead?.uniqueOpens ?? 0,
  uniqueClicks: trackedLead?.uniqueClicks ?? 0,
  cost: trackedLead?.cost ?? lead.estimatedCost ?? 0,
  enriched: trackedLead?.enriched ?? (lead.enrichmentStatus === 'enriched'),
  enrichmentLevel: trackedLead?.enrichmentLevel || getLocalEnrichmentLevel(lead),
  tone: trackedLead?.tone || lead.outreachTone || '—',
  emailPreview: trackedLead?.emailPreview || String(lead.generatedEmail || '').split('\n').find(Boolean) || '—',
  generationMode: trackedLead?.generationMode || lead.generationMode || '—',
  rating: getPreferredPositiveNumber(lead.rating, trackedLead?.rating) ?? 0,
  reviewCount: getPreferredPositiveNumber(lead.reviewCount, lead.reviews, trackedLead?.reviewCount) ?? 0,
  distanceMiles: getPreferredPositiveNumber(lead.distanceMiles, lead.distance, trackedLead?.distanceMiles),
  lastActivityAt: trackedLead?.lastActivityAt || lead.lastActivityAt || lead.updatedAt || '',
  events: trackedLead?.events || lead.events || [],
});

export const getDefaultLeadFilters = () => ({
  variant: 'all',
  city: 'all',
  enrichmentLevel: 'all',
  minScore: '0',
  maxScore: '100',
});

export const filterOperationalLeads = ({ leads, filters, searchFilters }) => leads
  .filter((lead) => Number(lead.rating || 0) >= Number(searchFilters?.minRating || 0))
  .filter((lead) => lead.distanceMiles === null || lead.distanceMiles === undefined || Number(lead.distanceMiles) <= Number(searchFilters?.maxDistance || 50))
  .filter((lead) => filters.variant === 'all' || lead.variant === filters.variant)
  .filter((lead) => filters.city === 'all' || (lead.city || 'Unknown') === filters.city)
  .filter((lead) => filters.enrichmentLevel === 'all'
    || (filters.enrichmentLevel === 'enriched' && lead.enriched)
    || (filters.enrichmentLevel === 'not_enriched' && !lead.enriched))
  .filter((lead) => Number(lead.leadScore ?? lead.score ?? 0) >= Number(filters.minScore || 0))
  .filter((lead) => Number(lead.leadScore ?? lead.score ?? 0) <= Number(filters.maxScore || 100))
  .sort((left, right) => {
    const scoreDelta = Number(right.leadScore ?? right.score ?? 0) - Number(left.leadScore ?? left.score ?? 0);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return Number(right.clicks || 0) - Number(left.clicks || 0);
  });

export const getLeadFilterOptions = ({ visibleLeads, dashboardFilters }) => ({
  variants: dashboardFilters?.variants?.length
    ? dashboardFilters.variants
    : [...new Set(visibleLeads.map((lead) => lead.variant).filter((variant) => variant && variant !== '—'))].sort(),
  cities: dashboardFilters?.cities?.length
    ? dashboardFilters.cities
    : [...new Set(visibleLeads.map((lead) => lead.city).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
  enrichmentLevels: ['enriched', 'not_enriched'],
});

export const getConfidenceBadgeClassName = (level = '') => {
  if (level === 'High') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }

  if (level === 'Medium') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }

  return 'border-slate-700 bg-slate-900/70 text-slate-300';
};

export const getOverviewKpiCards = (overview) => {
  const kpis = overview?.kpis;

  if (!kpis) {
    return [];
  }

  const trackedMetricsHelper = kpis.metricSource === 'benchmark'
    ? 'Benchmark-backed until live opens/clicks are recorded'
    : 'Live tracked events from local interactions';

  return [
    { label: 'Leads Processed', value: formatNumber(kpis.leadsProcessed), helper: 'Tracked drafted leads in SQLite' },
    { label: 'Leads Enriched', value: formatNumber(kpis.enrichedLeads), helper: 'Top-N leads routed through enrichment' },
    { label: 'Avg Lead Score', value: Number(kpis.averageLeadScore || 0).toFixed(1), helper: 'Average quality of processed leads' },
    { label: 'Cost / Lead', value: formatCurrency(kpis.costPerLead), helper: 'Total cost divided by processed leads' },
    { label: 'Cost / Click', value: formatCurrency(kpis.costPerClick), helper: 'Total cost divided by unique clicks' },
    { label: 'CTR', value: formatPercent(kpis.overallCtr), helper: trackedMetricsHelper },
    { label: 'Open Rate', value: formatPercent(kpis.openRate), helper: trackedMetricsHelper },
    { label: 'CTOR', value: formatPercent(kpis.ctor), helper: trackedMetricsHelper },
    { label: 'Engagement Rate', value: formatPercent(kpis.engagementRate), helper: trackedMetricsHelper },
    { label: 'Cost / Engagement', value: formatCurrency(kpis.costPerEngagement), helper: 'Total cost / (opens + clicks)' },
  ];
};

export const getSystemCards = (systemPerformance) => {
  const metrics = systemPerformance?.pipelineMetrics;

  if (!metrics) {
    return [];
  }

  return [
    { label: 'Leads Processed', value: formatNumber(metrics.leadsProcessed), helper: 'Tracked pipeline volume' },
    { label: 'Leads Enriched', value: formatNumber(metrics.leadsEnriched), helper: 'High-value leads routed through enrichment' },
    { label: 'Gemini Calls', value: formatNumber(metrics.geminiCalls), helper: 'Estimated from full-personalization + templates' },
    { label: 'API Calls / Lead', value: Number(metrics.apiCallsPerLead || 0).toFixed(1), helper: 'Centralized provider-call estimate' },
    { label: 'Avg Processing Time', value: formatDuration(metrics.averageProcessingTimeSeconds), helper: 'Derived from lead path complexity' },
  ];
};

export const getLeadScoreReasons = (lead) => {
  const reasons = [];

  if (Number(lead.rating || 0) >= 4.5) {
    reasons.push('Strong rating signal');
  }

  if (Number(lead.reviewCount || 0) >= 100) {
    reasons.push('High review volume');
  }

  if (lead.website || lead.hasWebsite) {
    reasons.push('Website signal available for richer personalization');
  }

  if (lead.distanceMiles !== null && lead.distanceMiles !== undefined && Number(lead.distanceMiles) <= 10) {
    reasons.push('Close to target market center');
  }

  if (!reasons.length) {
    reasons.push('Baseline location and business signals met the scoring threshold');
  }

  return reasons;
};