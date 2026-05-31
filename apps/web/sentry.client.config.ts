import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  // Only send 5xx server errors, not 4xx client errors — mirrors the API's filter
  beforeSend(event) {
    const status = event.extra?.statusCode;
    if (status && Number(status) < 500) return null;
    return event;
  },
});
