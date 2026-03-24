import demoSeed from './demoSeed.json';

const DEMO_STORAGE_KEY = 'repair-shops-demo-state-v1';
const HIGH_SCORE_THRESHOLD = 75;
const MID_SCORE_THRESHOLD = 45;
const MIN_DIRECTIONAL_SAMPLE_PER_VARIANT = 30;
const MIN_HIGH_CONFIDENCE_SAMPLE_PER_VARIANT = 60;
const MIN_SEGMENT_SAMPLE_SIZE = 3;
const MIN_ENRICHMENT_COMPARISON_SIZE = 8;
const DEFAULT_FORM = { city: 'Miami, FL', keyword: 'car repair' };
const DEFAULT_FILTERS = { minimumRating: 1, minRating: 0, maxDistance: 50 };
const DEMO_COMPANY_URL = 'https://codingtheblocks.github.io/gtm-automation-engine/company-site';
const DEMO_PROMPT_SETTINGS = {
  companyName: 'XYZ Parts Supply',
  companyAbout: 'We help independent repair shops source parts faster, reduce downtime, and protect margin on daily repair work.',
  companyUrl: DEMO_COMPANY_URL,
  offerA: 'Flexible billing for independent repair shops that need reliable parts availability without tying up cash flow.',
  offerB: 'Fast delivery for shops that win by moving vehicles through the bay quickly and keeping promised completion times.',
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const round = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));
const divide = (numerator, denominator) => (denominator ? numerator / denominator : 0);
const toPercent = (numerator, denominator) => round(divide(numerator, denominator) * 100, 1);
const toTitleCase = (value = '') => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const slugify = (value = '') => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const servicePool = [
  ['Brake service', 'Diagnostics', 'Suspension', 'Oil changes'],
  ['Tire service', 'Alignments', 'Engine repair', 'Fleet maintenance'],
  ['Mobile repair', 'Battery replacement', 'AC service', 'Preventive maintenance'],
  ['Transmission work', 'Electrical diagnostics', 'General repair', 'Inspection support'],
];

const scoreBand = (score) => {
  if (score >= HIGH_SCORE_THRESHOLD) {
    return '75-100';
  }

  if (score >= MID_SCORE_THRESHOLD) {
    return '45-74';
  }

  return '0-44';
};

const generationLabel = (lead) => (lead.generationMode === 'full_enrichment' ? 'full enrichment' : 'lightweight personalization');

const buildGeneratedEmail = (lead) => {
  const subjectLine = String(lead.emailPreview || `Subject: Supporting ${lead.name}`).trim();
  const intro = `Hi ${lead.name},`;
  const body = lead.generationMode === 'full_enrichment'
    ? `Noticed your shop in ${lead.city} and thought there may be a fit. We help repair shops keep jobs moving with faster parts coverage, better availability, and less time spent chasing suppliers. If improving turnaround and protecting margin is a priority right now, I can share how other local shops are using us.`
    : `Wanted to reach out because we work with local repair shops that need steadier parts support and fewer delays on active jobs. If that is relevant, I can send over a quick overview.`;
  const closing = 'Open to a quick look this week?';

  return `${subjectLine}\n\n${intro}\n\n${body}\n\n${closing}\n\nBest,\nXYZ Parts Supply`;
};

const buildGeneratedEmailHtml = (lead) => {
  const generatedEmail = buildGeneratedEmail(lead);
  return generatedEmail.split('\n\n').map((paragraph) => `<p>${paragraph}</p>`).join('');
};

const buildHomepageSummary = (lead) => `${lead.name} appears to focus on ${lead.distanceMiles <= 2 ? 'fast-turn local repair work' : 'full-service automotive repair'} in ${lead.city}, with strong customer trust signals from reviews and ratings.`;

