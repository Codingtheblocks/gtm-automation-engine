import express from 'express';
import { createContact, getContactProperties, isEnabled, logEvent } from '../services/hubspotService.js';

const router = express.Router();

router.get('/hubspot/properties', async (_request, response) => {
  try {
    if (!isEnabled()) {
      return response.status(400).json({
        message: 'HubSpot integration is disabled',
      });
    }

    const properties = await getContactProperties();
    const requiredProperties = ['lead_score', 'ab_variant', 'enrichment_level', 'source'];

    return response.json({
      properties: properties.map((property) => ({
        name: property.name,
        label: property.label,
        type: property.type,
        fieldType: property.fieldType,
      })),
      required: requiredProperties.map((name) => ({
        name,
        exists: properties.some((property) => property.name === name),
      })),
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to load HubSpot contact properties',
    });
  }
});

router.post('/hubspot', async (request, response) => {
  try {
    if (!isEnabled()) {
      return response.status(400).json({
        message: 'HubSpot integration is disabled',
      });
    }

    const {
      name = 'Test Garage',
      city = 'Austin',
      score = 80,
      variant = 'A',
    } = request.body || {};

    const lead = {
      id: `hubspot-test-${Date.now()}`,
      businessName: name,
      city,
      score,
      abVariant: String(variant || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A',
      enrichmentLevel: 'partial',
    };

    const contactId = await createContact(lead);

    if (!contactId) {
      return response.status(502).json({
        message: 'Failed to create or resolve HubSpot contact',
      });
    }

    await logEvent(contactId, `Email generated (Variant ${lead.abVariant})`);

    return response.json({
      contactId,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'HubSpot test failed',
    });
  }
});

export default router;
