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

// ─── Create combined ACH PaymentIntent for multiple line items ────────────────

export interface CreateMultiPaymentIntentOptions {
  leaseId: string;
  paymentIds: string[]; // all line item payment IDs (rent, late fees, etc.)
  tenantName: string;
  amount: number; // total dollars — converted to cents internally
  stripeAccountId: string;
  description?: string;
}

export async function createMultiPaymentIntent(
  opts: CreateMultiPaymentIntentOptions
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();

  return stripe.paymentIntents.create({
    amount: Math.round(opts.amount * 100),
    currency: 'usd',
    payment_method_types: ['us_bank_account'],
    transfer_data: { destination: opts.stripeAccountId },
    description: opts.description ?? `Payment for lease ${opts.leaseId}`,
    metadata: {
      leaseId: opts.leaseId,
      // Store all IDs comma-separated; webhook uses this to complete all line items
      paymentIds: opts.paymentIds.join(','),
      tenantName: opts.tenantName,
    },
  });
}

// ─── Cancel a PaymentIntent ───────────────────────────────────────────────────

export async function cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  try {
    return await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (err) {
    const stripeErr = err as { code?: string; message?: string };
    if (stripeErr?.code === 'payment_intent_unexpected_state') {
      throw new AppError(
        400,
        'PAYMENT_INTENT_CANNOT_CANCEL',
        stripeErr.message ?? 'Cannot cancel this PaymentIntent'
      );
    }
    throw err;
  }
}

export async function getOrCreateCustomer(orgId: string): Promise<Stripe.Customer> {
  const stripe = getStripe();

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      email: true,
      stripeCustomerId: true,
    },
  });

  if (org.stripeCustomerId) {
    const existing = await stripe.customers.retrieve(org.stripeCustomerId);
    if (!('deleted' in existing && existing.deleted)) {
      return existing as Stripe.Customer;
    }
  }

  const customer = await stripe.customers.create({
    name: org.name,
    email: org.email ?? undefined,
    metadata: { orgId: org.id },
  });

  await prisma.organization.update({
    where: { id: org.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer;
}

export async function createBillingPortalSession(
  orgId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();
  const customer = await getOrCreateCustomer(orgId);
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: returnUrl,
  });
  return session.url;
}

export async function listCustomerInvoices(customerId: string, limit = 12) {
  const stripe = getStripe();
  return stripe.invoices.list({
    customer: customerId,
    limit,
  });
}

export async function getCustomerDefaultPaymentMethod(customerId: string) {
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ['invoice_settings.default_payment_method'],
  });

  if ('deleted' in customer && customer.deleted) {
    return null;
  }

  const paymentMethod = customer.invoice_settings?.default_payment_method;
  if (!paymentMethod || typeof paymentMethod === 'string') {
    return null;
  }

  if (paymentMethod.type === 'card' && paymentMethod.card) {
    return {
      type: 'card',
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
    };
  }

  if (paymentMethod.type === 'us_bank_account' && paymentMethod.us_bank_account) {
    return {
      type: 'us_bank_account',
      bankName: paymentMethod.us_bank_account.bank_name,
      last4: paymentMethod.us_bank_account.last4,
      accountType: paymentMethod.us_bank_account.account_type,
    };
  }

  return {
    type: paymentMethod.type,
  };
}
