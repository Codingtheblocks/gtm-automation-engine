import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
dotenv.config();

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const targetMinLeads = Number.parseInt(process.env.TARGET_MIN_LEADS ?? '30', 10);
const targetMaxLeads = Number.parseInt(process.env.TARGET_MAX_LEADS ?? '60', 10);
const topEnrichCount = Number.parseInt(process.env.TOP_ENRICH_COUNT ?? '20', 10);
const initialSearchRadiusMiles = Number.parseInt(process.env.INITIAL_SEARCH_RADIUS_MILES ?? '5', 10);
const maxSearchRadiusMiles = Number.parseInt(process.env.MAX_SEARCH_RADIUS_MILES ?? '50', 10);
const publicServerUrl = process.env.PUBLIC_SERVER_URL || `http://localhost:${port}`;
const trackingTokenSecret = process.env.TRACKING_TOKEN_SECRET || '';

export const env = {
  port,
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  publicServerUrl,
  trackingTokenSecret,
  targetMinLeads,
  targetMaxLeads,
  topEnrichCount,
  initialSearchRadiusMiles,
  maxSearchRadiusMiles,
};
