import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@propflow/db';
import * as tenantPortalService from '../services/tenant-portal.service';

import * as messageService from '../services/message.service';
import type { SubmitWorkOrderInput } from '@propflow/shared';

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
    res.json({ data: result });
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


// ─── Work Orders ─────────────────────────────────────────────────────────────

// GET /api/v1/tenant/work-orders
router.get('/work-orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const result = await tenantPortalService.getTenantWorkOrders(tenantId, { cursor, limit });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tenant/work-orders
router.post('/work-orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, orgId } = req.tenant!;
    const body = req.body as SubmitWorkOrderInput;

    if (!body.category || !body.description) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'category and description are required.' } });
      return;
    }

    const workOrder = await tenantPortalService.createTenantWorkOrder(tenantId, orgId, body);
    res.status(201).json({ data: workOrder });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tenant/upload-url
router.post('/upload-url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.tenant!;
    const { fileName, contentType } = req.body as { fileName: string; contentType: string };

    if (!fileName || !contentType) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'fileName and contentType are required.' } });
      return;
    }

    const result = await tenantPortalService.requestTenantUploadUrl(orgId, fileName, contentType);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});


// ─── Messaging ───────────────────────────────────────────────────────────────

// GET /api/v1/tenant/messages/threads
router.get('/messages/threads', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const threads = await messageService.listTenantThreads(tenantId);
    res.json({ data: threads });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tenant/messages/threads/:threadId
router.get('/messages/threads/:threadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const messages = await messageService.getTenantThread(tenantId, req.params.threadId as string);
    res.json({ data: messages });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tenant/messages/:threadId/reply
router.post('/messages/:threadId/reply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, orgId } = req.tenant!;
    const { body } = req.body as { body?: string };
    if (!body?.trim()) {
      res.status(400).json({ error: { code: 'MISSING_BODY', message: 'body is required.' } });
      return;
    }
    const message = await messageService.sendTenantReply(tenantId, orgId, req.params.threadId as string, body.trim());
    res.status(201).json({ data: message });
  } catch (err) {
    next(err);
  }
});

// ─── Push Token ───────────────────────────────────────────────────────────────

// POST /api/v1/tenant/push-token
router.post('/push-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: { code: 'MISSING_TOKEN', message: 'token is required.' } });
      return;
    }
    await prisma.tenant.update({ where: { id: tenantId }, data: { expoPushToken: token } });
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
