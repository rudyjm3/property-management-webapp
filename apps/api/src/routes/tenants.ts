import { Router, Request, Response, NextFunction } from 'express';
import { createTenantSchema, updateTenantSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as tenantService from '../services/tenant.service';
import { supabaseAdmin } from '../lib/supabase';
import { prisma } from '@propflow/db';
import { requireRoles } from '../middleware/auth';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

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
router.post('/', requireManagerAccess, validate(createTenantSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.createTenant(req.params.orgId as string, req.body);
    res.status(201).json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/tenants/:tenantId
router.patch('/:tenantId', requireManagerAccess, validate(updateTenantSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Fetch existing tenant before update so we can detect email changes
    const existing = await prisma.tenant.findFirst({
      where: { id: req.params.tenantId as string, organizationId: req.params.orgId as string, deletedAt: null },
      select: { email: true, supabaseUserId: true },
    });

    const tenant = await tenantService.updateTenant(
      req.params.orgId as string,
      req.params.tenantId as string,
      req.body
    );

    // If email changed and tenant has a Supabase auth account, sync the email there too
    if (
      existing &&
      existing.supabaseUserId &&
      req.body.email &&
      req.body.email !== existing.email
    ) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.supabaseUserId, {
        email: req.body.email,
      });
      if (error) {
        console.error('Failed to sync tenant email to Supabase Auth:', error.message);
        // Non-fatal — Prisma record is updated; log and continue
      }
    }

    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/tenants/:tenantId/invite-portal
router.post('/:tenantId/invite-portal', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { id: req.params.tenantId as string, organizationId: req.params.orgId as string, deletedAt: null },
      select: { id: true, email: true, name: true, supabaseUserId: true },
    });

    if (!tenant) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
      return;
    }

    const redirectTo = `${process.env.APP_URL}/auth/callback?next=/reset-password`;

    if (tenant.supabaseUserId) {
      // Already registered — generate a server-side recovery link (token_hash based, no PKCE)
      // resetPasswordForEmail() uses PKCE which requires a code_verifier cookie set by the
      // browser client — calling it from the API server breaks that flow.
      const { error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: tenant.email,
        options: { redirectTo },
      });
      if (error) {
        res.status(400).json({ error: { code: 'INVITE_FAILED', message: error.message } });
        return;
      }
    } else {
      // First invite — create the Supabase auth account
      const { data: { user }, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(tenant.email, {
        redirectTo,
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
    }

    res.json({ data: { message: 'Invite sent', email: tenant.email } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/tenants/:tenantId
router.delete('/:tenantId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tenantService.deleteTenant(req.params.orgId as string, req.params.tenantId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