const hydrateLead = (lead, index) => {
  const services = servicePool[index % servicePool.length];
  const website = lead.hasWebsite ? `https://www.${slugify(lead.name)}.com` : '';
  const address = `${120 + index} NW ${10 + index}th St, ${lead.city}`;
  const phone = `(305) 555-${String(1200 + index).slice(-4)}`;
  const fullLead = {
    ...lead,
    leadScore: lead.score,
    offerVariant: lead.variant,
    generatedEmail: buildGeneratedEmail(lead),
    generatedEmailHtml: buildGeneratedEmailHtml(lead),
    address,
    website,
    phone,
    enrichmentStatus: 'enriched',
    companyContextLoaded: true,
    offerContextLoaded: true,
    usedGemini: true,
    geminiReason: 'email_generated',
    geminiDetails: `${toTitleCase(generationLabel(lead))} path included in demo seed`,
    templatePath: '',
    trackingUrl: `https://codingtheblocks.github.io/gtm-automation-engine/?lead=${encodeURIComponent(lead.id)}`,
    openTrackingUrl: `https://codingtheblocks.github.io/gtm-automation-engine/?lead=${encodeURIComponent(lead.id)}&event=open`,
    destinationUrl: DEMO_COMPANY_URL,
    enrichment: {
      homepageText: `${lead.name} in ${lead.city} offers ${services.join(', ')} and has a ${lead.rating} star rating across ${lead.reviewCount} reviews.`,
      homepageSummary: buildHomepageSummary(lead),
      inferredServices: services,
      diagnostics: {
        stage: 'website_enrichment',
        status: 'success',
        reason: 'seed_loaded',
        details: 'Loaded from static GitHub Pages demo seed.',
      },
    },
  };

  return fullLead;
};

const summarizeRows = (rows) => {
  const aggregate = rows.reduce((result, lead) => {
    result.leads += 1;
    result.uniqueOpens += Number(lead.uniqueOpens || 0);
    result.totalOpens += Number(lead.opens || lead.totalOpens || 0);
    result.uniqueClicks += Number(lead.uniqueClicks || 0);
    result.totalClicks += Number(lead.clicks || lead.totalClicks || 0);
    result.totalCost += Number(lead.cost || 0);
    return result;
  }, {
    leads: 0,
    uniqueOpens: 0,
    totalOpens: 0,
    uniqueClicks: 0,
    totalClicks: 0,
    totalCost: 0,
  });
  const engagedLeads = rows.filter((lead) => Number(lead.uniqueOpens || 0) > 0 || Number(lead.uniqueClicks || 0) > 0).length;
  const safeUniqueClicks = Math.min(aggregate.uniqueClicks, aggregate.uniqueOpens || aggregate.uniqueClicks);

  return {
    ...aggregate,
    uniqueClicks: safeUniqueClicks,
    totalCost: round(aggregate.totalCost, 2),
    costPerLead: round(divide(aggregate.totalCost, aggregate.leads), 2),
    openRate: toPercent(aggregate.uniqueOpens, aggregate.leads),
    ctr: toPercent(safeUniqueClicks, aggregate.leads),
    ctor: toPercent(safeUniqueClicks, aggregate.uniqueOpens),
    costPerClick: round(divide(aggregate.totalCost, safeUniqueClicks), 2),
    costPerEngagement: round(divide(aggregate.totalCost, engagedLeads), 2),
    engagementRate: toPercent(engagedLeads, aggregate.leads),
    engagedLeads,
    metricSource: aggregate.uniqueOpens > 0 || safeUniqueClicks > 0 ? 'tracked' : 'tracked',
  };
};

const getMetricWinner = ({ left, right, higherIsBetter = true }) => {
  if (left === right) {
    return '—';
  }

  if (higherIsBetter) {
    return left > right ? 'A' : 'B';
  }

  return left < right ? 'A' : 'B';
};

const getDataConfidence = (variantSummaries) => {
  const leadsPerVariant = variantSummaries.map((variant) => variant.leads);
  const minimumLeadCount = leadsPerVariant.length ? Math.min(...leadsPerVariant) : 0;
  const totalEventVolume = variantSummaries.reduce((sum, variant) => sum + variant.uniqueOpens + variant.uniqueClicks, 0);

  if (minimumLeadCount >= MIN_HIGH_CONFIDENCE_SAMPLE_PER_VARIANT && totalEventVolume >= 24) {
    return {
      level: 'High',
      reason: 'Both variants have enough lead volume and event density for a strong experiment read.',
    };
  }

  if (minimumLeadCount >= MIN_DIRECTIONAL_SAMPLE_PER_VARIANT && totalEventVolume >= 10) {
    return {
      level: 'Medium',
      reason: 'The experiment has directional signal, but keep collecting events before making a hard rollout decision.',
    };
  }

  return {
    level: 'Low',
    reason: 'Sample size is still thin, so treat the winner as directional rather than statistically strong.',
  };
};

