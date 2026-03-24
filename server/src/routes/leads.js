import express from 'express';
import { getPlaceDetails, searchBusinesses } from '../services/googlePlacesService.js';
import { enrichBusinessWebsite } from '../services/websiteEnrichmentService.js';
import { calculateLeadScore, getScoreTier } from '../services/leadScoringService.js';
import { haversineDistanceMiles } from '../utils/geo.js';
import { generateOutreachEmail, getOfferVariantForLead, inferServicesBatchWithMetadata, regenerateLowScoreTemplates } from '../services/geminiService.js';
import { getPromptSettings, readPromptFile, updatePromptSettings, companyUrlPromptPath } from '../services/promptService.js';
import { createContact, logEvent } from '../services/hubspotService.js';
import {
  buildTrackingTokens,
  buildTrackingUrls,
  getTrackingPixelBuffer,
  recordManualLeadEvent,
  recordTrackingEvent,
  resolveTrackingToken,
  saveTrackedEmail,
  updateLeadHubspotContactId,
  getTrackedLeadsForHubSpotSync,
} from '../services/trackingService.js';
import { env } from '../config/env.js';

const router = express.Router();

const logEnrichmentDiagnostics = ({ scope, lead, diagnostics }) => {
  if (!diagnostics?.reason) {
    return;
  }

  const leadLabel = lead?.name || lead?.id || 'unknown-lead';
  const message = diagnostics.details
    ? `[Enrich:${scope}] ${leadLabel} -> ${diagnostics.reason}: ${diagnostics.details}`
    : `[Enrich:${scope}] ${leadLabel} -> ${diagnostics.reason}`;

  if (diagnostics.status === 'failed') {
    console.warn(message);
    return;
  }

  console.info(message);
};

const roundProviderCost = (value = 0) => Number(Number(value || 0).toFixed(6));

const normalizeHubSpotVariant = (variant = '', lead = {}) => {
  const normalizedVariant = String(
    variant
    || lead.offerVariant
    || lead.variant
    || getOfferVariantForLead({
      leadId: lead.id,
      businessName: lead.name || lead.businessName || '',
      location: lead.address || lead.location || '',
      city: lead.city || '',
    }),
  ).trim().toUpperCase();

  return normalizedVariant === 'B' ? 'B' : 'A';
};

const getHubSpotEnrichmentLevel = (lead = {}) => {
  const normalizedLevel = String(lead.enrichmentLevel || '').trim().toLowerCase();

  if (['none', 'partial', 'full'].includes(normalizedLevel)) {
    return normalizedLevel;
  }

  if (lead.enrichmentStatus === 'enriched' && lead.generationMode === 'full_enrichment') {
    return 'full';
  }

  if (lead.enrichmentStatus === 'enriched') {
    return 'partial';
  }

  return 'none';
};

const buildHubSpotEventMessage = ({ eventType, variant }) => {
  const normalizedVariant = normalizeHubSpotVariant(variant);

  if (eventType === 'generated') {
    return `Email generated (Variant ${normalizedVariant})`;
  }

  if (eventType === 'open') {
    return `Email opened (Variant ${normalizedVariant})`;
  }

  return `Link clicked (Variant ${normalizedVariant})`;
};

const runFireAndForget = (task, label) => {
  void Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(`[HubSpot:${label}] ${error.message || 'Background sync failed'}`);
    });
};

const resolveLeadPhoneForHubSpot = async (lead = {}) => {
  if (lead.phone) {
    return lead.phone;
  }

  if (!lead.id) {
    return '';
  }

  try {
    const details = await getPlaceDetails(lead.id);
    return details?.formatted_phone_number || '';
  } catch (error) {
    console.warn(`[HubSpot:phone] ${lead.name || lead.id} -> ${error.message || 'Phone lookup failed'}`);
    return '';
  }
};

const syncLeadContactToHubSpot = async (lead = {}) => {
  if (!lead?.id) {
    return '';
  }

  const phone = await resolveLeadPhoneForHubSpot(lead);
  const hubspotContactId = await createContact({
    id: lead.id,
    businessName: lead.name || lead.businessName || '',
    email: lead.email || '',
    phone,
    city: lead.city || '',
    score: lead.leadScore ?? lead.score ?? 0,
    abVariant: normalizeHubSpotVariant('', lead),
    enrichmentLevel: getHubSpotEnrichmentLevel(lead),
  });

  if (hubspotContactId) {
    updateLeadHubspotContactId({
      leadId: lead.id,
      hubspotContactId,
    });
  }

  return hubspotContactId || '';
};

