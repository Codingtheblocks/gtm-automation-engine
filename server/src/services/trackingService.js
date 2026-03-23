import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.js';
import { getScoreTier } from './leadScoringService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.resolve(__dirname, '..', '..', 'data');
const databasePath = path.join(dataDirectory, 'tracking.sqlite');
const trackingPixelBuffer = Buffer.from([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59]);

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

const extractCityFromAddress = (address = '') => {
  const normalizedAddress = String(address || '').trim();

  if (!normalizedAddress) {
    return '';
  }

  return normalizedAddress.split(',').map((part) => part.trim()).find(Boolean) || normalizedAddress;
};

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
    modeledReplies,
    modeledReplyRate: toPercent(modeledReplies, aggregate.leads),
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
      const summary = summarizeRows(segmentRows);
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
      variant: (row.variant || 'Unknown').toUpperCase(),
      generationMode: row.generation_mode || 'partial',
      estimatedCost: roundMetric(row.estimated_cost, 2),
      updatedAt: row.updated_at || '',
      draftedAt: row.drafted_at || '',
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
    };
  });
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
  const city = extractCityFromAddress(lead.address);
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
    variant,
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
    variant,
    generationModeBucket,
    emailText,
    emailHtml,
    timestamp,
    timestamp,
  );

  return {
    emailId,
    leadId: lead.id,
    variant,
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

export const getDashboardOverview = () => {
  const rows = getTrackedLeadFacts();
  const totals = summarizeRows(rows);
  const averageLeadScore = roundMetric(divide(rows.reduce((sum, row) => sum + row.score, 0), rows.length), 1);
  const enrichedLeads = rows.filter((row) => row.enrichmentLevel !== 'none').length;
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
      totalCost: summary.totalCost,
      replies: summary.modeledReplies,
      repliesModeled: true,
    };
  });
  const topPerformingSegment = rankSegment(rows, (row) => `${row.ratingBand} rated • ${row.distanceBand}`);
  const bestPerformingCity = rankSegment(rows, (row) => row.city);
  const bestPerformingScoreRange = rankSegment(rows, (row) => row.scoreBand);
  const bestPerformingReviewSegment = rankSegment(rows, (row) => row.ratingBand);

  return {
    kpis: {
      totalLeads: totals.leads,
      enrichedLeads,
      averageLeadScore,
      totalCost: totals.totalCost,
      costPerLead: totals.costPerLead,
      overallCtr: totals.ctr,
      openRate: totals.openRate,
    },
    abPerformance: {
      variants: variantSummaries,
      charts: {
        ctrByVariant: variantSummaries.map((variant) => ({ label: variant.variant, value: variant.ctr })),
        openRateByVariant: variantSummaries.map((variant) => ({ label: variant.variant, value: variant.openRate })),
      },
      notes: {
        replies: 'Replies are modeled from downstream click and open intensity until direct reply tracking is implemented.',
      },
    },
    segmentInsights: {
      topPerformingSegment,
      bestPerformingCity,
      bestPerformingLeadScoreRange: bestPerformingScoreRange,
      bestPerformingReviewSegment,
    },
  };
};

export const getDashboardLeads = () => {
  const rows = getTrackedLeadFacts();

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
    })),
    filters: {
      variants: [...new Set(rows.map((row) => row.variant))].filter(Boolean).sort(),
      cities: [...new Set(rows.map((row) => row.city))].filter(Boolean).sort((left, right) => left.localeCompare(right)),
      enrichmentLevels: ['full', 'partial', 'none'],
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

  return {
    coreMetrics: {
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
      totalCost: totals.totalCost,
      costSavedViaTiering: roundMetric(Math.max(0, fullPersonalizationBaseline - totals.totalCost), 2),
    },
    visuals: {
      costVsLeadScore: rows.map((row) => ({
        id: row.id,
        label: row.name,
        score: row.score,
        cost: row.estimatedCost,
        variant: row.variant,
      })),
      enrichmentDistribution: [
        { label: 'Full enrichment', value: enrichmentDistribution.full },
        { label: 'Partial', value: enrichmentDistribution.partial },
        { label: 'None', value: enrichmentDistribution.none },
      ],
      costBreakdown: [
        { label: 'Google Places', value: roundMetric(costBreakdown.googlePlaces, 2) },
        { label: 'Gemini', value: roundMetric(costBreakdown.gemini, 2) },
        { label: 'Scraping', value: roundMetric(costBreakdown.scraping, 2) },
      ],
    },
    notes: [
      'Gemini call counts are estimated from personalized drafts plus one reusable template-generation pass per low-score variant.',
      'Processing time and API call counts are centralized approximations derived from each lead path until provider-level telemetry is persisted.',
    ],
  };
};

export const getTrackingPixelBuffer = () => trackingPixelBuffer;
export const getTrackingDatabasePath = () => databasePath;
