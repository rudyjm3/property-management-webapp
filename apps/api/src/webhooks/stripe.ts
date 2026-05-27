import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '@propflow/db';
import * as Sentry from '@sentry/node';
import * as stripeService from '../services/stripe.service';
import * as ledgerService from '../services/ledger.service';

// Explicit allowlist of event types this handler processes.
// Any event outside this set is acknowledged (200) and logged as unhandled.
const HANDLED_EVENTS = new Set([
  'account.updated',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.processing',
  'charge.refunded',
  'refund.updated',
  'setup_intent.succeeded',
]);

const HANDLER_TIMEOUT_MS = 25_000;

async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      const org = await prisma.organization.findFirst({
        where: { stripeAccountId: account.id },
        select: { id: true },
      });

      if (org) {
        await stripeService.syncAccountStatus(org.id, account.id);
        console.log(`[stripe-webhook] Synced connect status for org ${org.id}`);
      }
      break;
    }

    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      // Support multi-payment (paymentIds) and legacy single-payment (paymentId)
      const resolvedIds = pi.metadata?.paymentIds
        ? pi.metadata.paymentIds.split(',').filter(Boolean)
        : pi.metadata?.paymentId
          ? [pi.metadata.paymentId]
          : [];
      if (resolvedIds.length === 0) break;

      // Load all payments; use first to get the lease/org
      const payments = await prisma.payment.findMany({
        where: { id: { in: resolvedIds } },
        include: {
          lease: {
            select: {
              id: true,
              unit: { select: { property: { select: { organizationId: true } } } },
            },
          },
        },
      });
      if (payments.length === 0) break;

      const orgId = payments[0]!.lease.unit.property.organizationId;
      const now = new Date();

      // Update all payment statuses atomically (skip if all already completed)
      const toComplete = payments.filter((p) => p.status !== 'completed');
      if (toComplete.length > 0) {
        await prisma.$transaction(
          toComplete.map((p) =>
            prisma.payment.update({
              where: { id: p.id },
              data: { status: 'completed', paidAt: now },
            })
          )
        );
      }

      // Create ledger entries — suffix event ID with paymentId so each line
      // item gets a unique stripeEventId (the column has a @unique constraint)
      // while still being idempotent on re-delivery.
      for (const payment of payments) {
        await ledgerService.createLedgerEntry({
          organizationId: orgId,
          paymentId: payment.id,
          type: 'credit',
          amount: Number(payment.amount),
          description: `ACH payment received — ${payment.type} for lease ${payment.leaseId}`,
          stripeEventId: `${event.id}:${payment.id}`,
        });
      }

      console.log(`[stripe-webhook] PaymentIntent succeeded for payments: ${resolvedIds.join(', ')}`);
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const resolvedIds = pi.metadata?.paymentIds
        ? pi.metadata.paymentIds.split(',').filter(Boolean)
        : pi.metadata?.paymentId
          ? [pi.metadata.paymentId]
          : [];
      if (resolvedIds.length === 0) break;

      await prisma.payment.updateMany({
        where: { id: { in: resolvedIds }, status: { not: 'completed' } },
        data: { status: 'failed' },
      });

      console.log(`[stripe-webhook] PaymentIntent failed for payments: ${resolvedIds.join(', ')}`);
      break;
    }

    case 'payment_intent.processing': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const resolvedIds = pi.metadata?.paymentIds
        ? pi.metadata.paymentIds.split(',').filter(Boolean)
        : pi.metadata?.paymentId
          ? [pi.metadata.paymentId]
          : [];
      if (resolvedIds.length === 0) break;

      await prisma.payment.updateMany({
        where: { id: { in: resolvedIds }, status: 'pending' },
        data: { notes: 'ACH debit processing via Stripe' },
      });

      console.log(`[stripe-webhook] PaymentIntent processing for payments: ${resolvedIds.join(', ')}`);
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
      if (!piId) break;

      const payment = await prisma.payment.findFirst({
        where: { stripePaymentIntentId: piId },
        include: {
          lease: {
            select: {
              id: true,
              unit: { select: { property: { select: { organizationId: true } } } },
            },
          },
        },
      });
      if (!payment) break;

      const orgId = payment.lease.unit.property.organizationId;
      // Use the incremental amount for this event only — charge.amount_refunded is
      // cumulative, so subtracting the previous value gives the per-event delta.
      const prevAmountRefunded =
        ((event.data.previous_attributes as Record<string, number> | undefined)
          ?.amount_refunded ?? 0);
      const refundAmount = (charge.amount_refunded - prevAmountRefunded) / 100;
      if (refundAmount <= 0) break;

      await prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { id: payment.id, status: { not: 'refunded' } },
          data: { status: 'refunded' },
        });
        await ledgerService.createLedgerEntry({
          organizationId: orgId,
          paymentId: payment.id,
          type: 'debit',
          amount: refundAmount,
          description: `Refund issued for payment ${payment.id}`,
          stripeEventId: event.id,
        });
      });

      console.log(`[stripe-webhook] Charge refunded for payment ${payment.id}`);
      break;
    }

    // refund.updated fires in newer API versions where Stripe uses refund-centric
    // events instead of charge-centric ones. Handles the same logic as charge.refunded.
    case 'refund.updated': {
      const refund = event.data.object as Stripe.Refund;
      if (refund.status !== 'succeeded') break;

      const piId = typeof refund.payment_intent === 'string' ? refund.payment_intent : null;
      if (!piId) break;

      const payment = await prisma.payment.findFirst({
        where: { stripePaymentIntentId: piId },
        include: {
          lease: {
            select: {
              id: true,
              unit: { select: { property: { select: { organizationId: true } } } },
            },
          },
        },
      });
      if (!payment) break;

      const orgId = payment.lease.unit.property.organizationId;
      const refundAmount = refund.amount / 100;

      await prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { id: payment.id, status: { not: 'refunded' } },
          data: { status: 'refunded' },
        });
        await ledgerService.createLedgerEntry({
          organizationId: orgId,
          paymentId: payment.id,
          type: 'debit',
          amount: refundAmount,
          description: `Refund issued for payment ${payment.id}`,
          stripeEventId: event.id,
        });
      });

      console.log(`[stripe-webhook] Refund succeeded for payment ${payment.id}`);
      break;
    }

    case 'setup_intent.succeeded': {
      const si = event.data.object as Stripe.SetupIntent;
      const tenantId = si.metadata?.tenantId;
      if (!tenantId || !si.payment_method) break;

      const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method.id;
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          stripeDefaultPaymentMethodId: pmId,
          autopayEnabled: true,
        },
      });
      console.log(`[stripe-webhook] Autopay setup completed for tenant ${tenantId}`);
      break;
    }

    default:
      // Event is in HANDLED_EVENTS but not matched — shouldn't happen
      console.warn(`[stripe-webhook] Unmatched handled event: ${event.type}`);
      break;
  }
}

export default async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    res.status(500).json({ error: 'Stripe not configured' });
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-02-24.acacia' });
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err);
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    console.log(`[stripe-webhook] Ignored unhandled event type: ${event.type}`);
    res.status(200).json({ received: true });
    return;
  }

  // Process synchronously before acknowledging so Stripe retries on transient failures.
  // The idempotency guard (stripeEventId unique constraint) makes retries safe.
  const timeoutGuard = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Webhook handler timeout after ${HANDLER_TIMEOUT_MS}ms`)), HANDLER_TIMEOUT_MS)
  );

  try {
    await Promise.race([processStripeEvent(event), timeoutGuard]);
    res.status(200).json({ received: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { eventType: event.type, eventId: event.id } });
    console.error(`[stripe-webhook] Failed to process event ${event.type} (${event.id}):`, err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
