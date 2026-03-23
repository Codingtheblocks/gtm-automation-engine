import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.js';
import { getScoreTier } from './leadScoringService.js';
import { normalizePlaceGeography } from './googlePlacesService.js';
import { getDeterministicVariantLabel, normalizeOfferExperimentVariant } from './geminiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.resolve(__dirname, '..', '..', 'data');
const databasePath = path.join(dataDirectory, 'tracking.sqlite');
const trackingPixelBuffer = Buffer.from([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59]);
const MIN_DIRECTIONAL_SAMPLE_PER_VARIANT = 30;
const MIN_HIGH_CONFIDENCE_SAMPLE_PER_VARIANT = 60;
const MIN_SEGMENT_SAMPLE_SIZE = 3;
const MIN_ENRICHMENT_COMPARISON_SIZE = 8;

let database;

const getDatabase = () => {
  if (!database) {
    throw new Error('Tracking database has not been initialized');
  }

  return database;
};

const ensureTableColumn = (tableName, columnName, definition) => {
  const db = getDatabase();
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

const createShortToken = () => crypto.randomBytes(9).toString('base64url');

const looksLikeStreetAddress = (value = '') => /(^\d+\b)|\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|cir|circle|trl|trail|way|pkwy|parkway|pl|place|ter|terrace|hwy|highway|suite|ste|unit)\b/i.test(String(value || '').trim());

const normalizeLeadCity = (lead = {}) => {
  const rawCity = String(lead.city || '').trim();
  const fallbackAddress = lead.address || rawCity || '';

  return normalizePlaceGeography({
    place: {
      city: rawCity && !looksLikeStreetAddress(rawCity) && !rawCity.includes(',') ? rawCity : '',
      state: lead.state,
      geography: lead.geography,
      address: lead.address,
      formatted_address: lead.address,
      address_components: lead.addressComponents,
    },
    fallbackAddress,
  }).cityState;
};

const normalizeTrackedVariant = (variant = '', lead = {}) => (
  normalizeOfferExperimentVariant(variant)
  || getDeterministicVariantLabel({
    leadId: lead.id,
    businessName: lead.name,
    location: lead.address,
    city: lead.city,
  })
);

const getGenerationModeBucket = (generationMode = '') => {
  if (generationMode === 'prompt_gemini') {
    return 'full_enrichment';
  }

  if (generationMode === 'generic_template') {
    return 'template';
  }

  return 'partial';
};

const toIsoString = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMetric = (value, digits = 1) => Number(toNumber(value, 0).toFixed(digits));

const divide = (numerator, denominator) => {
  if (!denominator) {
    return 0;
  }

  return numerator / denominator;
};

const toPercent = (numerator, denominator) => roundMetric(divide(numerator, denominator) * 100, 1);

const getScoreBand = (score) => {
  if (score >= 75) {
    return '75-100';
  }

  if (score >= 45) {
    return '45-74';
  }

  return '0-44';
};

const getRatingBand = (rating) => {
  if (rating >= 4.5) {
    return '4.5+';
  }

  if (rating >= 4) {
    return '4.0-4.4';
  }

  if (rating > 0) {
    return '<4.0';
  }

  return 'Unknown';
};

const getDistanceBand = (distanceMiles) => {
  if (distanceMiles <= 10) {
    return 'Within 10 miles';
  }

  if (distanceMiles <= 25) {
    return '10-25 miles';
  }

  if (distanceMiles > 25) {
    return '25+ miles';
  }

  return 'Unknown';
};

const getEnrichmentBucket = (lead) => {
  if (lead.enrichmentStatus === 'enriched' && lead.generationMode === 'full_enrichment') {
    return 'full';
  }

  if (lead.enrichmentStatus === 'enriched' || lead.generationMode === 'template') {
    return 'partial';
  }

  return 'none';
};

const getLeadStatus = (lead) => {
  if (lead.uniqueClicks > 0) {
    return 'clicked';
  }

  if (lead.uniqueOpens > 0) {
    return 'opened';
  }

  return 'drafted';
};

const getApiCallsEstimate = (lead) => {
  if (lead.generationMode === 'full_enrichment') {
    return 4;
  }

  if (lead.generationMode === 'template') {
    return 3;
  }

  return 1;
};

const getProcessingTimeEstimateSeconds = (lead) => {
  if (lead.generationMode === 'full_enrichment') {
    return 5.8;
  }

  if (lead.generationMode === 'template') {
    return 3.4;
  }

  return 1.1;
};

const getModeledReplies = ({ draftedLeads, uniqueClicks, uniqueOpens }) => {
  if (!draftedLeads) {
    return 0;
  }

  return Math.min(uniqueClicks, Math.max(0, Math.round(uniqueClicks * 0.22 + uniqueOpens * 0.06)));
};

const getCostBreakdownWeights = (generationMode) => {
  if (generationMode === 'full_enrichment') {
    return {
      googlePlaces: 0.14,
      gemini: 0.58,
      scraping: 0.28,
    };
  }

  if (generationMode === 'template') {
    return {
      googlePlaces: 0.28,
      gemini: 0.08,
      scraping: 0.64,
    };
  }

  return {
    googlePlaces: 0.75,
    gemini: 0,
    scraping: 0.25,
  };
};

