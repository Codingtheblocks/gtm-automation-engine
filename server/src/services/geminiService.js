import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'node:path';
import { env } from '../config/env.js';
import {
  companyNamePromptPath,
  companyPromptPath,
  companyUrlPromptPath,
  generatedPromptsDirectory,
  normalizePromptContent,
  offersDirectory,
  readPromptFile,
  writePromptFile,
} from './promptService.js';
import { fallbackServicesFromText } from '../utils/text.js';

const defaultGeminiModel = 'gemini-3-flash-preview';
const modelName = env.geminiModel?.trim() || defaultGeminiModel;
const promptDrivenThreshold = 60;
const lowScoreTemplatePlaceholders = ['{{businessName}}', '{{location}}', '{{companyName}}'];
const lowScoreTemplateFilenameByOffer = {
  'offer_a.md': 'low_score_offer_a_template.md',
  'offer_b.md': 'low_score_offer_b_template.md',
};
const cachedLowScoreTemplates = new Map();
const GEMINI_PRICING = {
  inputPerMillionTokens: 0.5,
  outputPerMillionTokens: 3,
};

const getModel = () => {
  if (!env.geminiApiKey) {
    return null;
  }

  const client = new GoogleGenerativeAI(env.geminiApiKey);
  return client.getGenerativeModel({ model: modelName });
};

const model = getModel();

const buildModelUnavailableDetails = () => `Gemini unavailable for model \"${modelName}\": missing GEMINI_API_KEY or model initialization failed`;

const appendModelContext = (details = '') => {
  const normalizedDetails = details?.trim();
  return normalizedDetails
    ? `${normalizedDetails} (configured model: ${modelName})`
    : `Configured model: ${modelName}`;
};