const getVariantWinner = (variantSummaries) => {
  const variantA = variantSummaries.find((variant) => variant.variant === 'A');
  const variantB = variantSummaries.find((variant) => variant.variant === 'B');
  const hasTrackedEvents = variantSummaries.some((variant) => variant.uniqueOpens > 0 || variant.uniqueClicks > 0);

  if (!variantA || !variantB || !hasTrackedEvents) {
    return null;
  }

  const winner = (variantA.ctr > variantB.ctr || (variantA.ctr === variantB.ctr && variantA.openRate >= variantB.openRate)) ? variantA : variantB;
  const loser = winner.variant === 'A' ? variantB : variantA;
  const ctrLiftPercent = loser.ctr > 0 ? round(((winner.ctr - loser.ctr) / loser.ctr) * 100, 0) : round(winner.ctr - loser.ctr, 1);
  const costPerClickReductionPercent = loser.costPerClick > 0 ? round(((loser.costPerClick - winner.costPerClick) / loser.costPerClick) * 100, 0) : 0;

  return {
    variant: winner.variant,
    label: winner.variant === 'A' ? 'Flexible Billing' : 'Fast Delivery',
    ctrLiftPercent,
    costPerClickReductionPercent,
  };
};

const rankSegment = (rows, getLabel, minimumSampleSize = 1) => {
  const segments = new Map();

  rows.forEach((row) => {
    const label = getLabel(row);

    if (!label) {
      return;
    }

    if (!segments.has(label)) {
      segments.set(label, []);
    }

    segments.get(label).push(row);
  });

  return [...segments.entries()]
    .map(([label, items]) => {
      const summary = summarizeRows(items);
      return {
        label,
        leads: items.length,
        ctr: summary.ctr,
        openRate: summary.openRate,
        weightedPerformance: round(summary.ctr * 0.7 + summary.openRate * 0.3, 1),
      };
    })
    .filter((segment) => segment.leads >= minimumSampleSize)
    .sort((left, right) => right.weightedPerformance - left.weightedPerformance || right.leads - left.leads)[0] || null;
};

const getEnrichmentImpact = (rows) => {
  const enrichedRows = rows.filter((row) => row.enrichmentLevel !== 'none');
  const remainingRows = rows.filter((row) => row.enrichmentLevel === 'none');
  const enrichedSummary = summarizeRows(enrichedRows);
  const remainingSummary = summarizeRows(remainingRows);
  const hasEnoughData = enrichedRows.length >= MIN_ENRICHMENT_COMPARISON_SIZE && remainingRows.length >= MIN_ENRICHMENT_COMPARISON_SIZE;

  if (!hasEnoughData) {
    return {
      hasEnoughData: false,
      enrichedLeadCount: enrichedRows.length,
      nonEnrichedLeadCount: remainingRows.length,
      message: 'Not enough enriched leads yet to measure performance',
      insight: 'Route more tracked drafts through enrichment before comparing CTR lift.',
    };
  }

  const uplift = round(enrichedSummary.ctr - remainingSummary.ctr, 1);
  return {
    hasEnoughData: true,
    enrichedLeadCount: enrichedRows.length,
    nonEnrichedLeadCount: remainingRows.length,
    enrichedCtr: enrichedSummary.ctr,
    nonEnrichedCtr: remainingSummary.ctr,
    uplift,
    message: uplift > 0 ? `Enrichment is lifting CTR by ${uplift} percentage points.` : 'Enrichment is currently performing in line with non-enriched leads.',
    insight: uplift > 0 ? 'Prioritize enrichment on the next batch of high-intent shops to confirm the lift holds.' : 'Keep enrichment focused on the highest-value leads until the comparison stabilizes.',
  };
};