const queueHubSpotLeadEvent = ({ lead, eventType, variant }) => {
  runFireAndForget(async () => {
    const hubspotContactId = await syncLeadContactToHubSpot(lead);

    if (!hubspotContactId) {
      return;
    }

    await logEvent(
      hubspotContactId,
      buildHubSpotEventMessage({
        eventType,
        variant: normalizeHubSpotVariant(variant, lead),
      }),
    );
  }, eventType);
};

const queueHubSpotContactEvent = ({ hubspotContactId, eventType, variant }) => {
  runFireAndForget(async () => {
    if (!hubspotContactId) {
      return;
    }

    await logEvent(
      hubspotContactId,
      buildHubSpotEventMessage({
        eventType,
        variant,
      }),
    );
  }, eventType);
};

const syncTrackedLeadToHubSpot = async (trackedLead = {}) => {
  const hubspotContactId = await syncLeadContactToHubSpot({
    id: trackedLead.id,
    name: trackedLead.name,
    phone: trackedLead.phone,
    city: trackedLead.city,
    score: trackedLead.score,
    variant: trackedLead.variant,
    generationMode: trackedLead.generationMode,
    enrichmentStatus: trackedLead.enrichmentStatus,
    enrichmentLevel: trackedLead.enrichmentLevel,
    hubspotContactId: trackedLead.hubspotContactId,
  });

  if (!hubspotContactId) {
    return {
      leadId: trackedLead.id,
      hubspotContactId: '',
      synced: false,
      generatedLogged: false,
      opensLogged: 0,
      clicksLogged: 0,
    };
  }

  let generatedLogged = false;
  let opensLogged = 0;
  let clicksLogged = 0;

  if (trackedLead.emailId) {
    generatedLogged = await logEvent(
      hubspotContactId,
      buildHubSpotEventMessage({
        eventType: 'generated',
        variant: trackedLead.variant,
      }),
    );
  }

  for (let index = 0; index < Number(trackedLead.totalOpens || 0); index += 1) {
    const didLogOpen = await logEvent(
      hubspotContactId,
      buildHubSpotEventMessage({
        eventType: 'open',
        variant: trackedLead.variant,
      }),
    );

    if (didLogOpen) {
      opensLogged += 1;
    }
  }

  for (let index = 0; index < Number(trackedLead.totalClicks || 0); index += 1) {
    const didLogClick = await logEvent(
      hubspotContactId,
      buildHubSpotEventMessage({
        eventType: 'click',
        variant: trackedLead.variant,
      }),
    );

    if (didLogClick) {
      clicksLogged += 1;
    }
  }

  return {
    leadId: trackedLead.id,
    hubspotContactId,
    synced: true,
    generatedLogged,
    opensLogged,
    clicksLogged,
  };
};

const createEmptyProviderCosts = () => ({
  googlePlaces: {
    cityCenterLookupAllocatedCost: 0,
    discoveryTextSearchCost: 0,
    placeDetailsCost: 0,
    total: 0,
  },
  gemini: {
    inputTokens: 0,
    outputTokens: 0,
    inputCost: 0,
    outputCost: 0,
    total: 0,
    source: 'none',
    operation: 'aggregate',
  },
  scraping: {
    total: 0,
    source: 'none',
  },
});

