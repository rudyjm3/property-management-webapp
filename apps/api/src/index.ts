// Must be first — loads .env before any other module reads process.env
import './env';
// Sentry must be initialized before any other imports that set up instrumentation
import { initSentry, Sentry } from './lib/sentry';
initSentry();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware/error-handler';
import { generalRateLimit, webhookRateLimit } from './middleware/rate-limit';
import { startSlaBreachJob } from './jobs/slaBreachCheck';
import { startLateFeeJob } from './jobs/lateFeeJob';
import { startRentGenerationJob } from './jobs/rentGenerationJob';
import stripeWebhookHandler from './webhooks/stripe';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the first proxy hop in production (required for correct IP in rate limiter)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.APP_URL
      : true,
  })
);
app.use(morgan('dev'));

// Stripe webhook — must be registered before express.json() to receive the raw body
app.post('/api/webhooks/stripe', webhookRateLimit, express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json());
app.use(generalRateLimit);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API v1 routes
app.use('/api/v1', routes);

// Sentry error handler (must come before custom error handler)
// Cast to 'any' since @sentry/node's Express types don't perfectly match Express 5's overloads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use(Sentry.expressErrorHandler() as any);

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`PropFlow API running on http://localhost:${PORT}`);
  startSlaBreachJob();
  startRentGenerationJob();
  startLateFeeJob();
});

export default app;