const buildOverviewRecommendations = ({ totals, bestCity, enrichmentImpact, dataConfidence, winner, variantSummaries }) => {
  const recommendations = [
    {
      category: 'Variant optimization',
      title: winner?.variant ? `Keep testing toward Variant ${winner.variant}` : 'Keep the A/B split balanced',
      detail: winner?.variant
        ? `Variant ${winner.variant} is directionally ahead, but confidence is ${dataConfidence.level.toLowerCase()}. Hold the 50/50 split until each variant has deeper event volume.`
        : 'Neither variant has separated yet. Keep traffic balanced and collect more opens and clicks before changing allocation.',
    },
    {
      category: 'Geographic expansion',
      title: bestCity?.label ? `Expand targeting in ${bestCity.label}` : 'Wait for stronger city-level signal',
      detail: bestCity?.label
        ? `${bestCity.label} is the strongest live cluster right now. Add adjacent city searches and keep the winning offer consistent there.`
        : 'City-level performance is still sparse. Generate more tracked drafts before broadening the geo strategy.',
    },
    {
      category: 'Enrichment strategy',
      title: enrichmentImpact.hasEnoughData && enrichmentImpact.uplift > 0 ? 'Expand enrichment to the next highest-value cohort' : 'Use enrichment selectively while data matures',
      detail: enrichmentImpact.hasEnoughData ? enrichmentImpact.message : enrichmentImpact.message,
    },
  ];

  if (totals.uniqueOpens === 0 && totals.uniqueClicks === 0) {
    recommendations.push({
      category: 'Measurement quality',
      title: 'Capture first live opens and clicks',
      detail: 'Current headline engagement metrics are based on zero recorded events. Use the lead modal controls to start populating real open and click data.',
    });
  }

  if ((variantSummaries.find((variant) => variant.variant === 'A')?.leads || 0) === 0 || (variantSummaries.find((variant) => variant.variant === 'B')?.leads || 0) === 0) {
    recommendations.push({
      category: 'Experiment health',
      title: 'Backfill both variants before reading performance',
      detail: 'The experiment needs traffic in both Variant A and Variant B to produce a meaningful read. Generate additional drafts so the split normalizes across the current dataset.',
    });
  }

  return recommendations;
};

const buildOverview = (rows) => {
  const totals = summarizeRows(rows);
  const averageLeadScore = round(divide(rows.reduce((sum, row) => sum + Number(row.score || row.leadScore || 0), 0), rows.length), 1);
  const variantSummaries = ['A', 'B'].map((variant) => {
    const variantRows = rows.filter((row) => row.variant === variant);
    const summary = summarizeRows(variantRows);
    return {
      variant,
      leads: summary.leads,
      uniqueOpens: summary.uniqueOpens,
      totalOpens: summary.totalOpens,
      uniqueClicks: summary.uniqueClicks,
      totalClicks: summary.totalClicks,
      openRate: summary.openRate,
      ctr: summary.ctr,
      ctor: summary.ctor,
      costPerLead: summary.costPerLead,
      costPerClick: summary.costPerClick,
      costPerEngagement: summary.costPerEngagement,
      engagementRate: summary.engagementRate,
      totalCost: summary.totalCost,
      replies: 0,
      repliesModeled: true,
      metricSource: 'tracked',
    };
  });
  const dataConfidence = getDataConfidence(variantSummaries);
  const winner = getVariantWinner(variantSummaries);
  const bestScoreRange = rankSegment(rows, (row) => scoreBand(Number(row.score || row.leadScore || 0)), MIN_SEGMENT_SAMPLE_SIZE);
  const bestCity = rankSegment(rows, (row) => row.city, MIN_SEGMENT_SAMPLE_SIZE);
  const enrichmentImpact = getEnrichmentImpact(rows);

  return {
    kpis: {
      totalLeads: totals.leads,
      leadsProcessed: totals.leads,
      enrichedLeads: rows.filter((row) => row.enrichmentLevel !== 'none').length,
      averageLeadScore,
      totalCost: totals.totalCost,
      costPerLead: totals.costPerLead,
      costPerClick: totals.costPerClick,
      costPerEngagement: totals.costPerEngagement,
      overallCtr: totals.ctr,
      openRate: totals.openRate,
      ctor: totals.ctor,
      engagementRate: totals.engagementRate,
      metricSource: 'tracked',
    },
    abPerformance: {
      variants: variantSummaries,
      dataConfidence,
      comparisonRows: [
        { metric: 'Leads', variantA: variantSummaries[0]?.leads || 0, variantB: variantSummaries[1]?.leads || 0, winner: getMetricWinner({ left: variantSummaries[0]?.leads || 0, right: variantSummaries[1]?.leads || 0 }) },
        { metric: 'CTR', variantA: variantSummaries[0]?.ctr || 0, variantB: variantSummaries[1]?.ctr || 0, winner: getMetricWinner({ left: variantSummaries[0]?.ctr || 0, right: variantSummaries[1]?.ctr || 0 }) },
        { metric: 'Open Rate', variantA: variantSummaries[0]?.openRate || 0, variantB: variantSummaries[1]?.openRate || 0, winner: getMetricWinner({ left: variantSummaries[0]?.openRate || 0, right: variantSummaries[1]?.openRate || 0 }) },
        { metric: 'Cost / Click', variantA: variantSummaries[0]?.costPerClick || 0, variantB: variantSummaries[1]?.costPerClick || 0, winner: getMetricWinner({ left: variantSummaries[0]?.costPerClick || 0, right: variantSummaries[1]?.costPerClick || 0, higherIsBetter: false }) },
        { metric: 'Engagement %', variantA: variantSummaries[0]?.engagementRate || 0, variantB: variantSummaries[1]?.engagementRate || 0, winner: getMetricWinner({ left: variantSummaries[0]?.engagementRate || 0, right: variantSummaries[1]?.engagementRate || 0 }) },
      ],
      winner,
      notes: {
        replies: 'Replies are modeled from downstream click and open intensity until direct reply tracking is implemented.',
        benchmark: totals.uniqueOpens === 0 && totals.uniqueClicks === 0 ? 'Headline rates remain at 0 until real opens or clicks are recorded locally.' : '',
      },
    },
    segmentInsights: {
      bestScoreRange: {
        label: bestScoreRange?.label || 'Not enough tracked data yet',
        ctr: bestScoreRange?.ctr || 0,
        leads: bestScoreRange?.leads || 0,
        insight: bestScoreRange ? 'Higher-score shops are producing the strongest response rate in the current campaign mix.' : 'No score-range insight available yet.',
      },
      bestCity: {
        label: bestCity?.label || 'Not enough tracked data yet',
        ctr: bestCity?.ctr || 0,
        leads: bestCity?.leads || 0,
        insight: bestCity ? 'This city cluster is producing the strongest current response rate and should be the next place to expand.' : 'No geographic insight available yet.',
      },
      enrichmentImpact,
    },
    recommendations: buildOverviewRecommendations({ totals, bestCity, enrichmentImpact, dataConfidence, winner, variantSummaries }),
  };
};

