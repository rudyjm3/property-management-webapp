import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate';
import {
  generateApplicationLinkSchema,
  reviewApplicationSchema,
  listApplicationsSchema,
  signLeaseSchema,
  MODULE_KEYS,
} from '@propflow/shared';
import {
  createApplicationLink,
  listApplications,
  getApplication,
  reviewApplication,
} from '../services/rental-application.service';
import { managerSignLease } from '../services/lease-esignature.service';
import { runScreeningCheck, getScreeningForApplication } from '../services/screening.service';
import { requireModule } from '../middleware/module-gate';

const router = Router({ mergeParams: true });

// POST /organizations/:orgId/application-links
router.post('/application-links', validate(generateApplicationLinkSchema), async (req: Request, res: Response, next: NextFunction) => {
  const orgId = String(req.params.orgId);
  const { unitId } = req.body as { unitId: string };
  try {
    const result = await createApplicationLink(orgId, unitId);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /organizations/:orgId/applications
router.get('/applications', async (req: Request, res: Response, next: NextFunction) => {
  const orgId = String(req.params.orgId);
  const parsed = listApplicationsSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' } });
    return;
  }
  try {
    const result = await listApplications(orgId, parsed.data);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /organizations/:orgId/applications/:id
router.get('/applications/:id', async (req: Request, res: Response, next: NextFunction) => {
  const orgId = String(req.params.orgId);
  const id = String(req.params.id);
  try {
    const app = await getApplication(orgId, id);
    res.json({ data: app });
  } catch (err) {
    next(err);
  }
});

// PATCH /organizations/:orgId/applications/:id/review
router.patch('/applications/:id/review', validate(reviewApplicationSchema), async (req: Request, res: Response, next: NextFunction) => {
  const orgId = String(req.params.orgId);
  const id = String(req.params.id);
  const userId = req.user!.userId;
  try {
    const result = await reviewApplication(orgId, id, userId, req.body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /organizations/:orgId/applications/:id/screening — run a background/
// credit check. Gated per-route (not at router mount) since the rest of
// applicationRoutes ships without Module 1 — see docs/reference/modules.md.
router.post(
  '/applications/:id/screening',
  requireModule(MODULE_KEYS.ADVANCED_TENANT_ONBOARDING),
  async (req: Request, res: Response, next: NextFunction) => {
    const orgId = String(req.params.orgId);
    const id = String(req.params.id);
    const userId = req.user!.userId;
    try {
      const result = await runScreeningCheck(orgId, id, userId);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// GET /organizations/:orgId/applications/:id/screening
router.get(
  '/applications/:id/screening',
  requireModule(MODULE_KEYS.ADVANCED_TENANT_ONBOARDING),
  async (req: Request, res: Response, next: NextFunction) => {
    const orgId = String(req.params.orgId);
    const id = String(req.params.id);
    try {
      const result = await getScreeningForApplication(orgId, id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /organizations/:orgId/leases/:leaseId/sign
router.post('/leases/:leaseId/sign', validate(signLeaseSchema), async (req: Request, res: Response, next: NextFunction) => {
  const orgId = String(req.params.orgId);
  const leaseId = String(req.params.leaseId);
  const userId = req.user!.userId;
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  try {
    const result = await managerSignLease(orgId, leaseId, userId, req.body.signatureName, ip);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