export const logGeminiConfigurationStatus = () => {
  if (!env.geminiApiKey) {
    console.warn(`[Gemini:config] GEMINI_API_KEY is missing; fallback behavior will be used. Configured model: ${modelName}`);
    return;
  }

  console.info(`[Gemini:config] Using Gemini model: ${modelName}`);
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeCompanyName = (value = '') => normalizePromptContent(value).replace(/[.\s]+$/, '');

const buildGeminiDiagnostics = ({ usedGemini, reason = '', details = '' }) => ({
  usedGemini,
  reason,
  details,
});

const roundProviderCost = (value = 0) => Number(Number(value || 0).toFixed(6));

const estimateTokenCount = (value = '') => Math.max(0, Math.ceil(String(value || '').length / 4));

const buildZeroGeminiUsage = (source = 'none', operation = '') => ({
  inputTokens: 0,
  outputTokens: 0,
  inputCost: 0,
  outputCost: 0,
  total: 0,
  source,
  operation,
});

const buildGeminiUsageFromResult = ({ result, prompt = '', outputText = '', operation = '' }) => {
  const usageMetadata = result?.response?.usageMetadata || result?.usageMetadata || {};
  const hasUsageMetadata = Number.isFinite(Number(usageMetadata.promptTokenCount)) || Number.isFinite(Number(usageMetadata.candidatesTokenCount));
  const inputTokens = hasUsageMetadata ? Number(usageMetadata.promptTokenCount || 0) : estimateTokenCount(prompt);
  const outputTokens = hasUsageMetadata ? Number(usageMetadata.candidatesTokenCount || 0) : estimateTokenCount(outputText);
  const inputCost = roundProviderCost((inputTokens / 1_000_000) * GEMINI_PRICING.inputPerMillionTokens);
  const outputCost = roundProviderCost((outputTokens / 1_000_000) * GEMINI_PRICING.outputPerMillionTokens);

  return {
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    total: roundProviderCost(inputCost + outputCost),
    source: hasUsageMetadata ? 'usage_metadata' : 'estimated_characters',
    operation,
  };
};

const allocateGeminiUsageAcrossBusinesses = ({ candidates = [], geminiUsage, operation = '' }) => {
  if (!candidates.length) {
    return new Map();
  }

  const weights = candidates.map((business) => Math.max(1, estimateTokenCount(business.homepageText || business.businessName || business.id || '')));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || candidates.length;

  return new Map(
    candidates.map((business, index) => {
      const share = weights[index] / totalWeight;
      const inputTokens = Math.round(geminiUsage.inputTokens * share);
      const outputTokens = Math.round(geminiUsage.outputTokens * share);
      const inputCost = roundProviderCost(geminiUsage.inputCost * share);
      const outputCost = roundProviderCost(geminiUsage.outputCost * share);

      return [
        business.id,
        {
          gemini: {
            inputTokens,
            outputTokens,
            inputCost,
            outputCost,
            total: roundProviderCost(inputCost + outputCost),
            source: geminiUsage.source,
            operation,
          },
        },
      ];
    }),
  );
};

const logGeminiDiagnostics = ({ scope, diagnostics }) => {
  const message = diagnostics.details
    ? `${diagnostics.reason}: ${diagnostics.details}`
    : diagnostics.reason;

  if (!message) {
    return;
  }

  const logLine = `[Gemini:${scope}] ${message}`;

  if (diagnostics.usedGemini) {
    console.info(logLine);
    return;
  }

  console.warn(logLine);
};

const hashString = (value = '') =>
  [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 0);

const hasRequiredLowScoreTemplatePlaceholders = (template = '') =>
  lowScoreTemplatePlaceholders.every((placeholder) => template.includes(placeholder));

const containsLegacyServicesPlaceholder = (template = '') => template.includes('{{servicesSummary}}');
const containsLegacyCompanySignature = (template = '') => template.includes('Your Name');

const normalizeUrl = (value = '') => {
  const normalizedValue = normalizePromptContent(value);

  if (!normalizedValue) {
    return '';
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizedValue;
  }

  return `https://${normalizedValue}`;
};

const escapeHtml = (value = '') => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const insertTrackingCallToAction = ({ emailText = '', trackingUrl = '' }) => {
  const normalizedEmailText = normalizePromptContent(emailText);

  if (!trackingUrl || !normalizedEmailText) {
    return normalizedEmailText;
  }

  const trackingCallToAction = `You can check out our service at ${trackingUrl}`;
  const signoffMatch = normalizedEmailText.match(/\n\n(Best,?[\s\S]*)$/i);

  if (!signoffMatch) {
    return `${normalizedEmailText}\n\n${trackingCallToAction}`;
  }

  const body = normalizedEmailText.slice(0, signoffMatch.index).trimEnd();
  const signoff = signoffMatch[1].trimStart();
  return `${body}\n\n${trackingCallToAction}\n\n${signoff}`;
};

const appendTrackingContent = ({ emailText = '', trackingUrl = '', openTrackingUrl = '' }) => {
  const appendedText = insertTrackingCallToAction({
    emailText,
    trackingUrl,
  });
  const htmlBody = escapeHtml(appendedText)
    .replaceAll('\n\n', '</p><p>')
    .replaceAll('\n', '<br />');
  const trackingPixelHtml = openTrackingUrl
    ? `<img src="${escapeHtml(openTrackingUrl)}" width="1" height="1" alt="" style="display:none;" />`
    : '';

  return {
    emailText: appendedText,
    emailHtml: `<p>${htmlBody}</p>${trackingPixelHtml}`,
  };
};

const getLowScoreTemplateFilename = (offerVariant) =>
  lowScoreTemplateFilenameByOffer[offerVariant] || 'low_score_generic_template.md';

const getLowScoreTemplatePathDetails = (offerVariant) => {
  const filename = getLowScoreTemplateFilename(offerVariant);

  return {
    filename,
    absolutePath: path.join(generatedPromptsDirectory, filename),
    relativePath: `prompts/generated/${filename}`,
  };
};

const buildLowScoreFallbackTemplate = ({ companyContext = '', companyName = '', offerVariant }) => {
  const normalizedCompanyContext = normalizePromptContent(companyContext);
  const companySummary = normalizedCompanyContext.split('\n').find(Boolean)
    || 'We help local repair shops source parts reliably and keep jobs moving without cash flow pressure.';
  const offerSpecificValue = offerVariant === 'offer_a.md'
    ? 'We can also support flexible billing so cash flow stays freer while jobs keep moving.'
    : 'We can also support fast, dependable parts delivery so bays stay productive and turnaround stays tight.';

  return `Subject: Helping {{businessName}} keep jobs moving\n\nHi {{businessName}} team,\n\nI came across your shop in {{location}} and saw a chance to help keep jobs moving without bottlenecks. ${companySummary} ${offerSpecificValue}\n\nIf that sounds relevant, I can share a few details.\n\nBest,\n{{companyName}}`;
};

const renderLowScoreTemplate = ({ template, businessName, location, servicesSummary, companyName }) =>
  template
    .replaceAll('{{businessName}}', businessName || 'your shop')
    .replaceAll('{{location}}', location || 'your area')
    .replaceAll('{{companyName}}', normalizeCompanyName(companyName) || 'Your Company')
    .replaceAll('{{servicesSummary}}', servicesSummary || 'repair work');

const persistLowScoreTemplate = async ({ template, offerVariant }) => {
  const normalizedTemplate = normalizePromptContent(template);
  const templatePathDetails = getLowScoreTemplatePathDetails(offerVariant);
  await writePromptFile(templatePathDetails.absolutePath, normalizedTemplate);
  cachedLowScoreTemplates.set(offerVariant, normalizedTemplate);

  return {
    template: normalizedTemplate,
    templatePath: templatePathDetails.relativePath,
    templateFilename: templatePathDetails.filename,
  };
};

export const generateGenericLowScoreTemplate = async ({
  companyContext,
  companyName,
  offerContext,
  offerVariant,
  forceRegenerate = false,
}) => {
  const templatePathDetails = getLowScoreTemplatePathDetails(offerVariant);
  let persistedTemplate = forceRegenerate ? '' : normalizePromptContent(await readPromptFile(templatePathDetails.absolutePath));

  if (containsLegacyServicesPlaceholder(persistedTemplate) || containsLegacyCompanySignature(persistedTemplate)) {
    persistedTemplate = '';
  }

  if (persistedTemplate && hasRequiredLowScoreTemplatePlaceholders(persistedTemplate)) {
    cachedLowScoreTemplates.set(offerVariant, persistedTemplate);

    return {
      template: persistedTemplate,
      generationMode: 'generic_template',
      usedGemini: false,
      geminiDiagnostics: buildGeminiDiagnostics({
        usedGemini: false,
        reason: 'reused_persisted_template',
        details: `Using saved template at ${templatePathDetails.relativePath}`,
      }),
      templatePath: templatePathDetails.relativePath,
      templateFilename: templatePathDetails.filename,
    };
  }

  const cachedTemplate = forceRegenerate ? '' : cachedLowScoreTemplates.get(offerVariant) || '';

  if (cachedTemplate && hasRequiredLowScoreTemplatePlaceholders(cachedTemplate)) {
    return {
      template: cachedTemplate,
      generationMode: 'generic_template',
      usedGemini: false,
      geminiDiagnostics: buildGeminiDiagnostics({
        usedGemini: false,
        reason: 'reused_cached_template',
        details: `Using in-memory template for ${offerVariant}`,
      }),
      templatePath: templatePathDetails.relativePath,
      templateFilename: templatePathDetails.filename,
    };
  }

  const fallbackTemplate = buildLowScoreFallbackTemplate({ companyContext, companyName, offerVariant });

  if (!model) {
    const savedFallbackTemplate = await persistLowScoreTemplate({
      template: fallbackTemplate,
      offerVariant,
    });

    const geminiDiagnostics = buildGeminiDiagnostics({
      usedGemini: false,
      reason: 'model_unavailable',
      details: buildModelUnavailableDetails(),
    });
    logGeminiDiagnostics({ scope: 'template', diagnostics: geminiDiagnostics });

    return {
      template: savedFallbackTemplate.template,
      generationMode: 'generic_template',
      usedGemini: false,
      geminiDiagnostics,
      templatePath: savedFallbackTemplate.templatePath,
      templateFilename: savedFallbackTemplate.templateFilename,
    };
  }

  const prompt = `You are creating a reusable cold outreach email template for low-priority local auto repair shop leads. This template will be generated one time, saved to disk, and reused without additional AI calls for future low-score leads.\n\nSENDER NAME:\n${normalizeCompanyName(companyName) || 'Not available'}\n\nSENDER CONTEXT:\n${companyContext || 'Not available'}\n\nOFFER CONTEXT (${offerVariant}):\n${offerContext || 'Not available'}\n\nREQUIREMENTS:\n- Return an email draft only, no commentary\n- Keep it concise and scalable, under 90 words\n- Use these exact placeholders exactly as written: {{businessName}}, {{location}}, {{companyName}}\n- Sign off with Best, then {{companyName}}\n- Reflect both the sender context and the offer context naturally\n- Sound practical and respectful, not spammy\n- Include a subject line\n- Include a soft call-to-action\n- Do not mention AI or automation\n- Do not add any other placeholders`; 

  try {
    const result = await model.generateContent(prompt);
    const candidateTemplate = normalizePromptContent(result.response.text());
    const templateToSave = hasRequiredLowScoreTemplatePlaceholders(candidateTemplate)
      ? candidateTemplate
      : fallbackTemplate;
    const savedTemplate = await persistLowScoreTemplate({
      template: templateToSave,
      offerVariant,
    });
    const usedGemini = hasRequiredLowScoreTemplatePlaceholders(candidateTemplate);
    const geminiDiagnostics = usedGemini
      ? buildGeminiDiagnostics({
          usedGemini: true,
          reason: 'template_generated',
          details: `Gemini generated ${offerVariant} low-score template`,
        })
      : buildGeminiDiagnostics({
          usedGemini: false,
          reason: 'invalid_template_from_gemini',
          details: 'Gemini response was missing required placeholders, so fallback template was persisted',
        });
    logGeminiDiagnostics({ scope: 'template', diagnostics: geminiDiagnostics });

    return {
      template: savedTemplate.template,
      generationMode: 'generic_template',
      usedGemini,
      geminiDiagnostics,
      templatePath: savedTemplate.templatePath,
      templateFilename: savedTemplate.templateFilename,
    };
  } catch (error) {
    const savedFallbackTemplate = await persistLowScoreTemplate({
      template: fallbackTemplate,
      offerVariant,
    });

    const geminiDiagnostics = buildGeminiDiagnostics({
      usedGemini: false,
      reason: 'template_generation_failed',
      details: appendModelContext(error.message || 'Unknown Gemini error while generating reusable template'),
    });
    logGeminiDiagnostics({ scope: 'template', diagnostics: geminiDiagnostics });

    return {
      template: savedFallbackTemplate.template,
      generationMode: 'generic_template',
      usedGemini: false,
      geminiDiagnostics,
      templatePath: savedFallbackTemplate.templatePath,
      templateFilename: savedFallbackTemplate.templateFilename,
    };
  }
};

export const regenerateLowScoreTemplates = async () => {
  const companyContext = await readPromptFile(companyPromptPath);
  const companyName = normalizeCompanyName(await readPromptFile(companyNamePromptPath)) || 'Your Company';
  const results = await Promise.all([
    generateGenericLowScoreTemplate({
      companyContext,
      companyName,
      offerContext: await readPromptFile(path.join(offersDirectory, 'offer_a.md')),
      offerVariant: 'offer_a.md',
      forceRegenerate: true,
    }),
    generateGenericLowScoreTemplate({
      companyContext,
      companyName,
      offerContext: await readPromptFile(path.join(offersDirectory, 'offer_b.md')),
      offerVariant: 'offer_b.md',
      forceRegenerate: true,
    }),
  ]);

  return {
    offerA: results[0],
    offerB: results[1],
  };
};

export const normalizeOfferExperimentVariant = (value = '') => {
  const normalizedValue = String(value || '').trim().toUpperCase();

  if (!normalizedValue) {
    return '';
  }

  if (normalizedValue === 'A' || normalizedValue.includes('OFFER_A') || normalizedValue.endsWith('_A') || normalizedValue.includes('VARIANT_A')) {
    return 'A';
  }

  if (normalizedValue === 'B' || normalizedValue.includes('OFFER_B') || normalizedValue.endsWith('_B') || normalizedValue.includes('VARIANT_B')) {
    return 'B';
  }

  return '';
};

export const getDeterministicVariantLabel = ({ leadId = '', businessName = '', location = '', city = '' }) => {
  const canonicalLeadId = String(leadId || '').trim();
  const fallbackSeed = `${businessName}::${location}::${city}`.trim();
  const assignmentSeed = canonicalLeadId || fallbackSeed;

  return hashString(assignmentSeed) % 2 === 0 ? 'A' : 'B';
};

export const getOfferVariantFilenameFromLabel = (variantLabel = '') => (
  normalizeOfferExperimentVariant(variantLabel) === 'B' ? 'offer_b.md' : 'offer_a.md'
);

export const getOfferVariantForLead = ({ leadId = '', businessName = '', location = '', city = '' }) => {
  const variantLabel = getDeterministicVariantLabel({ leadId, businessName, location, city });
  return getOfferVariantFilenameFromLabel(variantLabel);
};

export const getToneFromScore = (score = 0) => {
  if (score > 80) {
    return 'highly personalized, partnership-focused';
  }

  if (score >= 60) {
    return 'semi-personalized, value-driven';
  }

  return 'short, scalable outreach';
};

export const inferServices = async ({ businessName, homepageText }) => {
  if (!homepageText) {
    return [];
  }

  if (!model) {
    return fallbackServicesFromText(homepageText);
  }

  const prompt = `You are enriching CRM lead data. Read the homepage text for ${businessName} and return a JSON array of up to 6 likely automotive services explicitly or strongly implied by the content. Only return the JSON array. Homepage text: ${homepageText}`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const parsed = JSON.parse(responseText);
    return Array.isArray(parsed) ? parsed : fallbackServicesFromText(homepageText);
  } catch {
    return fallbackServicesFromText(homepageText);
  }
};

