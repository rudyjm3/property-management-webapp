import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '@propflow/db';
import * as stripeService from '../services/stripe.service';
import * as ledgerService from '../services/ledger.service';

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

  try {
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
        const paymentId = pi.metadata?.paymentId;
        if (!paymentId) break;

        const payment = await prisma.payment.findFirst({
          where: { id: paymentId },
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

        await prisma.$transaction(async (tx) => {
          if (payment.status !== 'completed') {
            await tx.payment.update({
              where: { id: paymentId },
              data: { status: 'completed', paidAt: new Date() },
            });
          }
          await ledgerService.createLedgerEntry({
            organizationId: orgId,
            paymentId,
            type: 'credit',
            amount: Number(payment.amount),
            description: `ACH payment received — ${payment.type} for lease ${payment.leaseId}`,
            stripeEventId: event.id,
          });
        });

        console.log(`[stripe-webhook] PaymentIntent succeeded for payment ${paymentId}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const paymentId = pi.metadata?.paymentId;
        if (!paymentId) break;

        await prisma.payment.updateMany({
          where: { id: paymentId, status: { not: 'completed' } },
          data: { status: 'failed' },
        });

        console.log(`[stripe-webhook] PaymentIntent failed for payment ${paymentId}`);
        break;
      }

      case 'payment_intent.processing': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const paymentId = pi.metadata?.paymentId;
        if (!paymentId) break;

        await prisma.payment.updateMany({
          where: { id: paymentId, status: 'pending' },
          data: { notes: 'ACH debit processing via Stripe' },
        });

        console.log(`[stripe-webhook] PaymentIntent processing for payment ${paymentId}`);
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

      default:
        // Acknowledge unhandled events without processing
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] Failed to process event ${event.type}:`, err);
    res.status(500).json({ error: 'Webhook processing failed' });
    return;
  }

  res.status(200).json({ received: true });
}
