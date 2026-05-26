import { rateLimit } from 'express-rate-limit';

// Auth endpoints (login, register): 10 requests per 15 minutes per IP
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again in 15 minutes.' } },
});

// Invite validation: 20 requests per 15 minutes per IP
export const inviteRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many invite attempts. Please try again later.' } },
});

// Payment initiation: 30 requests per 15 minutes per IP
export const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many payment requests. Please try again later.' } },
});

// Stripe webhook: 300 requests per minute per IP.
// Stripe is the legitimate sender and sends bursts on retry storms.
// This limit is a backstop against forged/replayed request floods.
// Primary protection is the HMAC signature verification in the handler.
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Webhook rate limit exceeded.' } },
});

// General API: 500 requests per 15 minutes per IP (authenticated traffic)
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
});