export const inferServicesBatchWithMetadata = async (businesses) => {
  const candidates = businesses.filter((business) => business.homepageText);

  if (!candidates.length) {
    return {
      servicesById: new Map(),
      providerCostsById: new Map(),
    };
  }

  if (!model) {
    return {
      servicesById: new Map(
        candidates.map((business) => [business.id, fallbackServicesFromText(business.homepageText)]),
      ),
      providerCostsById: new Map(
        candidates.map((business) => [business.id, { gemini: buildZeroGeminiUsage('model_unavailable', 'infer_services_batch') }]),
      ),
    };
  }

  const promptPayload = candidates.map((business) => ({
    id: business.id,
    businessName: business.businessName,
    homepageText: business.homepageText,
  }));

  const prompt = `You are enriching CRM lead data for local automotive businesses. For each item in the input array, return a JSON array of objects in the format [{"id":"...","services":["..."]}]. Each services array should contain up to 6 likely automotive services explicitly stated or strongly implied by the homepage text. Return JSON only. Input: ${JSON.stringify(promptPayload)}`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const parsed = safeJsonParse(responseText);
    const geminiUsage = buildGeminiUsageFromResult({
      result,
      prompt,
      outputText: responseText,
      operation: 'infer_services_batch',
    });

    if (!Array.isArray(parsed)) {
      throw new Error('Invalid batch service response');
    }

    return {
      servicesById: new Map(
        candidates.map((business) => {
          const match = parsed.find((item) => item?.id === business.id);
          return [
            business.id,
            Array.isArray(match?.services) ? match.services : fallbackServicesFromText(business.homepageText),
          ];
        }),
      ),
      providerCostsById: allocateGeminiUsageAcrossBusinesses({
        candidates,
        geminiUsage,
        operation: 'infer_services_batch',
      }),
    };
  } catch {
    return {
      servicesById: new Map(
        candidates.map((business) => [business.id, fallbackServicesFromText(business.homepageText)]),
      ),
      providerCostsById: new Map(
        candidates.map((business) => [business.id, { gemini: buildZeroGeminiUsage('generation_failed', 'infer_services_batch') }]),
      ),
    };
  }
};