const getCostBreakdown = (lead) => {
  const weights = getCostBreakdownWeights(lead.generationMode);
  const totalCost = toNumber(lead.estimatedCost, 0);

  return {
    googlePlaces: roundMetric(totalCost * weights.googlePlaces, 3),
    gemini: roundMetric(totalCost * weights.gemini, 3),
    scraping: roundMetric(totalCost * weights.scraping, 3),
  };
};

const createEmptyAggregate = (label) => ({
  label,
  leads: 0,
  uniqueOpens: 0,
  totalOpens: 0,
  uniqueClicks: 0,
  totalClicks: 0,
  totalCost: 0,
});

const summarizeRows = (rows) => {
  const aggregate = rows.reduce((result, lead) => {
    result.leads += 1;
    result.uniqueOpens += lead.uniqueOpens;
    result.totalOpens += lead.totalOpens;
    result.uniqueClicks += lead.uniqueClicks;
    result.totalClicks += lead.totalClicks;
    result.totalCost += lead.estimatedCost;
    return result;
  }, createEmptyAggregate('summary'));
  const engagedLeads = rows.filter((lead) => lead.uniqueOpens > 0 || lead.uniqueClicks > 0).length;
  const totalEngagements = aggregate.totalOpens + aggregate.totalClicks;

  const modeledReplies = getModeledReplies({
    draftedLeads: aggregate.leads,
    uniqueClicks: aggregate.uniqueClicks,
    uniqueOpens: aggregate.uniqueOpens,
  });

  return {
    ...aggregate,
    totalCost: roundMetric(aggregate.totalCost, 2),
    costPerLead: roundMetric(divide(aggregate.totalCost, aggregate.leads), 2),
    openRate: toPercent(aggregate.uniqueOpens, aggregate.leads),
    ctr: toPercent(aggregate.uniqueClicks, aggregate.leads),
    ctor: toPercent(aggregate.uniqueClicks, aggregate.uniqueOpens),
    costPerClick: roundMetric(divide(aggregate.totalCost, aggregate.uniqueClicks), 2),
    costPerEngagement: roundMetric(divide(aggregate.totalCost, totalEngagements), 2),
    engagementRate: toPercent(engagedLeads, aggregate.leads),
    engagedLeads,
    totalEngagements,
    modeledReplies,
    modeledReplyRate: toPercent(modeledReplies, aggregate.leads),
  };
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildBenchmarkSummary = (rows, baseSummary, variant = '') => {
  const averageScore = divide(rows.reduce((sum, row) => sum + toNumber(row.score, 0), 0), rows.length);
  const enrichedShare = divide(rows.filter((row) => row.enrichmentLevel !== 'none').length, rows.length);
  const targetOpenRate = clamp(roundMetric(27 + averageScore * 0.16 + enrichedShare * 5, 1), 25, 50);
  const targetCtor = clamp(roundMetric(11 + averageScore * 0.08 + enrichedShare * 4 + (variant === 'A' ? 1.8 : 0.6), 1), 10, 25);
  const targetCtr = clamp(roundMetric((targetOpenRate * targetCtor) / 100, 1), 2, 8);
  const uniqueOpens = Math.min(baseSummary.leads, Math.max(0, Math.round(baseSummary.leads * (targetOpenRate / 100))));
  const uniqueClicks = Math.min(uniqueOpens, Math.max(0, Math.round(baseSummary.leads * (targetCtr / 100))));
  const engagedLeads = Math.max(uniqueOpens, uniqueClicks);
  const totalEngagements = uniqueOpens + uniqueClicks;
  const modeledReplies = getModeledReplies({
    draftedLeads: baseSummary.leads,
    uniqueClicks,
    uniqueOpens,
  });

  return {
    ...baseSummary,
    uniqueOpens,
    totalOpens: uniqueOpens,
    uniqueClicks,
    totalClicks: uniqueClicks,
    openRate: targetOpenRate,
    ctr: targetCtr,
    ctor: uniqueOpens ? roundMetric((uniqueClicks / uniqueOpens) * 100, 1) : 0,
    costPerClick: roundMetric(divide(baseSummary.totalCost, uniqueClicks), 2),
    costPerEngagement: roundMetric(divide(baseSummary.totalCost, totalEngagements), 2),
    engagementRate: toPercent(engagedLeads, baseSummary.leads),
    engagedLeads,
    totalEngagements,
    modeledReplies,
    modeledReplyRate: toPercent(modeledReplies, baseSummary.leads),
    metricSource: 'benchmark',
  };
};

const getPresentationSummary = (rows, variant = '') => {
  const baseSummary = summarizeRows(rows);

  if (!baseSummary.leads) {
    return {
      ...baseSummary,
      metricSource: 'none',
    };
  }

  if (baseSummary.uniqueOpens > 0 || baseSummary.uniqueClicks > 0) {
    return {
      ...baseSummary,
      metricSource: 'tracked',
    };
  }

  return buildBenchmarkSummary(rows, baseSummary, variant);
};

const getBenchmarkSummary = (rows, label) => {
  const summary = summarizeRows(rows);
  const metricSource = 'benchmark';

  return {
    ...summary,
    label,
    metricSource,
  };
};

const rankSegment = (rows, getLabel, minimumSampleSize = 1) => {
  const segmentMap = new Map();

  rows.forEach((lead) => {
    const label = getLabel(lead);

    if (!segmentMap.has(label)) {
      segmentMap.set(label, []);
    }

    segmentMap.get(label).push(lead);
  });

  const ranked = [...segmentMap.entries()]
    .map(([label, segmentRows]) => {
      const summary = getPresentationSummary(segmentRows, label);
      const weightedPerformance = summary.ctr * 0.7 + summary.openRate * 0.3;

      return {
        label,
        leads: summary.leads,
        openRate: summary.openRate,
        ctr: summary.ctr,
        weightedPerformance: roundMetric(weightedPerformance, 1),
      };
    })
    .filter((segment) => segment.leads >= minimumSampleSize)
    .sort((left, right) => {
      if (right.weightedPerformance !== left.weightedPerformance) {
        return right.weightedPerformance - left.weightedPerformance;
      }

      if (right.ctr !== left.ctr) {
        return right.ctr - left.ctr;
      }

      return right.leads - left.leads;
    });

  return ranked[0] || null;
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

const getVariantWinner = (variantSummaries) => {
  const variantA = variantSummaries.find((variant) => variant.variant === 'A');
  const variantB = variantSummaries.find((variant) => variant.variant === 'B');
  const hasTrackedEvents = variantSummaries.some((variant) => variant.metricSource === 'tracked' && (variant.uniqueOpens > 0 || variant.uniqueClicks > 0));

  if (!variantA || !variantB || (!variantA.leads && !variantB.leads) || !hasTrackedEvents) {
    return null;
  }

  const scoreA = variantA.ctr * 0.5 + variantA.openRate * 0.2 + variantA.engagementRate * 0.2 - variantA.costPerClick * 10;
  const scoreB = variantB.ctr * 0.5 + variantB.openRate * 0.2 + variantB.engagementRate * 0.2 - variantB.costPerClick * 10;
  const winner = scoreA === scoreB ? (variantA.ctr >= variantB.ctr ? variantA : variantB) : (scoreA > scoreB ? variantA : variantB);
  const loser = winner.variant === 'A' ? variantB : variantA;
  const ctrLiftPercent = loser.ctr > 0 ? roundMetric(((winner.ctr - loser.ctr) / loser.ctr) * 100, 0) : roundMetric(winner.ctr - loser.ctr, 1);
  const costPerClickReductionPercent = loser.costPerClick > 0 ? roundMetric(((loser.costPerClick - winner.costPerClick) / loser.costPerClick) * 100, 0) : 0;

  return {
    variant: winner.variant,
    label: winner.variant === 'A' ? 'Flexible Billing' : 'Fast Delivery',
    ctrLiftPercent,
    costPerClickReductionPercent,
  };
};

const getDataConfidence = (variantSummaries) => {
  const leadsPerVariant = variantSummaries.map((variant) => variant.leads);
  const minimumLeadCount = leadsPerVariant.length ? Math.min(...leadsPerVariant) : 0;
  const totalEventVolume = variantSummaries.reduce(
    (sum, variant) => sum + (variant.metricSource === 'tracked' ? variant.uniqueOpens + variant.uniqueClicks : 0),
    0,
  );

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

const getEnrichmentImpact = ({ enrichedRows, nonEnrichedRows }) => {
  const enrichedSummary = getPresentationSummary(enrichedRows, 'enriched');
  const nonEnrichedSummary = getPresentationSummary(nonEnrichedRows, 'non_enriched');
  const hasEnoughData = enrichedSummary.leads >= MIN_ENRICHMENT_COMPARISON_SIZE && nonEnrichedSummary.leads >= MIN_ENRICHMENT_COMPARISON_SIZE;

  if (!hasEnoughData) {
    return {
      hasEnoughData: false,
      enrichedLeadCount: enrichedSummary.leads,
      nonEnrichedLeadCount: nonEnrichedSummary.leads,
      message: 'Not enough enriched leads yet to measure performance',
      insight: 'Route more tracked drafts through enrichment before comparing CTR lift.',
    };
  }

  const uplift = roundMetric(enrichedSummary.ctr - nonEnrichedSummary.ctr, 1);

  return {
    hasEnoughData: true,
    enrichedLeadCount: enrichedSummary.leads,
    nonEnrichedLeadCount: nonEnrichedSummary.leads,
    enrichedCtr: enrichedSummary.ctr,
    nonEnrichedCtr: nonEnrichedSummary.ctr,
    uplift,
    message: uplift > 0
      ? `Enrichment is lifting CTR by ${uplift} percentage points.`
      : uplift < 0
        ? `Enrichment is trailing by ${Math.abs(uplift)} percentage points, but keep validating with more volume.`
        : 'Enrichment is currently performing in line with non-enriched leads.',
    insight: uplift > 0
      ? 'Prioritize enrichment on the next batch of high-intent shops to confirm the lift holds.'
      : 'Keep enrichment focused on the highest-value leads until the comparison stabilizes.',
  };
};

const buildOverviewRecommendations = ({ winner, bestCity, enrichmentImpact, dataConfidence, totals, variantSummaries }) => {
  const recommendations = [];
  const variantA = variantSummaries.find((variant) => variant.variant === 'A');
  const variantB = variantSummaries.find((variant) => variant.variant === 'B');

  recommendations.push({
    category: 'Variant optimization',
    title: winner?.variant
      ? `${dataConfidence.level === 'High' ? 'Increase allocation' : 'Keep testing'} toward Variant ${winner.variant}`
      : 'Keep the A/B split balanced',
    detail: winner?.variant
      ? dataConfidence.level === 'High'
        ? `Variant ${winner.variant} is leading on CTR and efficiency. Start shifting more volume while monitoring reply quality.`
        : `Variant ${winner.variant} is directionally ahead, but confidence is ${dataConfidence.level.toLowerCase()}. Hold the 50/50 split until each variant has deeper event volume.`
      : 'Neither variant has separated yet. Keep traffic balanced and collect more opens and clicks before changing allocation.',
  });

  recommendations.push({
    category: 'Geographic expansion',
    title: bestCity?.label && bestCity?.label !== 'Unknown'
      ? `Expand targeting in ${bestCity.label}`
      : 'Wait for stronger city-level signal',
    detail: bestCity?.label && bestCity?.leads >= MIN_SEGMENT_SAMPLE_SIZE
      ? `${bestCity.label} is the strongest live cluster right now. Add adjacent city searches and keep the winning offer consistent there.`
      : 'City-level performance is still sparse. Generate more tracked drafts before broadening the geo strategy.',
  });

  recommendations.push({
    category: 'Enrichment strategy',
    title: enrichmentImpact.hasEnoughData && enrichmentImpact.uplift > 0
      ? 'Expand enrichment to the next highest-value cohort'
      : 'Use enrichment selectively while data matures',
    detail: enrichmentImpact.hasEnoughData
      ? enrichmentImpact.uplift > 0
        ? 'Enable enrichment for the next 20 highest-scoring leads to validate whether the CTR lift scales beyond the initial cohort.'
        : 'Keep enrichment focused on top-priority leads until the performance gap resolves with more tracked volume.'
      : enrichmentImpact.message,
  });

  if (totals.metricSource === 'benchmark') {
    recommendations.push({
      category: 'Measurement quality',
      title: 'Replace benchmark metrics with live events',
      detail: 'Current headline rates are benchmark-backed because no real opens or clicks have been captured yet. Use the lead modal controls or live tracked links to ground the dashboard in real event data.',
    });
  }

  if ((variantA?.leads || 0) === 0 || (variantB?.leads || 0) === 0) {
    recommendations.push({
      category: 'Experiment health',
      title: 'Backfill both variants before reading performance',
      detail: 'The experiment needs traffic in both Variant A and Variant B to produce a meaningful read. Generate additional drafts so the split normalizes across the current dataset.',
    });
  }

  return recommendations;
};

const getLeadEventMap = (leadIds) => {
  const normalizedLeadIds = [...new Set((leadIds || []).filter(Boolean))];

  if (!normalizedLeadIds.length) {
    return new Map();
  }

  const db = getDatabase();
  const placeholders = normalizedLeadIds.map(() => '?').join(', ');
  const events = db.prepare(`
    SELECT lead_id, event_type, timestamp
    FROM events
    WHERE lead_id IN (${placeholders})
    ORDER BY timestamp DESC
  `).all(...normalizedLeadIds);

  return events.reduce((eventMap, event) => {
    if (!eventMap.has(event.lead_id)) {
      eventMap.set(event.lead_id, []);
    }

    const items = eventMap.get(event.lead_id);

    if (items.length < 5) {
      items.push({
        type: event.event_type,
        timestamp: event.timestamp,
      });
    }

    return eventMap;
  }, new Map());
};

const getTrackedLeadFacts = () => {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      l.id,
      l.name,
      l.city,
      l.score,
      l.variant,
      l.generation_mode,
      l.estimated_cost,
      l.updated_at,
      l.rating,
      l.review_count,
      l.distance_miles,
      l.enrichment_status,
      l.has_website,
      l.outreach_tone,
      e.email_text,
      e.created_at AS drafted_at,
      MAX(ev.timestamp) AS last_activity_at,
      COALESCE(SUM(CASE WHEN ev.event_type = 'open' THEN 1 ELSE 0 END), 0) AS total_opens,
      COALESCE(SUM(CASE WHEN ev.event_type = 'click' THEN 1 ELSE 0 END), 0) AS total_clicks,
      MAX(CASE WHEN ev.event_type = 'open' THEN 1 ELSE 0 END) AS unique_open,
      MAX(CASE WHEN ev.event_type = 'click' THEN 1 ELSE 0 END) AS unique_click
    FROM leads l
    LEFT JOIN emails e ON e.lead_id = l.id
    LEFT JOIN events ev ON ev.email_id = e.id
    GROUP BY
      l.id,
      l.name,
      l.city,
      l.score,
      l.variant,
      l.generation_mode,
      l.estimated_cost,
      l.updated_at,
      l.rating,
      l.review_count,
      l.distance_miles,
      l.enrichment_status,
      l.has_website,
      l.outreach_tone,
      e.email_text,
      e.created_at
    ORDER BY l.updated_at DESC, l.score DESC
  `).all();

  return rows.map((row) => {
    const normalizedLead = {
      id: row.id,
      name: row.name || '',
      city: row.city || 'Unknown',
      score: roundMetric(row.score, 1),
      variant: normalizeTrackedVariant(row.variant, {
        id: row.id,
        name: row.name,
        city: row.city,
      }),
      generationMode: row.generation_mode || 'partial',
      estimatedCost: roundMetric(row.estimated_cost, 2),
      updatedAt: row.updated_at || '',
      draftedAt: row.drafted_at || '',
      lastActivityAt: row.last_activity_at || row.drafted_at || row.updated_at || '',
      rating: roundMetric(row.rating, 1),
      reviewCount: Math.max(0, Math.round(toNumber(row.review_count, 0))),
      distanceMiles: row.distance_miles === null || row.distance_miles === undefined ? null : roundMetric(row.distance_miles, 1),
      enrichmentStatus: row.enrichment_status || 'unknown',
      hasWebsite: Boolean(row.has_website),
      outreachTone: row.outreach_tone || '',
      emailPreview: String(row.email_text || '').split('\n').find(Boolean) || '',
      totalOpens: Math.max(0, Math.round(toNumber(row.total_opens, 0))),
      totalClicks: Math.max(0, Math.round(toNumber(row.total_clicks, 0))),
      uniqueOpens: Math.max(0, Math.round(toNumber(row.unique_open, 0))),
      uniqueClicks: Math.max(0, Math.round(toNumber(row.unique_click, 0))),
    };

    const enrichmentLevel = getEnrichmentBucket(normalizedLead);

    return {
      ...normalizedLead,
      tier: getScoreTier(normalizedLead.score),
      scoreBand: getScoreBand(normalizedLead.score),
      ratingBand: getRatingBand(normalizedLead.rating),
      distanceBand: getDistanceBand(normalizedLead.distanceMiles),
      enrichmentLevel,
      status: getLeadStatus(normalizedLead),
      costBreakdown: getCostBreakdown(normalizedLead),
      apiCallsEstimate: getApiCallsEstimate(normalizedLead),
      processingTimeEstimateSeconds: getProcessingTimeEstimateSeconds(normalizedLead),
      city: normalizeLeadCity({ city: row.city }),
    };
  });
};

export const getDashboardOverview = () => {
  const rows = getTrackedLeadFacts();
  const totals = getPresentationSummary(rows, 'all');
  const averageLeadScore = roundMetric(divide(rows.reduce((sum, row) => sum + row.score, 0), rows.length), 1);
  const enrichedLeads = rows.filter((row) => row.enrichmentLevel !== 'none').length;
  const variantSummaries = ['A', 'B'].map((variant) => {
    const variantRows = rows.filter((row) => row.variant === variant);
    const summary = getPresentationSummary(variantRows, variant);

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
      replies: summary.modeledReplies,
      repliesModeled: true,
      metricSource: summary.metricSource,
    };
  });
  const bestPerformingCity = rankSegment(rows.filter((row) => row.city && row.city !== 'Unknown'), (row) => row.city, MIN_SEGMENT_SAMPLE_SIZE);
  const bestPerformingScoreRange = rankSegment(rows, (row) => row.scoreBand, MIN_SEGMENT_SAMPLE_SIZE);
  const enrichedRows = rows.filter((row) => row.enrichmentLevel !== 'none');
  const nonEnrichedRows = rows.filter((row) => row.enrichmentLevel === 'none');
  const dataConfidence = getDataConfidence(variantSummaries);
  const winner = getVariantWinner(variantSummaries);
  const enrichmentImpact = getEnrichmentImpact({ enrichedRows, nonEnrichedRows });
  const recommendations = buildOverviewRecommendations({
    winner,
    bestCity: bestPerformingCity,
    enrichmentImpact,
    dataConfidence,
    totals,
    variantSummaries,
  });

  return {
    kpis: {
      totalLeads: totals.leads,
      leadsProcessed: totals.leads,
      enrichedLeads,
      averageLeadScore,
      totalCost: totals.totalCost,
      costPerLead: totals.costPerLead,
      costPerClick: totals.costPerClick,
      costPerEngagement: totals.costPerEngagement,
      overallCtr: totals.ctr,
      openRate: totals.openRate,
      ctor: totals.ctor,
      engagementRate: totals.engagementRate,
      metricSource: totals.metricSource,
    },
    abPerformance: {
      variants: variantSummaries,
      dataConfidence,
      comparisonRows: [
        {
          metric: 'Leads',
          variantA: variantSummaries.find((variant) => variant.variant === 'A')?.leads || 0,
          variantB: variantSummaries.find((variant) => variant.variant === 'B')?.leads || 0,
          winner: getMetricWinner({
            left: variantSummaries.find((variant) => variant.variant === 'A')?.leads || 0,
            right: variantSummaries.find((variant) => variant.variant === 'B')?.leads || 0,
          }),
        },
        {
          metric: 'CTR',
          variantA: variantSummaries.find((variant) => variant.variant === 'A')?.ctr || 0,
          variantB: variantSummaries.find((variant) => variant.variant === 'B')?.ctr || 0,
          winner: getMetricWinner({
            left: variantSummaries.find((variant) => variant.variant === 'A')?.ctr || 0,
            right: variantSummaries.find((variant) => variant.variant === 'B')?.ctr || 0,
          }),
        },
        {
          metric: 'Open Rate',
          variantA: variantSummaries.find((variant) => variant.variant === 'A')?.openRate || 0,
          variantB: variantSummaries.find((variant) => variant.variant === 'B')?.openRate || 0,
          winner: getMetricWinner({
            left: variantSummaries.find((variant) => variant.variant === 'A')?.openRate || 0,
            right: variantSummaries.find((variant) => variant.variant === 'B')?.openRate || 0,
          }),
        },
        {
          metric: 'Cost / Click',
          variantA: variantSummaries.find((variant) => variant.variant === 'A')?.costPerClick || 0,
          variantB: variantSummaries.find((variant) => variant.variant === 'B')?.costPerClick || 0,
          winner: getMetricWinner({
            left: variantSummaries.find((variant) => variant.variant === 'A')?.costPerClick || 0,
            right: variantSummaries.find((variant) => variant.variant === 'B')?.costPerClick || 0,
            higherIsBetter: false,
          }),
        },
        {
          metric: 'Engagement %',
          variantA: variantSummaries.find((variant) => variant.variant === 'A')?.engagementRate || 0,
          variantB: variantSummaries.find((variant) => variant.variant === 'B')?.engagementRate || 0,
          winner: getMetricWinner({
            left: variantSummaries.find((variant) => variant.variant === 'A')?.engagementRate || 0,
            right: variantSummaries.find((variant) => variant.variant === 'B')?.engagementRate || 0,
          }),
        },
      ],
      winner,
      notes: {
        replies: 'Replies are modeled from downstream click and open intensity until direct reply tracking is implemented.',
        benchmark: totals.metricSource === 'benchmark'
          ? 'Headline rates are using benchmark ranges until real opens or clicks are recorded locally.'
          : '',
      },
    },
    segmentInsights: {
      bestScoreRange: {
        label: bestPerformingScoreRange?.label || 'Not enough tracked data yet',
        ctr: bestPerformingScoreRange?.ctr || 0,
        leads: bestPerformingScoreRange?.leads || 0,
        insight: bestPerformingScoreRange
          ? 'Higher-score shops are producing the strongest response rate in the current campaign mix.'
          : 'No score-range insight available yet.',
      },
      bestCity: {
        label: bestPerformingCity?.label || 'Not enough tracked data yet',
        ctr: bestPerformingCity?.ctr || 0,
        leads: bestPerformingCity?.leads || 0,
        insight: bestPerformingCity
          ? 'This city cluster is producing the strongest current response rate and should be the next place to expand.'
          : 'No geographic insight available yet.',
      },
      enrichmentImpact,
    },
    recommendations,
  };
};

export const getDashboardLeads = () => {
  const rows = getTrackedLeadFacts();
  const eventMap = getLeadEventMap(rows.map((row) => row.id));

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      score: row.score,
      variant: row.variant,
      tier: row.tier,
      status: row.status,
      opens: row.totalOpens,
      clicks: row.totalClicks,
      uniqueOpens: row.uniqueOpens,
      uniqueClicks: row.uniqueClicks,
      cost: row.estimatedCost,
      enriched: row.enrichmentLevel !== 'none',
      enrichmentLevel: row.enrichmentLevel,
      tone: row.outreachTone,
      emailPreview: row.emailPreview,
      generationMode: row.generationMode,
      rating: row.rating,
      reviewCount: row.reviewCount,
      distanceMiles: row.distanceMiles,
      hasWebsite: row.hasWebsite,
      updatedAt: row.updatedAt,
      draftedAt: row.draftedAt,
      lastActivityAt: row.lastActivityAt,
      events: eventMap.get(row.id) || [],
    })),
    filters: {
      variants: [...new Set(rows.map((row) => row.variant))].filter(Boolean).sort(),
      cities: [...new Set(rows.map((row) => row.city))].filter(Boolean).sort((left, right) => left.localeCompare(right)),
      enrichmentLevels: ['enriched', 'not_enriched'],
      scoreRange: {
        min: rows.length ? Math.min(...rows.map((row) => row.score)) : 0,
        max: rows.length ? Math.max(...rows.map((row) => row.score)) : 100,
      },
    },
  };
};

export const getSystemPerformance = () => {
  const rows = getTrackedLeadFacts();
  const totals = summarizeRows(rows);
  const costBreakdown = rows.reduce((aggregate, row) => {
    aggregate.googlePlaces += row.costBreakdown.googlePlaces;
    aggregate.gemini += row.costBreakdown.gemini;
    aggregate.scraping += row.costBreakdown.scraping;
    return aggregate;
  }, {
    googlePlaces: 0,
    gemini: 0,
    scraping: 0,
  });
  const enrichmentDistribution = rows.reduce((distribution, row) => {
    distribution[row.enrichmentLevel] += 1;
    return distribution;
  }, {
    full: 0,
    partial: 0,
    none: 0,
  });
  const leadsEnriched = rows.filter((row) => row.enrichmentLevel !== 'none').length;
  const estimatedGeminiCalls = rows.filter((row) => row.generationMode === 'full_enrichment').length + new Set(rows.filter((row) => row.generationMode === 'template').map((row) => row.variant)).size;
  const totalApiCalls = rows.reduce((sum, row) => sum + row.apiCallsEstimate, 0);
  const averageProcessingTime = roundMetric(divide(rows.reduce((sum, row) => sum + row.processingTimeEstimateSeconds, 0), rows.length), 1);
  const fullPersonalizationBaseline = rows.length * 0.62;
  const enrichedRows = rows.filter((row) => row.enrichmentLevel !== 'none');
  const remainingRows = rows.filter((row) => row.enrichmentLevel === 'none');
  const enrichedSummary = summarizeRows(enrichedRows);
  const remainingSummary = summarizeRows(remainingRows);
  const scoreBandMap = new Map();

  rows.forEach((row) => {
    if (!scoreBandMap.has(row.scoreBand)) {
      scoreBandMap.set(row.scoreBand, []);
    }

    scoreBandMap.get(row.scoreBand).push(row);
  });

  return {
    coreMetrics: {
      leadsProcessed: rows.length,
      leadsEnriched,
      totalGeminiCalls: {
        value: estimatedGeminiCalls,
        estimated: true,
      },
      averageApiCallsPerLead: {
        value: roundMetric(divide(totalApiCalls, rows.length), 1),
        estimated: true,
      },
      averageProcessingTimeSeconds: {
        value: averageProcessingTime,
        estimated: true,
      },
      costPerClick: totals.costPerClick,
      totalCost: totals.totalCost,
      costSavedViaTiering: roundMetric(Math.max(0, fullPersonalizationBaseline - totals.totalCost), 2),
    },
    pipelineMetrics: {
      leadsProcessed: rows.length,
      leadsEnriched,
      geminiCalls: estimatedGeminiCalls,
      apiCallsPerLead: roundMetric(divide(totalApiCalls, rows.length), 1),
      averageProcessingTimeSeconds: averageProcessingTime,
    },
    visuals: {
      costVsLeadScore: [...scoreBandMap.entries()].map(([label, scoreRows]) => {
        const summary = summarizeRows(scoreRows);

        return {
          id: label,
          label,
          score: roundMetric(divide(scoreRows.reduce((sum, row) => sum + row.score, 0), scoreRows.length), 1),
          cost: roundMetric(divide(scoreRows.reduce((sum, row) => sum + row.estimatedCost, 0), scoreRows.length), 2),
          variant: label,
          ctr: summary.ctr,
        };
      }),
      enrichmentDistribution: [
        { label: 'Full enrichment', value: enrichmentDistribution.full },
        { label: 'Partial', value: enrichmentDistribution.partial },
        { label: 'None', value: enrichmentDistribution.none },
      ],
      costBreakdown: [
        { label: 'Google Places', value: roundMetric(costBreakdown.googlePlaces, 2) },
        { label: 'Playwright', value: roundMetric(costBreakdown.scraping, 2) },
        { label: 'Gemini', value: roundMetric(costBreakdown.gemini, 2) },
        { label: 'Total', value: roundMetric(costBreakdown.googlePlaces + costBreakdown.scraping + costBreakdown.gemini, 2) },
      ],
    },
    enrichmentEfficiency: {
      enrichedCtr: enrichedSummary.ctr,
      remainingCtr: remainingSummary.ctr,
      costDelta: roundMetric(enrichedSummary.costPerLead - remainingSummary.costPerLead, 2),
    },
    processingStrategy: [
      'Top enriched leads → Full enrichment + Gemini personalization',
      'Remaining leads → Template-based generation with lower-cost processing',
    ],
    notes: [
      'Gemini call counts are estimated from personalized drafts plus one reusable template-generation pass per low-score variant.',
      'Processing time and API call counts are centralized approximations derived from each lead path until provider-level telemetry is persisted.',
    ],
  };
};

export const initializeTrackingDatabase = async () => {
  await mkdir(dataDirectory, { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT,
      city TEXT,
      score INTEGER,
      variant TEXT,
      generation_mode TEXT,
      estimated_cost REAL DEFAULT 0,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      tracking_token TEXT NOT NULL UNIQUE,
      open_tracking_token TEXT NOT NULL UNIQUE,
      tracking_url TEXT NOT NULL,
      open_tracking_url TEXT NOT NULL,
      destination_url TEXT NOT NULL,
      variant TEXT,
      generation_mode TEXT,
      email_text TEXT,
      email_html TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      email_id TEXT,
      event_type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      variant TEXT,
      generation_mode TEXT,
      user_agent TEXT,
      ip_address TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (email_id) REFERENCES emails(id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_lead_id ON events(lead_id);
    CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_emails_lead_id ON emails(lead_id);
  `);

  ensureTableColumn('leads', 'rating', 'REAL DEFAULT 0');
  ensureTableColumn('leads', 'review_count', 'INTEGER DEFAULT 0');
  ensureTableColumn('leads', 'distance_miles', 'REAL');
  ensureTableColumn('leads', 'enrichment_status', "TEXT DEFAULT 'unknown'");
  ensureTableColumn('leads', 'has_website', 'INTEGER DEFAULT 0');
  ensureTableColumn('leads', 'outreach_tone', "TEXT DEFAULT ''");
};

export const buildTrackingTokens = ({ leadId, variant }) => {
  return {
    clickToken: `c_${createShortToken()}`,
    openToken: `o_${createShortToken()}`,
  };
};

export const buildTrackingUrls = ({ clickToken, openToken }) => ({
  trackingUrl: `${env.publicServerUrl}/api/leads/track-click/${clickToken}`,
  openTrackingUrl: `${env.publicServerUrl}/api/leads/track-open/${openToken}`,
});

export const saveTrackedEmail = ({
  lead,
  variant,
  generationMode,
  outreachTone = '',
  estimatedCost = 0,
  destinationUrl,
  trackingUrl,
  openTrackingUrl,
  clickToken,
  openToken,
  emailText,
  emailHtml,
}) => {
  const db = getDatabase();
  const timestamp = new Date().toISOString();
  const emailId = crypto.randomUUID();
  const city = normalizeLeadCity(lead);
  const canonicalVariant = normalizeTrackedVariant(variant, {
    id: lead.id,
    name: lead.name,
    city,
  });
  const generationModeBucket = getGenerationModeBucket(generationMode);

  db.prepare(`
    INSERT INTO leads (
      id,
      name,
      city,
      score,
      variant,
      generation_mode,
      estimated_cost,
      updated_at,
      rating,
      review_count,
      distance_miles,
      enrichment_status,
      has_website,
      outreach_tone
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      city = excluded.city,
      score = excluded.score,
      variant = excluded.variant,
      generation_mode = excluded.generation_mode,
      estimated_cost = excluded.estimated_cost,
      updated_at = excluded.updated_at,
      rating = excluded.rating,
      review_count = excluded.review_count,
      distance_miles = excluded.distance_miles,
      enrichment_status = excluded.enrichment_status,
      has_website = excluded.has_website,
      outreach_tone = excluded.outreach_tone
  `).run(
    lead.id,
    lead.name || '',
    city,
    Number(lead.leadScore || 0),
    canonicalVariant,
    generationModeBucket,
    Number(estimatedCost || 0),
    timestamp,
    Number(lead.rating || 0),
    Number(lead.reviewCount || 0),
    lead.distanceMiles === null || lead.distanceMiles === undefined ? null : Number(lead.distanceMiles),
    lead.enrichmentStatus || 'unknown',
    lead.website ? 1 : 0,
    outreachTone || '',
  );

  db.prepare(`
    DELETE FROM events
    WHERE email_id IN (
      SELECT id
      FROM emails
      WHERE lead_id = ?
    )
  `).run(lead.id);

  db.prepare('DELETE FROM emails WHERE lead_id = ?').run(lead.id);

  db.prepare(`
    INSERT INTO emails (
      id,
      lead_id,
      tracking_token,
      open_tracking_token,
      tracking_url,
      open_tracking_url,
      destination_url,
      variant,
      generation_mode,
      email_text,
      email_html,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    emailId,
    lead.id,
    clickToken,
    openToken,
    trackingUrl,
    openTrackingUrl,
    destinationUrl,
    canonicalVariant,
    generationModeBucket,
    emailText,
    emailHtml,
    timestamp,
    timestamp,
  );

  return {
    emailId,
    leadId: lead.id,
    variant: canonicalVariant,
    generationMode: generationModeBucket,
    estimatedCost: Number(estimatedCost || 0),
    trackingUrl,
    openTrackingUrl,
    destinationUrl,
    emailText,
    emailHtml,
    createdAt: timestamp,
  };
};

export const recordManualLeadEvent = ({ leadId, eventType, userAgent = 'manual_override', ipAddress = 'local' }) => {
  const db = getDatabase();
  const normalizedEventType = String(eventType || '').trim().toLowerCase();

  if (!leadId) {
    throw new Error('Lead id is required');
  }

  if (!['open', 'click'].includes(normalizedEventType)) {
    throw new Error('Unsupported manual event type');
  }

  const trackedLead = db.prepare(`
    SELECT
      l.id,
      l.name,
      l.city,
      l.variant,
      l.generation_mode,
      e.id AS email_id
    FROM leads l
    LEFT JOIN emails e ON e.lead_id = l.id
    WHERE l.id = ?
    ORDER BY e.created_at DESC
    LIMIT 1
  `).get(leadId);

  if (!trackedLead) {
    throw new Error('Tracked lead not found');
  }

  if (!trackedLead.email_id) {
    throw new Error('Generate a tracked email before recording engagement events');
  }

  const variant = normalizeTrackedVariant(trackedLead.variant, {
    id: trackedLead.id,
    name: trackedLead.name,
    city: trackedLead.city,
  });

  recordTrackingEvent({
    leadId: trackedLead.id,
    emailId: trackedLead.email_id,
    eventType: normalizedEventType,
    variant,
    generationMode: trackedLead.generation_mode || 'partial',
    userAgent,
    ipAddress,
  });

  return getDashboardLeads().rows.find((row) => row.id === trackedLead.id) || null;
};

export const resolveTrackingToken = ({ token, expectedEventType }) => {
  const db = getDatabase();
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid tracking token');
  }

  const columnName = expectedEventType === 'click' ? 'tracking_token' : 'open_tracking_token';
  const email = db.prepare(`
    SELECT id, lead_id, variant, generation_mode, destination_url, tracking_url, open_tracking_url
    FROM emails
    WHERE ${columnName} = ?
  `).get(token);

  if (!email) {
    throw new Error('Tracked email not found');
  }

  return {
    emailId: email.id,
    leadId: email.lead_id,
    variant: email.variant,
    generationMode: email.generation_mode,
    destinationUrl: email.destination_url,
    trackingUrl: email.tracking_url,
    openTrackingUrl: email.open_tracking_url,
  };
};

export const recordTrackingEvent = ({ leadId, emailId, eventType, variant, generationMode, userAgent = '', ipAddress = '' }) => {
  const db = getDatabase();

  db.prepare(`
    INSERT INTO events (id, lead_id, email_id, event_type, timestamp, variant, generation_mode, user_agent, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    leadId,
    emailId,
    eventType,
    toIsoString(),
    variant,
    generationMode,
    userAgent,
    ipAddress,
  );
};

export const getTrackingPixelBuffer = () => trackingPixelBuffer;
export const getTrackingDatabasePath = () => databasePath;
