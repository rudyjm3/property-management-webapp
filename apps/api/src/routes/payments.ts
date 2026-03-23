import { Router, Request, Response, NextFunction } from 'express';
import { createPaymentSchema, updatePaymentSchema, listPaymentsFiltersSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as paymentService from '../services/payment.service';

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
    res.json(result);
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

export default router;
