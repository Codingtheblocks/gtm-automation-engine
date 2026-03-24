import { env } from '../config/env.js';

const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const METERS_PER_MILE = 1609.34;
const STREET_SUFFIX_PATTERN = /\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|cir|circle|trl|trail|way|pkwy|parkway|pl|place|ter|terrace|hwy|highway|suite|ste|unit)\b/i;
const US_STATE_ABBREVIATIONS = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

const GOOGLE_PLACES_PRICING = {
  geocodePerRequest: 0.005,
  textSearchPerRequest: 0.032,
  placeDetailsPerRequest: 0.005,
};

const PLACE_DETAILS_FIELDS = ['name', 'formatted_address', 'formatted_phone_number', 'website', 'rating', 'user_ratings_total', 'geometry', 'types', 'address_component'];

const roundProviderCost = (value = 0) => Number(Number(value || 0).toFixed(6));

export const getGooglePlacesCostBreakdown = ({
  cityCenterLookupCost = 0,
  textSearchRequestCount = 0,
  leadCount = 1,
  includePlaceDetails = false,
} = {}) => {
  const safeLeadCount = Math.max(leadCount || 0, 1);
  const cityCenterLookupAllocatedCost = roundProviderCost(cityCenterLookupCost / safeLeadCount);
  const discoveryTextSearchCost = roundProviderCost((textSearchRequestCount * GOOGLE_PLACES_PRICING.textSearchPerRequest) / safeLeadCount);
  const placeDetailsCost = includePlaceDetails ? roundProviderCost(GOOGLE_PLACES_PRICING.placeDetailsPerRequest) : 0;

  return {
    cityCenterLookupAllocatedCost,
    discoveryTextSearchCost,
    placeDetailsCost,
    total: roundProviderCost(cityCenterLookupAllocatedCost + discoveryTextSearchCost + placeDetailsCost),
  };
};

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
    costMetadata: {
      cityCenterLookupCost: roundProviderCost(GOOGLE_PLACES_PRICING.textSearchPerRequest),
      lookupSource: 'places_text_search',
    },
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
    costMetadata: {
      cityCenterLookupCost: roundProviderCost(GOOGLE_PLACES_PRICING.geocodePerRequest),
      lookupSource: 'geocode',
    },
  };
};

export const getPlaceDetails = async (placeId) => {
  const fields = PLACE_DETAILS_FIELDS.join(',');
  const url = `${PLACES_DETAILS_URL}?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${env.googlePlacesApiKey}`;
  const data = await fetchJson(url);

  const result = data.result || {};
  const geography = normalizePlaceGeography({ place: result, fallbackAddress: result.formatted_address || '' });

  return {
    ...result,
    city: geography.cityState,
    state: geography.state,
    geography: geography.cityState,
    providerCosts: {
      googlePlaces: {
        ...getGooglePlacesCostBreakdown({ includePlaceDetails: true }),
        requestedFields: PLACE_DETAILS_FIELDS,
      },
    },
  };
};

const cleanAddressSegment = (value = '') => String(value || '').trim().replace(/^,+|,+$/g, '');

const isStreetAddressSegment = (value = '') => {
  const normalizedValue = cleanAddressSegment(value);

  if (!normalizedValue) {
    return false;
  }

  return /^\d+\b/.test(normalizedValue) || STREET_SUFFIX_PATTERN.test(normalizedValue);
};

const normalizeStateCode = (value = '') => {
  const normalizedValue = cleanAddressSegment(value);

  if (!normalizedValue) {
    return '';
  }

  const upperValue = normalizedValue.toUpperCase();

  if (/^[A-Z]{2}$/.test(upperValue)) {
    return upperValue;
  }

  const stateToken = upperValue.match(/\b([A-Z]{2})\b/);

  if (stateToken) {
    return stateToken[1];
  }

  return US_STATE_ABBREVIATIONS[normalizedValue.toLowerCase()] || '';
};

const getAddressComponent = (addressComponents = [], types = [], field = 'long_name') => {
  const typeList = Array.isArray(types) ? types : [types];
  const match = addressComponents.find((component) =>
    typeList.every((type) => component.types?.includes(type))
  );

  return cleanAddressSegment(match?.[field] || '');
};

