import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import leadsRouter from './routes/leads.js';
import dashboardRouter from './routes/dashboard.js';
import testRouter from './routes/test.js';
import { logGeminiConfigurationStatus } from './services/geminiService.js';
import { initializeTrackingDatabase } from './services/trackingService.js';

const app = express();

app.use(
  cors({
    origin: env.clientOrigin,
  }),
);
app.use(express.json({ limit: '1mb' }));

app.use('/api/leads', leadsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/test', testRouter);

app.use((error, _request, response, _next) => {
  response.status(500).json({
    message: error.message || 'Unexpected server error',
  });
});

await initializeTrackingDatabase();
logGeminiConfigurationStatus();

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});
