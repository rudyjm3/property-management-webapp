import Stripe from 'stripe';
import { prisma } from '@propflow/db';
import { ConnectAccountStatus } from '@propflow/shared';
import { AppError } from '../middleware/error-handler';

// ─── Singleton Stripe client ───────────────────────────────────────────────────

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new AppError(500, 'STRIPE_NOT_CONFIGURED', 'STRIPE_SECRET_KEY is not set.');
    }
    stripeClient = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  }
  return stripeClient;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function deriveConnectStatus(account: Stripe.Account): ConnectAccountStatus {
  if (!account.details_submitted) return 'pending';
  if (!account.charges_enabled) return 'pending';
  if (account.charges_enabled && account.payouts_enabled) return 'active';
  return 'restricted';
}

// ─── Get or create Connect Express account ────────────────────────────────────

export async function getOrCreateConnectAccount(orgId: string): Promise<Stripe.Account> {
  const stripe = getStripe();

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

  if (org.stripeAccountId) {
    return stripe.accounts.retrieve(org.stripeAccountId);
  }

  const account = await stripe.accounts.create({ type: 'express' });

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      stripeAccountId: account.id,
      stripeAccountStatus: 'pending',
    },
  });

  return account;
}

// ─── Create AccountLink URL (for incomplete onboarding) ──────────────────────

export async function createAccountLink(
  stripeAccountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const stripe = getStripe();

  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  });

  return link.url;
}

// ─── Create Express dashboard login link (for completed accounts) ─────────────

export async function createLoginLink(stripeAccountId: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accounts.createLoginLink(stripeAccountId);
  return link.url;
}

// ─── Sync account status from Stripe → DB ────────────────────────────────────

export async function syncAccountStatus(orgId: string, stripeAccountId: string): Promise<void> {
  const stripe = getStripe();

  const account = await stripe.accounts.retrieve(stripeAccountId);
  const status = deriveConnectStatus(account);

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      stripeAccountStatus: status,
      stripeAccountDetailsSubmitted: account.details_submitted ?? false,
    },
  });
}

// ─── Create ACH PaymentIntent ─────────────────────────────────────────────────

export interface CreatePaymentIntentOptions {
  leaseId: string;
  paymentId: string;
  tenantName: string;
  amount: number; // dollars — converted to cents internally
  stripeAccountId: string;
  description?: string;
}

export async function createPaymentIntent(
  opts: CreatePaymentIntentOptions
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();

  // Creates the server-side PaymentIntent. The tenant must then supply their bank
  // account via Stripe.js / Financial Connections on the client to move the PI out
  // of `requires_payment_method` and trigger the ACH debit.
  return stripe.paymentIntents.create({
    amount: Math.round(opts.amount * 100),
    currency: 'usd',
    payment_method_types: ['us_bank_account'],
    transfer_data: { destination: opts.stripeAccountId },
    description: opts.description ?? `Rent payment for lease ${opts.leaseId}`,
    metadata: {
      leaseId: opts.leaseId,
      paymentId: opts.paymentId,
      tenantName: opts.tenantName,
    },
  });
}

// ─── Cancel a PaymentIntent ───────────────────────────────────────────────────

export async function cancelPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  try {
    return await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (err) {
    const stripeErr = err as { code?: string; message?: string };
    if (stripeErr?.code === 'payment_intent_unexpected_state') {
      throw new AppError(400, 'PAYMENT_INTENT_CANNOT_CANCEL', stripeErr.message ?? 'Cannot cancel this PaymentIntent');
    }
    throw err;
  }
}
