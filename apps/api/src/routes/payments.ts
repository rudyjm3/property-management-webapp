import { Router, Request, Response, NextFunction } from 'express';
import { createPaymentSchema, updatePaymentSchema, listPaymentsFiltersSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as paymentService from '../services/payment.service';
import * as stripeService from '../services/stripe.service';
import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';

const router = Router({ mergeParams: true });

// GET /api/v1/organizations/:orgId/payments/stats
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await paymentService.getPaymentStats(req.params.orgId as string);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/payments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = listPaymentsFiltersSchema.parse(req.query);
    const result = await paymentService.listPayments(req.params.orgId as string, filters);
    res.json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/payments/:paymentId
router.get('/:paymentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await paymentService.getPayment(
      req.params.orgId as string,
      req.params.paymentId as string
    );
    res.json({ data: payment });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/payments
router.post('/', validate(createPaymentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await paymentService.createPayment(req.params.orgId as string, req.body);
    res.status(201).json({ data: payment });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/payments/:paymentId
router.patch('/:paymentId', validate(updatePaymentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await paymentService.updatePayment(
      req.params.orgId as string,
      req.params.paymentId as string,
      req.body
    );
    res.json({ data: payment });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/payments/:paymentId
router.delete('/:paymentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await paymentService.deletePayment(
      req.params.orgId as string,
      req.params.paymentId as string
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/payments/:paymentId/initiate-ach
router.post('/:paymentId/initiate-ach', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const paymentId = req.params.paymentId as string;

    // Sync Connect status from Stripe, then fetch fresh org
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (org.stripeAccountId) {
      await stripeService.syncAccountStatus(orgId, org.stripeAccountId);
    }
    const freshOrg = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

    if (freshOrg.stripeAccountStatus !== 'active') {
      throw new AppError(400, 'CONNECT_NOT_ACTIVE', 'Your Stripe bank account must be fully connected before initiating ACH payments.');
    }

    const payment = await paymentService.getPayment(orgId, paymentId);

    // If a PaymentIntent already exists, return the existing one (idempotent)
    if (payment.stripePaymentIntentId) {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });
      const pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
      return res.json({ data: { clientSecret: pi.client_secret, paymentIntentId: pi.id, status: pi.status } });
    }

    if (payment.status !== 'pending') {
      throw new AppError(400, 'PAYMENT_NOT_PENDING', 'Only pending payments can be initiated via ACH.');
    }

    const pi = await stripeService.createPaymentIntent({
      leaseId: payment.leaseId,
      paymentId,
      tenantName: payment.tenant.name,
      amount: Number(payment.amount),
      stripeAccountId: freshOrg.stripeAccountId!,
    });

    await prisma.payment.update({
      where: { id: paymentId },
      data: { stripePaymentIntentId: pi.id, method: 'ach' },
    });

    res.json({ data: { clientSecret: pi.client_secret, paymentIntentId: pi.id, status: pi.status } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/payments/:paymentId/cancel-ach
router.post('/:paymentId/cancel-ach', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const paymentId = req.params.paymentId as string;

    const payment = await paymentService.getPayment(orgId, paymentId);

    if (!payment.stripePaymentIntentId) {
      throw new AppError(400, 'NO_PAYMENT_INTENT', 'This payment has no active PaymentIntent to cancel.');
    }
    if (payment.status === 'completed') {
      throw new AppError(400, 'PAYMENT_ALREADY_COMPLETED', 'A completed payment cannot be cancelled.');
    }

    await stripeService.cancelPaymentIntent(payment.stripePaymentIntentId);

    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'failed', stripePaymentIntentId: null },
    });

    res.json({ data: { cancelled: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