const mergeProviderCosts = (...providerCostsList) => providerCostsList.reduce((aggregate, providerCosts) => {
  if (!providerCosts) {
    return aggregate;
  }

  const nextAggregate = {
    ...aggregate,
    googlePlaces: {
      ...aggregate.googlePlaces,
      ...(providerCosts.googlePlaces || {}),
      cityCenterLookupAllocatedCost: roundProviderCost(aggregate.googlePlaces.cityCenterLookupAllocatedCost + Number(providerCosts.googlePlaces?.cityCenterLookupAllocatedCost || 0)),
      discoveryTextSearchCost: roundProviderCost(aggregate.googlePlaces.discoveryTextSearchCost + Number(providerCosts.googlePlaces?.discoveryTextSearchCost || 0)),
      placeDetailsCost: roundProviderCost(aggregate.googlePlaces.placeDetailsCost + Number(providerCosts.googlePlaces?.placeDetailsCost || 0)),
    },
    gemini: {
      ...aggregate.gemini,
      ...(providerCosts.gemini || {}),
      inputTokens: Number(aggregate.gemini.inputTokens || 0) + Number(providerCosts.gemini?.inputTokens || 0),
      outputTokens: Number(aggregate.gemini.outputTokens || 0) + Number(providerCosts.gemini?.outputTokens || 0),
      inputCost: roundProviderCost(aggregate.gemini.inputCost + Number(providerCosts.gemini?.inputCost || 0)),
      outputCost: roundProviderCost(aggregate.gemini.outputCost + Number(providerCosts.gemini?.outputCost || 0)),
      total: roundProviderCost(aggregate.gemini.total + Number(providerCosts.gemini?.total || 0)),
      source: providerCosts.gemini?.source || aggregate.gemini.source,
      operation: providerCosts.gemini?.operation || aggregate.gemini.operation,
    },
    scraping: {
      ...aggregate.scraping,
      ...(providerCosts.scraping || {}),
      total: roundProviderCost(aggregate.scraping.total + Number(providerCosts.scraping?.total || 0)),
      source: providerCosts.scraping?.source || aggregate.scraping.source,
    },
  };

  nextAggregate.googlePlaces.total = roundProviderCost(
    Number(nextAggregate.googlePlaces.cityCenterLookupAllocatedCost || 0)
    + Number(nextAggregate.googlePlaces.discoveryTextSearchCost || 0)
    + Number(nextAggregate.googlePlaces.placeDetailsCost || 0),
  );

  return nextAggregate;
}, createEmptyProviderCosts());

const getEstimatedLeadCost = (lead) => {
  const providerCosts = mergeProviderCosts(
    lead.providerCosts,
    lead.enrichment?.providerCosts,
  );

  return roundProviderCost(
    Number(providerCosts.googlePlaces.total || 0)
    + Number(providerCosts.gemini.total || 0)
    + Number(providerCosts.scraping.total || 0),
  );
};

const buildLeadRecord = ({ business, cityCenter, enrichmentCount }) => {
  const distanceMiles = haversineDistanceMiles(cityCenter.location, business.location);
  const score = calculateLeadScore({
    rating: business.rating,
    reviewCount: business.reviewCount,
    hasWebsite: Boolean(business.website),
    distanceMiles: distanceMiles ?? 999,
  });

  return {
    id: business.id || business.placeId,
    placeId: business.placeId || business.id,
    ...business,
    city: business.city || business.geography || cityCenter.formattedAddress || 'Unknown',
    distanceMiles: distanceMiles === null ? null : Number(distanceMiles.toFixed(1)),
    leadScore: score.normalizedScore,
    scoreTier: getScoreTier(score.normalizedScore),
    generatedEmail: business.generatedEmail || '',
    enrichment: business.enrichment || {
      homepageText: '',
      homepageSummary: '',
      inferredServices: [],
      providerCosts: createEmptyProviderCosts(),
    },
    providerCosts: mergeProviderCosts(business.providerCosts),
    enrichmentStatus: business.enrichmentStatus || 'lightweight',
    isTopEnrichedCandidate: false,
    enrichmentCount,
  };
};

const scoreExistingLeadRecord = (lead) => {
  const score = calculateLeadScore({
    rating: lead.rating,
    reviewCount: lead.reviewCount,
    hasWebsite: Boolean(lead.website),
    distanceMiles: lead.distanceMiles ?? 999,
  });

  return {
    ...lead,
    leadScore: score.normalizedScore,
    scoreTier: getScoreTier(score.normalizedScore),
  };
};

const enrichLead = async (lead) => {
  const details = await getPlaceDetails(lead.id);
  console.info(`[Enrich:place_details] ${lead.name || lead.id} -> website=${details.website || 'none'} phone=${details.formatted_phone_number || 'none'}`);

  const detailedLead = {
    ...lead,
    address: details.formatted_address || lead.address || '',
    city: details.city || details.geography || lead.city || '',
    state: details.state || lead.state || '',
    phone: details.formatted_phone_number || lead.phone || '',
    website: details.website || lead.website || '',
    rating: details.rating || lead.rating || 0,
    reviewCount: details.user_ratings_total || lead.reviewCount || 0,
    location: details.geometry?.location || lead.location || null,
    category: details.types?.[0] || lead.category,
    providerCosts: mergeProviderCosts(lead.providerCosts, details.providerCosts),
  };

  const enrichment = detailedLead.website ? await enrichBusinessWebsite(detailedLead) : {
    homepageText: '',
    homepageSummary: '',
    inferredServices: [],
    providerCosts: createEmptyProviderCosts(),
    diagnostics: {
      stage: 'place_details',
      status: 'skipped',
      reason: 'missing_website',
      details: 'Google Place Details did not provide a website URL for this lead',
    },
  };

  logEnrichmentDiagnostics({
    scope: 'website',
    lead: detailedLead,
    diagnostics: enrichment.diagnostics,
  });

  return {
    ...detailedLead,
    enrichment,
    enrichmentStatus: 'enriched',
  };
};