const buildSystemPerformance = (rows) => {
  const totals = summarizeRows(rows);
  const googlePlaces = round(rows.reduce((sum, row) => sum + Number(row.costBreakdown?.googlePlaces || 0), 0), 2);
  const gemini = round(rows.reduce((sum, row) => sum + Number(row.costBreakdown?.gemini || 0), 0), 2);
  const scraping = round(rows.reduce((sum, row) => sum + Number(row.costBreakdown?.scraping || 0), 0), 2);
  const grouped = new Map();

  rows.forEach((row) => {
    const band = scoreBand(Number(row.score || row.leadScore || 0));
    if (!grouped.has(band)) {
      grouped.set(band, []);
    }
    grouped.get(band).push(row);
  });

  const costVsLeadScore = [...grouped.entries()].map(([label, items]) => {
    const summary = summarizeRows(items);
    return {
      id: label,
      label,
      score: round(divide(items.reduce((sum, row) => sum + Number(row.score || row.leadScore || 0), 0), items.length), 1),
      cost: round(divide(items.reduce((sum, row) => sum + Number(row.cost || 0), 0), items.length), 2),
      variant: label,
      ctr: summary.ctr,
    };
  });

  const enrichedRows = rows.filter((row) => row.enrichmentLevel !== 'none');
  const remainingRows = rows.filter((row) => row.enrichmentLevel === 'none');
  const enrichedSummary = summarizeRows(enrichedRows);
  const remainingSummary = summarizeRows(remainingRows);

  return {
    coreMetrics: {
      leadsProcessed: rows.length,
      leadsEnriched: enrichedRows.length,
      totalGeminiCalls: {
        value: rows.length,
        estimated: true,
      },
      averageApiCallsPerLead: {
        value: 4,
        estimated: true,
      },
      averageProcessingTimeSeconds: {
        value: 5.8,
        estimated: true,
      },
      costPerClick: totals.costPerClick,
      totalCost: totals.totalCost,
      costSavedViaTiering: round(Math.max(0, rows.length * 0.62 - totals.totalCost), 2),
    },
    pipelineMetrics: {
      leadsProcessed: rows.length,
      leadsEnriched: enrichedRows.length,
      geminiCalls: rows.length,
      apiCallsPerLead: 4,
      averageProcessingTimeSeconds: 5.8,
    },
    visuals: {
      costVsLeadScore,
      enrichmentDistribution: [
        { label: 'Full enrichment', value: rows.filter((row) => row.enrichmentLevel === 'full').length },
        { label: 'Partial', value: rows.filter((row) => row.enrichmentLevel === 'partial').length },
        { label: 'None', value: rows.filter((row) => row.enrichmentLevel === 'none').length },
      ],
      costBreakdown: [
        { label: 'Google Places', value: googlePlaces },
        { label: 'Playwright', value: scraping },
        { label: 'Gemini', value: gemini },
        { label: 'Total', value: totals.totalCost },
      ],
    },
    enrichmentEfficiency: {
      enrichedCtr: enrichedSummary.ctr,
      remainingCtr: remainingSummary.ctr,
      costDelta: round(enrichedSummary.costPerLead - remainingSummary.costPerLead, 2),
    },
    processingStrategy: [
      'Top enriched leads → Full enrichment + Gemini personalization',
      'Remaining leads → Template-based generation with lower-cost processing',
    ],
    notes: clone(demoSeed.systemPerformance.notes),
  };
};