export const inferServicesBatch = async (businesses) => {
  const result = await inferServicesBatchWithMetadata(businesses);
  return result.servicesById;
};

export const summarizeHomepageWithMetadata = async ({ businessName, homepageText }) => {
  if (!homepageText) {
    return {
      summary: '',
      providerCosts: {
        gemini: buildZeroGeminiUsage('no_homepage_text', 'homepage_summary'),
      },
    };
  }

  if (!model) {
    return {
      summary: homepageText.slice(0, 600),
      providerCosts: {
        gemini: buildZeroGeminiUsage('model_unavailable', 'homepage_summary'),
      },
    };
  }

  const prompt = `Summarize the public homepage copy for ${businessName} in 2 concise sentences for CRM enrichment. Focus on positioning, specialties, and customer value. Homepage text: ${homepageText}`;

  try {
    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();

    return {
      summary,
      providerCosts: {
        gemini: buildGeminiUsageFromResult({
          result,
          prompt,
          outputText: summary,
          operation: 'homepage_summary',
        }),
      },
    };
  } catch {
    return {
      summary: homepageText.slice(0, 600),
      providerCosts: {
        gemini: buildZeroGeminiUsage('generation_failed', 'homepage_summary'),
      },
    };
  }
};

export const summarizeHomepage = async ({ businessName, homepageText }) => {
  const result = await summarizeHomepageWithMetadata({ businessName, homepageText });
  return result.summary;
};

