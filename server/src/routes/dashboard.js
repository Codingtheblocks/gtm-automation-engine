import express from 'express';
import { getDashboardLeads, getDashboardOverview, getSystemPerformance } from '../services/trackingService.js';

const router = express.Router();

router.get('/', (_request, response) => {
  try {
    return response.json({
      overview: getDashboardOverview(),
      leads: getDashboardLeads(),
      systemPerformance: getSystemPerformance(),
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to load dashboard data',
    });
  }
});

router.get('/overview', (_request, response) => {
  try {
    return response.json(getDashboardOverview());
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to load overview metrics',
    });
  }
});

router.get('/leads', (_request, response) => {
  try {
    return response.json(getDashboardLeads());
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to load dashboard leads',
    });
  }
});

router.get('/system-performance', (_request, response) => {
  try {
    return response.json(getSystemPerformance());
  } catch (error) {
    return response.status(500).json({
      message: error.message || 'Failed to load system performance metrics',
    });
  }
});

export default router;