const buildDashboardData = (rows) => ({
  overview: buildOverview(rows),
  leads: {
    rows,
    filters: {
      variants: [...new Set(rows.map((row) => row.variant))].filter(Boolean).sort(),
      cities: [...new Set(rows.map((row) => row.city))].filter(Boolean).sort((left, right) => left.localeCompare(right)),
      enrichmentLevels: ['enriched', 'not_enriched'],
      scoreRange: {
        min: rows.length ? Math.min(...rows.map((row) => Number(row.score || row.leadScore || 0))) : 0,
        max: rows.length ? Math.max(...rows.map((row) => Number(row.score || row.leadScore || 0))) : 100,
      },
    },
  },
  systemPerformance: buildSystemPerformance(rows),
});

const getSeedRows = () => demoSeed.leads.rows.map((row, index) => hydrateLead(row, index));

export const isDemoMode = () => typeof window !== 'undefined' && (
  window.location.hostname.endsWith('github.io')
  || window.location.search.includes('demo=true')
  || import.meta.env.VITE_DEMO_MODE === 'true'
);

export const createInitialDemoState = () => {
  const rows = getSeedRows();
  const dashboardData = buildDashboardData(rows);

  return {
    form: clone(DEFAULT_FORM),
    filters: clone(DEFAULT_FILTERS),
    leads: clone(rows),
    searchMetadata: {
      topEnrichCount: Math.min(20, rows.length),
      source: 'static_demo_seed',
    },
    dashboardData,
    promptSettings: clone(DEMO_PROMPT_SETTINGS),
  };
};

export const loadDemoState = () => {
  const initialState = createInitialDemoState();

  if (typeof window === 'undefined') {
    return initialState;
  }

  try {
    const rawValue = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!rawValue) {
      return initialState;
    }

    const parsed = JSON.parse(rawValue);
    return {
      ...initialState,
      ...parsed,
      dashboardData: parsed.dashboardData || initialState.dashboardData,
      promptSettings: parsed.promptSettings || initialState.promptSettings,
      leads: Array.isArray(parsed.leads) ? parsed.leads : initialState.leads,
      searchMetadata: parsed.searchMetadata || initialState.searchMetadata,
      form: parsed.form || initialState.form,
      filters: parsed.filters || initialState.filters,
    };
  } catch {
    return initialState;
  }
};

export const persistDemoState = (state) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
};

export const resetDemoState = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
  }

  return createInitialDemoState();
};