const applyBatchedServices = async (leads) => {
  const { servicesById, providerCostsById } = await inferServicesBatchWithMetadata(
    leads.map((lead) => ({
      id: lead.id,
      businessName: lead.name,
      homepageText: lead.enrichment?.homepageText || '',
    })),
  );

  return leads.map((lead) => ({
    ...lead,
    providerCosts: mergeProviderCosts(lead.providerCosts, providerCostsById.get(lead.id)),
    enrichment: {
      ...lead.enrichment,
      inferredServices: servicesById.get(lead.id) || lead.enrichment?.inferredServices || [],
      providerCosts: mergeProviderCosts(lead.enrichment?.providerCosts, providerCostsById.get(lead.id)),
      diagnostics: lead.enrichment?.diagnostics || null,
    },
  }));
};

const normalizeDestinationUrl = (value = '') => {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return env.publicServerUrl;
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizedValue;
  }

  return `https://${normalizedValue}`;
};

const buildGeneratedEmailLeadRecord = async (lead) => {
  const fullyEnrichedLead = lead.enrichmentStatus === 'enriched' ? lead : await enrichLead(lead);
  const previewOfferVariant = getOfferVariantForLead({
    leadId: fullyEnrichedLead.id,
    businessName: fullyEnrichedLead.name,
    location: fullyEnrichedLead.address,
    city: fullyEnrichedLead.city,
  });
  const { clickToken, openToken } = buildTrackingTokens({
    leadId: fullyEnrichedLead.id,
    variant: previewOfferVariant,
  });
  const { trackingUrl, openTrackingUrl } = buildTrackingUrls({ clickToken, openToken });
  const emailResult = await generateOutreachEmail({
    leadId: fullyEnrichedLead.id,
    businessName: fullyEnrichedLead.name,
    category: fullyEnrichedLead.category,
    location: fullyEnrichedLead.address,
    services: fullyEnrichedLead.enrichment?.inferredServices || [],
    homepageSummary: fullyEnrichedLead.enrichment?.homepageSummary || '',
    leadScore: fullyEnrichedLead.leadScore,
    trackingUrl,
    openTrackingUrl,
  });
  const [leadWithServices] = await applyBatchedServices([{
    ...fullyEnrichedLead,
    generatedEmail: emailResult.generatedEmail,
    offerVariant: emailResult.offerVariant,
    outreachTone: emailResult.tone,
    generationMode: emailResult.generationMode,
    usedGemini: emailResult.usedGemini,
    geminiReason: emailResult.geminiReason,
    geminiDetails: emailResult.geminiDetails,
    templatePath: emailResult.templatePath,
    generatedEmailHtml: emailResult.generatedEmailHtml || '',
  }]);
  const providerCosts = mergeProviderCosts(
    leadWithServices.providerCosts,
    leadWithServices.enrichment?.providerCosts,
    emailResult.providerCosts,
  );
  const estimatedCost = getEstimatedLeadCost({
    providerCosts,
    enrichment: {
      providerCosts: createEmptyProviderCosts(),
    },
  });
  const destinationUrl = normalizeDestinationUrl(await readPromptFile(companyUrlPromptPath));
  const trackingRecord = saveTrackedEmail({
    lead: {
      ...fullyEnrichedLead,
      ...leadWithServices,
      providerCosts,
    },
    variant: emailResult.offerVariant,
    generationMode: emailResult.generationMode,
    outreachTone: emailResult.tone,
    estimatedCost,
    providerCosts,
    destinationUrl,
    trackingUrl,
    openTrackingUrl,
    clickToken,
    openToken,
    emailText: emailResult.generatedEmail,
    emailHtml: emailResult.generatedEmailHtml || '',
  });

  queueHubSpotLeadEvent({
    lead: {
      ...lead,
      ...fullyEnrichedLead,
      ...leadWithServices,
      providerCosts,
      generationMode: emailResult.generationMode,
    },
    eventType: 'generated',
    variant: trackingRecord.variant,
  });

  return {
    ...lead,
    ...fullyEnrichedLead,
    ...leadWithServices,
    providerCosts,
    enrichment: leadWithServices.enrichment,
    enrichmentStatus: 'enriched',
    trackingUrl: trackingRecord.trackingUrl,
    openTrackingUrl: trackingRecord.openTrackingUrl,
    destinationUrl: trackingRecord.destinationUrl,
    estimatedCost: trackingRecord.estimatedCost,
  };
};