const parseCityStateFromFormattedAddress = (formattedAddress = '') => {
  const segments = String(formattedAddress || '')
    .split(',')
    .map((segment) => cleanAddressSegment(segment))
    .filter(Boolean);

  if (!segments.length) {
    return {
      city: '',
      state: '',
      cityState: '',
    };
  }

  let state = '';
  let stateIndex = -1;

  for (let index = 0; index < segments.length; index += 1) {
    const candidateState = normalizeStateCode(segments[index]);

    if (candidateState) {
      state = candidateState;
      stateIndex = index;
      break;
    }
  }

  let city = '';

  if (stateIndex > 0) {
    for (let index = stateIndex - 1; index >= 0; index -= 1) {
      if (!isStreetAddressSegment(segments[index])) {
        city = segments[index];
        break;
      }
    }
  }

  if (!city) {
    city = segments.find((segment) => !isStreetAddressSegment(segment)) || '';
  }

  return {
    city,
    state,
    cityState: city && state ? `${city}, ${state}` : city || state,
  };
};

export const normalizePlaceGeography = ({ place = {}, fallbackAddress = '' }) => {
  const addressComponents = place.address_components || place.addressComponents || [];
  const parsedAddress = parseCityStateFromFormattedAddress(
    place.formatted_address || place.formattedAddress || place.address || fallbackAddress,
  );
  const city = cleanAddressSegment(
    place.city
    || place.locality
    || getAddressComponent(addressComponents, 'locality')
    || getAddressComponent(addressComponents, 'postal_town')
    || getAddressComponent(addressComponents, 'administrative_area_level_3')
    || getAddressComponent(addressComponents, 'sublocality_level_1')
    || getAddressComponent(addressComponents, 'administrative_area_level_2')
    || parsedAddress.city,
  );
  const state = normalizeStateCode(
    place.state
    || place.region
    || getAddressComponent(addressComponents, 'administrative_area_level_1', 'short_name')
    || getAddressComponent(addressComponents, 'administrative_area_level_1')
    || parsedAddress.state,
  );

  return {
    city,
    state,
    cityState: city && state ? `${city}, ${state}` : city || state || 'Unknown',
  };
};

const searchPlacesByRadius = async ({ keyword, cityCenter, radiusMiles }) => {
  const radiusMeters = Math.round(radiusMiles * METERS_PER_MILE);
  const url = `${PLACES_TEXT_SEARCH_URL}?query=${encodeURIComponent(keyword)}&location=${cityCenter.location.lat},${cityCenter.location.lng}&radius=${radiusMeters}&key=${env.googlePlacesApiKey}`;
  const data = await fetchJson(url);

  return (data.results || []).map((place) => {
    const geography = normalizePlaceGeography({ place, fallbackAddress: place.formatted_address || '' });

    return {
      placeId: place.place_id,
      name: place.name || '',
      address: place.formatted_address || '',
      city: geography.cityState,
      state: geography.state,
      geography: geography.cityState,
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
    };
  });
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

  const visibleBusinesses = businesses.slice(0, env.targetMaxLeads);
  const perLeadGooglePlacesCost = getGooglePlacesCostBreakdown({
    cityCenterLookupCost: cityCenter.costMetadata?.cityCenterLookupCost || 0,
    textSearchRequestCount: radiiUsedMiles.length,
    leadCount: visibleBusinesses.length,
  });

  return {
    cityCenter,
    businesses: visibleBusinesses.map((business) => ({
      ...business,
      providerCosts: {
        googlePlaces: perLeadGooglePlacesCost,
      },
    })),
    searchMetadata: {
      radiiUsedMiles,
      targetMinLeads: env.targetMinLeads,
      targetMaxLeads: env.targetMaxLeads,
      expandedToRadiusMiles: radiiUsedMiles[radiiUsedMiles.length - 1] || env.initialSearchRadiusMiles,
      googlePlaces: {
        cityCenterLookupSource: cityCenter.costMetadata?.lookupSource || 'unknown',
        cityCenterLookupCost: cityCenter.costMetadata?.cityCenterLookupCost || 0,
        textSearchRequestCount: radiiUsedMiles.length,
        perLead: perLeadGooglePlacesCost,
      },
    },
  };
};