export const searchDemoLeads = ({ dashboardData, form }) => {
  const cityQuery = String(form?.city || '').trim().toLowerCase();
  const keywordQuery = String(form?.keyword || '').trim().toLowerCase();
  const rows = dashboardData?.leads?.rows || [];
  const filtered = rows.filter((lead) => {
    const cityMatch = !cityQuery || String(lead.city || '').toLowerCase().includes(cityQuery);
    const keywordMatch = !keywordQuery
      || String(lead.name || '').toLowerCase().includes(keywordQuery)
      || String(lead.generatedEmail || '').toLowerCase().includes(keywordQuery)
      || (lead.enrichment?.inferredServices || []).some((service) => String(service || '').toLowerCase().includes(keywordQuery));
    return cityMatch && keywordMatch;
  });

  return {
    leads: clone(filtered),
    searchMetadata: {
      topEnrichCount: Math.min(20, filtered.length),
      source: 'static_demo_seed',
    },
  };
};

export const saveDemoPromptSettings = (promptSettings) => ({
  promptSettings: clone(promptSettings),
  status: 'Saved demo prompt settings locally in this browser.',
});

export const enrichDemoLead = ({ dashboardData, leads, leadId }) => {
  const rows = (dashboardData?.leads?.rows || []).map((lead) => lead.id === leadId ? { ...lead, enrichmentStatus: 'enriched' } : lead);
  const nextDashboardData = buildDashboardData(rows);
  const nextLeads = leads.map((lead) => rows.find((item) => item.id === lead.id) || lead);
  const nextLead = rows.find((lead) => lead.id === leadId) || null;

  return {
    dashboardData: nextDashboardData,
    leads: nextLeads,
    lead: nextLead,
  };
};

export const generateDemoEmailForLead = ({ dashboardData, leads, leadId }) => {
  const rows = (dashboardData?.leads?.rows || []).map((lead) => lead.id === leadId ? { ...lead, generatedEmail: lead.generatedEmail || buildGeneratedEmail(lead), generatedEmailHtml: lead.generatedEmailHtml || buildGeneratedEmailHtml(lead) } : lead);
  const nextDashboardData = buildDashboardData(rows);
  const nextLeads = leads.map((lead) => rows.find((item) => item.id === lead.id) || lead);
  const nextLead = rows.find((lead) => lead.id === leadId) || null;

  return {
    dashboardData: nextDashboardData,
    leads: nextLeads,
    lead: nextLead,
  };
};

export const generateDemoEmails = ({ dashboardData, leads }) => {
  const rows = (dashboardData?.leads?.rows || []).map((lead) => ({
    ...lead,
    generatedEmail: lead.generatedEmail || buildGeneratedEmail(lead),
    generatedEmailHtml: lead.generatedEmailHtml || buildGeneratedEmailHtml(lead),
  }));
  const nextDashboardData = buildDashboardData(rows);
  const nextLeads = leads.map((lead) => rows.find((item) => item.id === lead.id) || lead);

  return {
    dashboardData: nextDashboardData,
    leads: nextLeads,
  };
};

export const recordDemoLeadEvent = ({ dashboardData, leads, leadId, eventType }) => {
  const timestamp = new Date().toISOString();
  const rows = (dashboardData?.leads?.rows || []).map((lead) => {
    if (lead.id !== leadId) {
      return lead;
    }

    const events = Array.isArray(lead.events) ? [...lead.events] : [];
    const hasOpen = events.some((event) => event.type === 'open');
    let nextEvents = events;

    if (eventType === 'click' && !hasOpen) {
      nextEvents = [{ type: 'open', timestamp }, ...nextEvents];
    }

    nextEvents = [{ type: eventType, timestamp }, ...nextEvents];
    const opens = nextEvents.filter((event) => event.type === 'open').length;
    const clicks = nextEvents.filter((event) => event.type === 'click').length;

    return {
      ...lead,
      events: nextEvents,
      opens,
      clicks,
      uniqueOpens: opens > 0 ? 1 : 0,
      uniqueClicks: clicks > 0 ? 1 : 0,
      status: clicks > 0 ? 'clicked' : opens > 0 ? 'opened' : 'drafted',
      lastActivityAt: timestamp,
    };
  });

  const nextDashboardData = buildDashboardData(rows);
  const nextLeads = leads.map((lead) => rows.find((item) => item.id === lead.id) || lead);
  const nextLead = rows.find((lead) => lead.id === leadId) || null;

  return {
    dashboardData: nextDashboardData,
    leads: nextLeads,
    lead: nextLead,
  };
};