router.get('/health', (_request, response) => {
  response.json({ ok: true });
});

router.get('/prompt-settings', async (_request, response) => {
  try {
    const settings = await getPromptSettings();
    return response.json(settings);
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to load prompt settings',
    });
  }
});

router.get('/track-click/:token', (request, response) => {
  try {
    const trackedEmail = resolveTrackingToken({
      token: request.params.token,
      expectedEventType: 'click',
    });

    recordTrackingEvent({
      leadId: trackedEmail.leadId,
      emailId: trackedEmail.emailId,
      eventType: 'click',
      variant: trackedEmail.variant,
      generationMode: trackedEmail.generationMode,
      userAgent: request.get('user-agent') || '',
      ipAddress: request.ip || '',
    });

    queueHubSpotContactEvent({
      hubspotContactId: trackedEmail.hubspotContactId,
      eventType: 'click',
      variant: trackedEmail.variant,
    });

    return response.redirect(trackedEmail.destinationUrl);
  } catch (error) {
    return response.status(404).json({
      message: error.message || 'Tracked click not found',
    });
  }
});

router.get('/track-open/:token', (request, response) => {
  try {
    const trackedEmail = resolveTrackingToken({
      token: request.params.token,
      expectedEventType: 'open',
    });

    recordTrackingEvent({
      leadId: trackedEmail.leadId,
      emailId: trackedEmail.emailId,
      eventType: 'open',
      variant: trackedEmail.variant,
      generationMode: trackedEmail.generationMode,
      userAgent: request.get('user-agent') || '',
      ipAddress: request.ip || '',
    });

    queueHubSpotContactEvent({
      hubspotContactId: trackedEmail.hubspotContactId,
      eventType: 'open',
      variant: trackedEmail.variant,
    });

    response.set('Content-Type', 'image/gif');
    response.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return response.send(getTrackingPixelBuffer());
  } catch (error) {
    return response.status(404).send(getTrackingPixelBuffer());
  }
});

router.post('/prompt-settings', async (request, response) => {
  try {
    const { companyName = '', companyAbout = '', companyUrl = '', offerA = '', offerB = '' } = request.body;

    const settings = await updatePromptSettings({
      companyName,
      companyAbout,
      companyUrl,
      offerA,
      offerB,
    });
    const templateRefresh = await regenerateLowScoreTemplates();

    return response.json({
      ...settings,
      templateRefresh,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to update prompt settings',
    });
  }
});

router.post('/sync-hubspot', async (_request, response) => {
  try {
    const trackedLeads = getTrackedLeadsForHubSpotSync();

    if (!trackedLeads.length) {
      return response.json({
        totalLeads: 0,
        syncedContacts: 0,
        generatedEvents: 0,
        openEvents: 0,
        clickEvents: 0,
      });
    }

    const results = [];

    for (const trackedLead of trackedLeads) {
      results.push(await syncTrackedLeadToHubSpot(trackedLead));
    }

    return response.json({
      totalLeads: trackedLeads.length,
      syncedContacts: results.filter((item) => item.synced).length,
      generatedEvents: results.reduce((sum, item) => sum + (item.generatedLogged ? 1 : 0), 0),
      openEvents: results.reduce((sum, item) => sum + Number(item.opensLogged || 0), 0),
      clickEvents: results.reduce((sum, item) => sum + Number(item.clicksLogged || 0), 0),
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to sync tracked leads to HubSpot',
    });
  }
});

