import * as Sentry from '@sentry/node';
import { AppError } from '../middleware/error-handler';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[sentry] SENTRY_DSN is not set — error monitoring disabled in production.');
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Low sample rate for traces — increase after profiling
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    beforeSend(event, hint) {
      // Don't send expected client errors (4xx AppErrors) to Sentry
      const err = hint.originalException;
      if (err instanceof AppError && err.statusCode < 500) {
        return null;
      }
      return event;
    },
  });
}

export { Sentry };
