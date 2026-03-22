import { Router, Request, Response, NextFunction } from 'express';
import { createTenantSchema, updateTenantSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as tenantService from '../services/tenant.service';

const router = Router({ mergeParams: true });

// GET /api/v1/organizations/:orgId/tenants
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenants = await tenantService.listTenants(req.params.orgId as string);
    res.json({ data: tenants });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/tenants/:tenantId
router.get('/:tenantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.getTenant(req.params.orgId as string, req.params.tenantId as string);
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/tenants
router.post('/', validate(createTenantSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.createTenant(req.params.orgId as string, req.body);
    res.status(201).json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/tenants/:tenantId
router.patch('/:tenantId', validate(updateTenantSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.updateTenant(
      req.params.orgId as string,
      req.params.tenantId as string,
      req.body
    );
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/tenants/:tenantId
router.delete('/:tenantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tenantService.deleteTenant(req.params.orgId as string, req.params.tenantId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