router.post('/:leadId/events', (request, response) => {
  try {
    const normalizedEventType = String(request.body?.eventType || '').trim().toLowerCase();
    const lead = recordManualLeadEvent({
      leadId: request.params.leadId,
      eventType: request.body?.eventType,
      userAgent: request.get('user-agent') || 'manual_override',
      ipAddress: request.ip || 'local',
    });

    if (lead && ['open', 'click'].includes(normalizedEventType)) {
      queueHubSpotContactEvent({
        hubspotContactId: lead.hubspotContactId,
        eventType: normalizedEventType,
        variant: lead.variant,
      });
    }

    return response.json({
      lead,
    });
  } catch (error) {
    return response.status(400).json({
      message: error.message || 'Failed to record lead event',
    });
  }
});

router.post('/enrich-lead', async (request, response) => {
  try {
    const { lead } = request.body;

    if (!lead?.id) {
      return response.status(400).json({ message: 'Lead is required' });
    }

    const enrichedLead = await enrichLead(lead);
    const [leadWithServices] = await applyBatchedServices([{ 
      ...lead,
      ...enrichedLead,
      name: enrichedLead.name || lead.name || '',
      enrichment: enrichedLead.enrichment,
      enrichmentStatus: 'enriched',
    }]);

    return response.json({
      lead: scoreExistingLeadRecord({
        ...lead,
        ...leadWithServices,
        enrichment: leadWithServices.enrichment,
        enrichmentStatus: 'enriched',
      }),
    });
  } catch (error) {
    console.warn(`[Enrich:route] ${lead?.name || lead?.id || 'unknown-lead'} -> ${error.message || 'Failed to enrich lead'}`);
    return response.status(500).json({
      message: error.message || 'Failed to enrich lead',
    });
  }
});

router.post('/search', async (request, response) => {
  try {
    const { city, keyword = 'car repair' } = request.body;

    if (!city) {
      return response.status(400).json({ message: 'City is required' });
    }

    const { cityCenter, businesses, searchMetadata } = await searchBusinesses({ city, keyword });
    const preScoredLeads = businesses
      .map((business) => buildLeadRecord({
        business,
        cityCenter,
        enrichmentCount: env.topEnrichCount,
      }))
      .sort((left, right) => right.leadScore - left.leadScore);

    const topLeadIds = new Set(preScoredLeads.slice(0, env.topEnrichCount).map((lead) => lead.id));

    const enrichedTopLeads = await Promise.all(
      preScoredLeads.slice(0, env.topEnrichCount).map(async (lead) => {
        const enrichedLead = await enrichLead(lead);
        const rescoredLead = buildLeadRecord({
          business: enrichedLead,
          cityCenter,
          enrichmentCount: env.topEnrichCount,
        });

        return {
          ...rescoredLead,
          enrichment: enrichedLead.enrichment,
          enrichmentStatus: enrichedLead.enrichmentStatus,
          isTopEnrichedCandidate: true,
        };
      }),
    );

    const enrichedLeadMap = new Map(
      (await applyBatchedServices(enrichedTopLeads)).map((lead) => [lead.id, lead]),
    );

    const sortedLeads = preScoredLeads
      .map((lead) => enrichedLeadMap.get(lead.id) || {
        ...lead,
        isTopEnrichedCandidate: topLeadIds.has(lead.id),
      })
      .sort((left, right) => right.leadScore - left.leadScore);

    return response.json({
      cityCenter,
      total: sortedLeads.length,
      searchMetadata: {
        ...searchMetadata,
        topEnrichCount: env.topEnrichCount,
      },
      leads: sortedLeads,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to fetch leads',
    });
  }
});

router.post('/generate-email', async (request, response) => {
  try {
    const { lead } = request.body;

    if (!lead?.id) {
      return response.status(400).json({ message: 'Lead is required' });
    }

    const generatedLead = await buildGeneratedEmailLeadRecord(lead);

    return response.json({
      lead: generatedLead,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to generate email',
    });
  }
});

router.post('/generate-emails', async (request, response) => {
  try {
    const { leads = [], topN = 20 } = request.body;

    if (!Array.isArray(leads) || !leads.length) {
      return response.status(400).json({ message: 'Leads array is required' });
    }

    const selectedLeads = [...leads]
      .sort((left, right) => right.leadScore - left.leadScore)
      .slice(0, topN);

    const enrichedWithEmails = await Promise.all(
      selectedLeads.map((lead) => buildGeneratedEmailLeadRecord(lead)),
    );

    return response.json({
      total: enrichedWithEmails.length,
      emails: enrichedWithEmails,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to generate emails',
    });
  }
});

export default router;
