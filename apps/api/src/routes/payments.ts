import { Router, Request, Response, NextFunction } from 'express';
import {
  createPaymentSchema,
  updatePaymentSchema,
  listPaymentsFiltersSchema,
  recordPartialPaymentSchema,
} from '@propflow/shared';
import { MODULE_KEYS } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as paymentService from '../services/payment.service';
import * as stripeService from '../services/stripe.service';
import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import { requireRoles } from '../middleware/auth';
import { requireModule } from '../middleware/module-gate';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);
// Card payments and partial-payment recording are Advanced Payments &
// Accounting (Module 4) features — gated per-route since the rest of this
// router (ACH, manual full-payment recording) stays ungated base product.
const requireAccountingModule = requireModule(MODULE_KEYS.ADVANCED_PAYMENTS_ACCOUNTING);

// GET /api/v1/organizations/:orgId/payments/stats
router.get('/stats', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await paymentService.getPaymentStats(req.params.orgId as string);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/payments
router.get('/', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = listPaymentsFiltersSchema.parse(req.query);
    const result = await paymentService.listPayments(req.params.orgId as string, filters);
    res.json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/payments/:paymentId
router.get('/:paymentId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/', requireManagerAccess, validate(createPaymentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await paymentService.createPayment(req.params.orgId as string, req.body);
    res.status(201).json({ data: payment });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/payments/:paymentId
router.patch('/:paymentId', requireManagerAccess, validate(updatePaymentSchema), async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:paymentId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:paymentId/initiate-ach', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
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
    // — but only if it's actually an ACH intent. A card intent (initiated via
    // initiate-card, possibly by the tenant) has payment_method_types: ['card']
    // and can't collect a bank account, so silently handing it back here would
    // strand any ACH-only caller (e.g. the mobile app).
    if (payment.stripePaymentIntentId) {
      if (payment.method !== 'ach') {
        throw new AppError(
          409,
          'PAYMENT_METHOD_MISMATCH',
          `This payment already has a ${payment.method} PaymentIntent in progress. Cancel it before initiating ACH.`
        );
      }
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
      unitNumber: payment.lease.unit.unitNumber,
      propertyName: payment.lease.unit.property.name,
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

// POST /api/v1/organizations/:orgId/payments/:paymentId/initiate-card
// Advanced Payments & Accounting (Module 4) — card payments alongside ACH.
router.post('/:paymentId/initiate-card', requireManagerAccess, requireAccountingModule, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const paymentId = req.params.paymentId as string;

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (org.stripeAccountId) {
      await stripeService.syncAccountStatus(orgId, org.stripeAccountId);
    }
    const freshOrg = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

    if (freshOrg.stripeAccountStatus !== 'active') {
      throw new AppError(400, 'CONNECT_NOT_ACTIVE', 'Your Stripe bank account must be fully connected before initiating card payments.');
    }

    const payment = await paymentService.getPayment(orgId, paymentId);

    // Same method-mismatch guard as initiate-ach, in the other direction.
    if (payment.stripePaymentIntentId) {
      if (payment.method !== 'card') {
        throw new AppError(
          409,
          'PAYMENT_METHOD_MISMATCH',
          `This payment already has a ${payment.method} PaymentIntent in progress. Cancel it before initiating a card payment.`
        );
      }
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });
      const pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
      return res.json({ data: { clientSecret: pi.client_secret, paymentIntentId: pi.id, status: pi.status } });
    }

    if (payment.status !== 'pending') {
      throw new AppError(400, 'PAYMENT_NOT_PENDING', 'Only pending payments can be initiated via card.');
    }

    const pi = await stripeService.createPaymentIntent({
      leaseId: payment.leaseId,
      paymentId,
      tenantName: payment.tenant.name,
      unitNumber: payment.lease.unit.unitNumber,
      propertyName: payment.lease.unit.property.name,
      amount: Number(payment.amount),
      stripeAccountId: freshOrg.stripeAccountId!,
      method: 'card',
    });

    await prisma.payment.update({
      where: { id: paymentId },
      data: { stripePaymentIntentId: pi.id, method: 'card' },
    });

    res.json({ data: { clientSecret: pi.client_secret, paymentIntentId: pi.id, status: pi.status } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/payments/:paymentId/record-partial
// Advanced Payments & Accounting (Module 4) — accept a manually-recorded
// payment less than the amount due, and carry the remainder forward as a
// new pending payment. Online ACH/card checkout always collects the full
// amount, so this only applies to manually-recorded payments.
router.post('/:paymentId/record-partial', requireManagerAccess, requireAccountingModule, validate(recordPartialPaymentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await paymentService.recordPartialPayment(
      req.params.orgId as string,
      req.params.paymentId as string,
      req.body
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/payments/:paymentId/cancel-ach
router.post('/:paymentId/cancel-ach', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
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

// POST /api/v1/organizations/:orgId/payments/:paymentId/void
router.post('/:paymentId/void', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body as { reason?: string };
    if (!reason || !reason.trim()) {
      throw new AppError(400, 'VOID_REASON_REQUIRED', 'A reason is required to void a payment.');
    }
    const payment = await paymentService.voidPayment(
      req.params.orgId as string,
      req.params.paymentId as string,
      reason
    );
    res.json({ data: payment });
  } catch (err) {
    next(err);
  }
});

export default router;
