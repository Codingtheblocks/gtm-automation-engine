const HUBSPOT_API = 'https://api.hubapi.com';

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
});

const parseResponseBody = async (response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const getErrorMessage = (payload, fallbackMessage) => {
  if (!payload) {
    return fallbackMessage;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (payload.message) {
    return payload.message;
  }

  if (Array.isArray(payload.errors) && payload.errors.length) {
    return payload.errors
      .map((item) => item?.message || item?.code || '')
      .filter(Boolean)
      .join('; ');
  }

  return fallbackMessage;
};

const getLeadEmail = (lead = {}) => String(lead.email || `${lead.id}@placeholder.com`).trim();

const buildHubspotProperties = (lead = {}) => ({
  email: getLeadEmail(lead),
  firstname: lead.name || lead.businessName || '',
  phone: lead.phone || '',
  city: lead.city || '',
  ...(lead.score !== undefined && lead.score !== null ? { lead_score: String(lead.score) } : {}),
  ...(lead.abVariant ? { ab_variant: lead.abVariant } : {}),
  ...(lead.enrichmentLevel ? { enrichment_level: lead.enrichmentLevel } : {}),
  source: 'GTM Automation Engine',
});

const createContactWithProperties = async (properties) => {
  const response = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      properties,
    }),
  });
  const data = await parseResponseBody(response);

  return {
    response,
    data,
  };
};

const updateContactWithProperties = async (contactId, properties) => {
  const response = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/${contactId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({
      properties,
    }),
  });
  const data = await parseResponseBody(response);

  return {
    response,
    data,
  };
};

export const getContactProperties = async () => {
  if (!isEnabled()) {
    return [];
  }

  const response = await fetch(`${HUBSPOT_API}/crm/v3/properties/contacts`, {
    method: 'GET',
    headers: getHeaders(),
  });
  const data = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, `HubSpot contact properties fetch failed with status ${response.status}`));
  }

  return Array.isArray(data?.results) ? data.results : [];
};

const findContactByEmail = async (email) => {
  if (!isEnabled() || !email) {
    return null;
  }

  try {
    const response = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email,
              },
            ],
          },
        ],
        properties: ['email'],
        limit: 1,
      }),
    });
    const data = await parseResponseBody(response);

    if (!response.ok) {
      throw new Error(getErrorMessage(data, `HubSpot contact search failed with status ${response.status}`));
    }

    return data?.results?.[0]?.id || null;
  } catch (error) {
    console.error(`HubSpot contact search error: ${error.message}`);
    return null;
  }
};

export function isEnabled() {
  return process.env.HUBSPOT_ENABLED === 'true' && Boolean(process.env.HUBSPOT_ACCESS_TOKEN);
}

export async function createContact(lead = {}) {
  if (!isEnabled()) {
    return null;
  }

  try {
    const email = getLeadEmail(lead);
    const existingContactId = await findContactByEmail(email);
    const properties = buildHubspotProperties({
      ...lead,
      email,
    });

    if (existingContactId) {
      console.log('Updating HubSpot contact:', {
        contactId: existingContactId,
        properties,
      });
      const { response, data } = await updateContactWithProperties(existingContactId, properties);
      console.log('HubSpot update response:', data);

      if (!response.ok) {
        throw new Error(getErrorMessage(data, `HubSpot contact update failed with status ${response.status}`));
      }

      return existingContactId;
    }

    console.log('Creating HubSpot contact:', properties);
    const { response, data } = await createContactWithProperties(properties);
    console.log('HubSpot response:', data);

    if (!response.ok) {
      throw new Error(getErrorMessage(data, `HubSpot contact create failed with status ${response.status}`));
    }

    return data?.id || null;
  } catch (error) {
    console.error(`HubSpot contact error: ${error.message}`);
    return null;
  }
}

export async function logEvent(contactId, message) {
  if (!isEnabled() || !contactId || !message) {
    return false;
  }

  try {
    const timestamp = Date.now();
    const payload = {
      properties: {
        hs_timestamp: String(timestamp),
        hs_note_body: message,
      },
      associations: [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 202,
            },
          ],
        },
      ],
    };
    console.log('Creating HubSpot note:', payload);
    const response = await fetch(`${HUBSPOT_API}/crm/v3/objects/notes`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await parseResponseBody(response);
    console.log('HubSpot note response:', data);

    if (!response.ok) {
      throw new Error(getErrorMessage(data, `HubSpot event log failed with status ${response.status}`));
    }

    return true;
  } catch (error) {
    console.error(`HubSpot event error: ${error.message}`);
    return false;
  }
}
