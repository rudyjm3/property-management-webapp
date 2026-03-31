import { Router, Request, Response, NextFunction } from 'express';
import * as tenantPortalService from '../services/tenant-portal.service';

const router = Router();

// GET /api/v1/tenant/me
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const profile = await tenantPortalService.getTenantProfile(tenantId);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tenant/dashboard
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const dashboard = await tenantPortalService.getTenantDashboard(tenantId);
    res.json({ data: dashboard });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tenant/payments
router.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const result = await tenantPortalService.getTenantPayments(tenantId, { cursor, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tenant/payments/initiate
router.post('/payments/initiate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, orgId } = req.tenant!;
    const { paymentId } = req.body as { paymentId: string };

    if (!paymentId) {
      res.status(400).json({ error: { code: 'MISSING_PAYMENT_ID', message: 'paymentId is required.' } });
      return;
    }

    const result = await tenantPortalService.initiateTenantPayment(tenantId, orgId, paymentId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
