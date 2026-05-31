import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

// Captures errors from React Server Components and server actions
export const onRequestError = Sentry.captureRequestError;
