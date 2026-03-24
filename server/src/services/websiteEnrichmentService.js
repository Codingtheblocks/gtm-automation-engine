import { chromium } from 'playwright';
import { summarizeHomepageWithMetadata } from './geminiService.js';
import { cleanText, truncateText } from '../utils/text.js';

const PLAYWRIGHT_SCRAPE_COST = 0.02;

export const enrichBusinessWebsite = async (business) => {
  if (!business.website) {
    console.warn(`[Enrich:website] Skipping website enrichment for ${business.name || business.id} because no website was returned by Place Details`);

    return {
      homepageText: '',
      homepageSummary: '',
      inferredServices: [],
      providerCosts: {
        scraping: {
          total: 0,
          source: 'missing_website',
        },
        gemini: {
          inputTokens: 0,
          outputTokens: 0,
          inputCost: 0,
          outputCost: 0,
          total: 0,
          source: 'missing_website',
          operation: 'homepage_summary',
        },
      },
      diagnostics: {
        stage: 'place_details',
        status: 'skipped',
        reason: 'missing_website',
        details: 'Google Place Details did not provide a website URL for this lead',
      },
    };
  }

  let browser;

  try {
    console.info(`[Enrich:website] Launching Playwright for ${business.name || business.id} at ${business.website}`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (compatible; GTMLeadBot/1.0; +https://example.com/bot)',
    });

    await page.goto(business.website, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const bodyText = await page.locator('body').innerText();
    const homepageText = truncateText(cleanText(bodyText), 5000);
    const homepageSummaryResult = await summarizeHomepageWithMetadata({
      businessName: business.name,
      homepageText,
    });
    console.info(`[Enrich:website] Captured ${homepageText.length} chars from ${business.website} for ${business.name || business.id}`);

    return {
      homepageText,
      homepageSummary: homepageSummaryResult.summary,
      inferredServices: [],
      providerCosts: {
        scraping: {
          total: PLAYWRIGHT_SCRAPE_COST,
          source: 'playwright',
        },
        gemini: homepageSummaryResult.providerCosts?.gemini || {
          inputTokens: 0,
          outputTokens: 0,
          inputCost: 0,
          outputCost: 0,
          total: 0,
          source: 'missing_usage',
          operation: 'homepage_summary',
        },
      },
      diagnostics: {
        stage: 'website_enrichment',
        status: 'success',
        reason: 'playwright_completed',
        details: `Fetched homepage text from ${business.website}`,
      },
    };
  } catch (error) {
    console.warn(`[Enrich:website] Failed website enrichment for ${business.name || business.id}: ${error.message || 'Unknown Playwright error'}`);

    return {
      homepageText: '',
      homepageSummary: '',
      inferredServices: [],
      providerCosts: {
        scraping: {
          total: 0,
          source: 'playwright_failed',
        },
        gemini: {
          inputTokens: 0,
          outputTokens: 0,
          inputCost: 0,
          outputCost: 0,
          total: 0,
          source: 'playwright_failed',
          operation: 'homepage_summary',
        },
      },
      diagnostics: {
        stage: 'website_enrichment',
        status: 'failed',
        reason: 'playwright_failed',
        details: error.message || 'Unknown Playwright error while fetching website',
      },
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
