import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '@propflow/db';
import * as stripeService from '../services/stripe.service';

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

    default:
      // Acknowledge unhandled events without processing
      break;
  }

  res.status(200).json({ received: true });
}