export const generateOutreachEmail = async ({
  leadId,
  businessName,
  category,
  location,
  services,
  homepageSummary,
  leadScore,
  trackingUrl = '',
  openTrackingUrl = '',
}) => {
  const offerVariant = getOfferVariantForLead({ leadId, businessName, location });
  const tone = getToneFromScore(leadScore);
  const companyMd = await readPromptFile(companyPromptPath);
  const companyNameMd = await readPromptFile(companyNamePromptPath);
  const companyUrlMd = await readPromptFile(companyUrlPromptPath);
  const companyName = normalizeCompanyName(companyNameMd) || 'Your Company';
  const companyUrl = normalizeUrl(companyUrlMd);
  const offerMd = await readPromptFile(path.join(offersDirectory, offerVariant));
  const servicesSummary = services?.join(', ') || 'general repair services';
  const fallbackEmail = `Subject: Helping ${businessName} improve shop throughput\n\nHi ${businessName} team,\n\nI came across your shop in ${location} and noticed you handle ${servicesSummary}. We work with repair shops to keep jobs moving with dependable parts support and practical commercial terms that help protect margins and reduce delays.\n\n${offerVariant === 'offer_a.md' ? 'One option we offer is flexible billing so you can pay after job completion and keep cash flow freer while bays stay productive.' : 'One option we offer is fast delivery so your team can reduce downtime, turn vehicles faster, and keep more jobs moving through the shop.'}\n\nIf that sounds relevant, let me know and I can share a few details.\n\nBest,\n${companyName}`;

  if (leadScore < promptDrivenThreshold) {
    const templateResult = await generateGenericLowScoreTemplate({
      companyContext: companyMd,
      companyName,
      offerContext: offerMd,
      offerVariant,
    });

    const renderedEmail = renderLowScoreTemplate({
      template: templateResult.template,
      businessName,
      location,
      servicesSummary,
      companyName,
    });
    const trackedEmail = appendTrackingContent({
      emailText: renderedEmail,
      trackingUrl,
      openTrackingUrl,
    });

    return {
      generatedEmail: trackedEmail.emailText,
      generatedEmailHtml: trackedEmail.emailHtml,
      offerVariant,
      tone,
      companyContextLoaded: Boolean(companyMd) || Boolean(companyNameMd) || Boolean(companyUrl),
      offerContextLoaded: Boolean(offerMd),
      generationMode: templateResult.generationMode,
      usedGemini: templateResult.usedGemini,
      geminiReason: templateResult.geminiDiagnostics?.reason || '',
      geminiDetails: templateResult.geminiDiagnostics?.details || '',
      templatePath: templateResult.templatePath,
      providerCosts: {
        gemini: buildZeroGeminiUsage('template_reused', 'outreach_email'),
      },
    };
  }

  if (!model) {
    const geminiDiagnostics = buildGeminiDiagnostics({
      usedGemini: false,
      reason: 'model_unavailable',
      details: buildModelUnavailableDetails(),
    });
    logGeminiDiagnostics({ scope: 'email', diagnostics: geminiDiagnostics });
    const trackedEmail = appendTrackingContent({
      emailText: fallbackEmail,
      trackingUrl,
      openTrackingUrl,
    });

    return {
      generatedEmail: trackedEmail.emailText,
      generatedEmailHtml: trackedEmail.emailHtml,
      offerVariant,
      tone,
      companyContextLoaded: Boolean(companyMd) || Boolean(companyNameMd) || Boolean(companyUrl),
      offerContextLoaded: Boolean(offerMd),
      generationMode: 'prompt_gemini',
      usedGemini: false,
      geminiReason: geminiDiagnostics.reason,
      geminiDetails: geminiDiagnostics.details,
      templatePath: '',
      providerCosts: {
        gemini: buildZeroGeminiUsage('model_unavailable', 'outreach_email'),
      },
    };
  }

  const prompt = `You are generating a B2B outreach email to a local car repair shop.\n\nFILES TO READ:\n- SENDER CONTEXT: /prompts/company.md → ${companyMd || 'Not available'}\n- SENDER NAME: /prompts/company-name.md → ${companyName || 'Not available'}\n- SENDER URL: /prompts/company-url.md → ${companyUrl || 'Not available'}\n- OFFER: /prompts/offers/${offerVariant} → ${offerMd || 'Not available'}\n\nTARGET BUSINESS:\n- Name: ${businessName}\n- Location: ${location}\n- Services: ${servicesSummary}\n- Category: ${category}\n- Website summary: ${homepageSummary || 'Not available'}\n- Lead score: ${leadScore}\n- Tone: ${tone}\n\nGOAL:\n- Introduce the company naturally\n- Connect the offer to the shop’s services\n- Focus on business value such as faster jobs, better margins, and reliability\n- Keep it concise under 120 words\n\nOUTPUT:\n- Short cold email including a personalized intro, clear value proposition, and soft call-to-action\n\nRULES:\n- Do NOT mention AI or automation\n- Do NOT sound spammy or generic\n- Use a natural, conversational tone\n- Reflect the brand voice from company.md and tailor the offer to the services summary.\n- Do not include any website link because the application appends the tracked CTA automatically.\n- Sign off with Best, then ${companyName}.`;

  try {
    const result = await model.generateContent(prompt);
    const generatedEmailText = result.response.text().trim();
    const geminiUsage = buildGeminiUsageFromResult({
      result,
      prompt,
      outputText: generatedEmailText,
      operation: 'outreach_email',
    });
    const geminiDiagnostics = buildGeminiDiagnostics({
      usedGemini: true,
      reason: 'email_generated',
      details: `Gemini generated a personalized email for ${businessName}`,
    });
    logGeminiDiagnostics({ scope: 'email', diagnostics: geminiDiagnostics });
    const trackedEmail = appendTrackingContent({
      emailText: generatedEmailText,
      trackingUrl,
      openTrackingUrl,
    });

    return {
      generatedEmail: trackedEmail.emailText,
      generatedEmailHtml: trackedEmail.emailHtml,
      offerVariant,
      tone,
      companyContextLoaded: Boolean(companyMd) || Boolean(companyNameMd) || Boolean(companyUrl),
      offerContextLoaded: Boolean(offerMd),
      generationMode: 'prompt_gemini',
      usedGemini: true,
      geminiReason: geminiDiagnostics.reason,
      geminiDetails: geminiDiagnostics.details,
      templatePath: '',
      providerCosts: {
        gemini: geminiUsage,
      },
    };
  } catch (error) {
    const geminiDiagnostics = buildGeminiDiagnostics({
      usedGemini: false,
      reason: 'email_generation_failed',
      details: appendModelContext(error.message || 'Unknown Gemini error while generating email'),
    });
    logGeminiDiagnostics({ scope: 'email', diagnostics: geminiDiagnostics });
    const trackedEmail = appendTrackingContent({
      emailText: fallbackEmail,
      trackingUrl,
      openTrackingUrl,
    });

    return {
      generatedEmail: trackedEmail.emailText,
      generatedEmailHtml: trackedEmail.emailHtml,
      offerVariant,
      tone,
      companyContextLoaded: Boolean(companyMd) || Boolean(companyNameMd) || Boolean(companyUrl),
      offerContextLoaded: Boolean(offerMd),
      generationMode: 'prompt_gemini',
      usedGemini: false,
      geminiReason: geminiDiagnostics.reason,
      geminiDetails: geminiDiagnostics.details,
      templatePath: '',
      providerCosts: {
        gemini: buildZeroGeminiUsage('generation_failed', 'outreach_email'),
      },
    };
  }
};
