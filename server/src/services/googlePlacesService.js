import { env } from '../config/env.js';

const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const METERS_PER_MILE = 1609.34;

const fetchJson = async (url) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google API request failed with status ${response.status}`);
  }

  return response.json();
};

const getGoogleApiError = (data) => {
  if (!data || data.status === 'OK' || data.status === 'ZERO_RESULTS') {
    return '';
  }

  return data.error_message || data.status || 'Unknown Google API error';
};

const dedupeByPlaceId = (businesses) => {
  const seen = new Set();

  return businesses.filter((business) => {
    if (!business?.placeId || seen.has(business.placeId)) {
      return false;
    }

    seen.add(business.placeId);
    return true;
  });
};

const getCityCenterFromPlaces = async (city) => {
  const url = `${PLACES_TEXT_SEARCH_URL}?query=${encodeURIComponent(city)}&key=${env.googlePlacesApiKey}`;
  const data = await fetchJson(url);
  const apiError = getGoogleApiError(data);

  if (apiError && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Unable to resolve city center from Places: ${apiError}`);
  }

  if (!data.results?.length) {
    throw new Error(`Unable to geocode city: ${city}`);
  }

  const result = data.results[0];

  return {
    formattedAddress: result.formatted_address || result.name || city,
    location: result.geometry?.location || null,
  };
};

export const getCityCenter = async (city) => {
  const url = `${GEOCODE_URL}?address=${encodeURIComponent(city)}&key=${env.googlePlacesApiKey}`;
  const data = await fetchJson(url);

  const apiError = getGoogleApiError(data);

  if (apiError && data.status !== 'ZERO_RESULTS') {
    return getCityCenterFromPlaces(city);
  }

  if (!data.results?.length) {
    return getCityCenterFromPlaces(city);
  }

  const result = data.results[0];
  return {
    formattedAddress: result.formatted_address,
    location: result.geometry.location,
  };
};

export const getPlaceDetails = async (placeId) => {
  const fields = ['name', 'formatted_address', 'formatted_phone_number', 'website', 'rating', 'user_ratings_total', 'geometry', 'types'].join(',');
  const url = `${PLACES_DETAILS_URL}?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${env.googlePlacesApiKey}`;
  const data = await fetchJson(url);

  return data.result || {};
};

const searchPlacesByRadius = async ({ keyword, cityCenter, radiusMiles }) => {
  const radiusMeters = Math.round(radiusMiles * METERS_PER_MILE);
  const url = `${PLACES_TEXT_SEARCH_URL}?query=${encodeURIComponent(keyword)}&location=${cityCenter.location.lat},${cityCenter.location.lng}&radius=${radiusMeters}&key=${env.googlePlacesApiKey}`;
  const data = await fetchJson(url);

  return (data.results || []).map((place) => ({
    placeId: place.place_id,
    name: place.name || '',
    address: place.formatted_address || '',
    phone: '',
    website: null,
    rating: place.rating || 0,
    reviewCount: place.user_ratings_total || 0,
    location: place.geometry?.location || null,
    category: place.types?.[0] || keyword,
    enrichment: {
      homepageText: '',
      homepageSummary: '',
      inferredServices: [],
    },
    enrichmentStatus: 'lightweight',
    generatedEmail: '',
  }));
};

export const searchBusinesses = async ({ city, keyword }) => {
  if (!env.googlePlacesApiKey) {
    throw new Error('Missing GOOGLE_PLACES_API_KEY in environment');
  }

  const cityCenter = await getCityCenter(city);
  const query = `${keyword} in ${city}`;
  let radiusMiles = env.initialSearchRadiusMiles;
  let businesses = [];
  const radiiUsedMiles = [];

  while (businesses.length < env.targetMinLeads && radiusMiles <= env.maxSearchRadiusMiles) {
    const radiusResults = await searchPlacesByRadius({
      keyword: query,
      cityCenter,
      radiusMiles,
    });

    radiiUsedMiles.push(radiusMiles);
    businesses = dedupeByPlaceId([...businesses, ...radiusResults]).slice(0, env.targetMaxLeads);
    radiusMiles *= 2;
  }

  return {
    cityCenter,
    businesses: businesses.slice(0, env.targetMaxLeads),
    searchMetadata: {
      radiiUsedMiles,
      targetMinLeads: env.targetMinLeads,
      targetMaxLeads: env.targetMaxLeads,
      expandedToRadiusMiles: radiiUsedMiles[radiiUsedMiles.length - 1] || env.initialSearchRadiusMiles,
    },
  };
};
