import { Router, Request, Response, NextFunction } from 'express';
import { createTenantSchema, updateTenantSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as tenantService from '../services/tenant.service';
import { supabaseAdmin } from '../lib/supabase';
import { prisma } from '@propflow/db';

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

// POST /api/v1/organizations/:orgId/tenants/:tenantId/invite-portal
router.post('/:tenantId/invite-portal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { id: req.params.tenantId, organizationId: req.params.orgId, deletedAt: null },
      select: { id: true, email: true, name: true, supabaseUserId: true },
    });

    if (!tenant) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
      return;
    }

    const { data: { user }, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(tenant.email, {
      redirectTo: `${process.env.APP_URL}/portal-setup`,
      data: { tenantId: tenant.id, name: tenant.name },
    });

    if (error) {
      res.status(400).json({ error: { code: 'INVITE_FAILED', message: error.message } });
      return;
    }

    if (user) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { supabaseUserId: user.id, portalStatus: 'invited' },
      });
    }

    res.json({ data: { message: 'Invite sent', email: tenant.email } });
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
