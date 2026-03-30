// Must be first — loads .env before any other module reads process.env
import './env';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware/error-handler';
import { startSlaBreachJob } from './jobs/slaBreachCheck';
import { startLateFeeJob } from './jobs/lateFeeJob';
import stripeWebhookHandler from './webhooks/stripe';

const app = express();
const PORT = process.env.PORT || 3001;

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
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API v1 routes
app.use('/api/v1', routes);

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`PropFlow API running on http://localhost:${PORT}`);
  startSlaBreachJob();
  startLateFeeJob();
});

export default app;
