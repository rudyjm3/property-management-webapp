import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { createTenantSchema, updateTenantSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as tenantService from '../services/tenant.service';
import { supabaseAdmin } from '../lib/supabase';
import { prisma } from '@propflow/db';
import { requireRoles } from '../middleware/auth';
import { sendTenantPortalInviteEmail } from '../services/tenant-invite-email.service';
import { AppError } from '../middleware/error-handler';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

async function findSupabaseUserIdByEmail(email: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? '').trim().toLowerCase() === normalizedEmail);
    if (match) return match.id;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

function isAlreadyRegisteredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('already been registered') ||
    lower.includes('already registered') ||
    lower.includes('already exists')
  );
}

function isUserNotFoundError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('user not found') || lower.includes('email not found');
}

function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars, e.g. "A3F2B1C9"
}

async function stampInviteCode(tenantId: string): Promise<string> {
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { inviteCode: code, inviteCodeExpiresAt: expiresAt },
  });
  return code;
}

async function sendInviteEmailOrFail(params: {
  tenantName: string;
  tenantEmail: string;
  actionLink: string;
  organizationName: string;
  inviteCode: string;
}) {
  try {
    await sendTenantPortalInviteEmail(params);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send invite email.';
    throw new AppError(400, 'INVITE_EMAIL_FAILED', message);
  }
}

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
    const tenant = await tenantService.getTenant(
      req.params.orgId as string,
      req.params.tenantId as string
    );
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/tenants
router.post(
  '/',
  requireManagerAccess,
  validate(createTenantSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = await tenantService.createTenant(req.params.orgId as string, req.body);
      res.status(201).json({ data: tenant });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/organizations/:orgId/tenants/:tenantId
router.patch(
  '/:tenantId',
  requireManagerAccess,
  validate(updateTenantSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Fetch existing tenant before update so we can detect email changes
      const existing = await prisma.tenant.findFirst({
        where: {
          id: req.params.tenantId as string,
          organizationId: req.params.orgId as string,
          deletedAt: null,
        },
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
          email_confirm: true,
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
  }
);

// POST /api/v1/organizations/:orgId/tenants/:tenantId/invite-portal
router.post(
  '/:tenantId/invite-portal',
  requireManagerAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = await prisma.tenant.findFirst({
        where: {
          id: req.params.tenantId as string,
          organizationId: req.params.orgId as string,
          deletedAt: null,
        },
        select: { id: true, email: true, name: true, supabaseUserId: true },
      });

      if (!tenant) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
        return;
      }

      const redirectTo = `${process.env.APP_URL}/reset-password`;
      const normalizedEmail = tenant.email.trim().toLowerCase();
      const org = await prisma.organization.findUnique({
        where: { id: req.params.orgId as string },
        select: { name: true },
      });
      const organizationName = org?.name || 'PropFlow';

      if (tenant.supabaseUserId) {
        // Heal stale links where tenant.supabaseUserId points to a deleted Supabase user.
        const { data: linkedUserData, error: linkedUserError } =
          await supabaseAdmin.auth.admin.getUserById(tenant.supabaseUserId);
        if (linkedUserError || !linkedUserData?.user) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { supabaseUserId: null, portalStatus: 'never_logged_in' },
          });
        }
      }

      // Re-read the tenant in case we had to clear a stale supabaseUserId.
      const currentTenant = await prisma.tenant.findUnique({
        where: { id: tenant.id },
        select: { id: true, email: true, name: true, supabaseUserId: true },
      });
      if (!currentTenant) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
        return;
      }

      if (currentTenant.supabaseUserId) {
        // Already registered — generate a server-side recovery link (token_hash based, no PKCE)
        // resetPasswordForEmail() uses PKCE which requires a code_verifier cookie set by the
        // browser client — calling it from the API server breaks that flow.
        const recoveryResult = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: normalizedEmail,
          options: { redirectTo },
        });
        if (!recoveryResult.error) {
          const actionLink = recoveryResult.data?.properties?.action_link;
          if (!actionLink) {
            res.status(400).json({
              error: { code: 'INVITE_FAILED', message: 'Invite link could not be generated.' },
            });
            return;
          }
          const inviteCode = await stampInviteCode(currentTenant.id);
          await sendInviteEmailOrFail({
            tenantName: currentTenant.name,
            tenantEmail: normalizedEmail,
            actionLink,
            organizationName,
            inviteCode,
          });
          res.json({ data: { message: 'Invite sent', email: currentTenant.email } });
          return;
        }

        if (!isUserNotFoundError(recoveryResult.error.message)) {
          res.status(400).json({
            error: { code: 'INVITE_FAILED', message: recoveryResult.error.message },
          });
          return;
        }

        // Linked user vanished from Supabase; proceed as first-invite flow.
        await prisma.tenant.update({
          where: { id: currentTenant.id },
          data: { supabaseUserId: null, portalStatus: 'never_logged_in' },
        });
      }

      {
        // First invite — create the Supabase auth account and get the invite link in one step.
        // generateLink creates the user without sending a Supabase email; Resend handles delivery.
        const inviteResult = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email: normalizedEmail,
          options: {
            redirectTo,
            data: { tenantId: currentTenant.id, name: currentTenant.name },
          },
        });
        if (inviteResult.error) {
          if (!isAlreadyRegisteredError(inviteResult.error.message)) {
            res.status(400).json({ error: { code: 'INVITE_FAILED', message: inviteResult.error.message } });
            return;
          }

          const existingUserId = await findSupabaseUserIdByEmail(normalizedEmail);
          const recoveryResult = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: normalizedEmail,
            options: { redirectTo },
          });
          if (recoveryResult.error) {
            res
              .status(400)
              .json({ error: { code: 'INVITE_FAILED', message: recoveryResult.error.message } });
            return;
          }
          const actionLink = recoveryResult.data?.properties?.action_link;
          if (!actionLink) {
            res.status(400).json({
              error: { code: 'INVITE_FAILED', message: 'Invite link could not be generated.' },
            });
            return;
          }
          const inviteCode2 = await stampInviteCode(currentTenant.id);
          await sendInviteEmailOrFail({
            tenantName: currentTenant.name,
            tenantEmail: normalizedEmail,
            actionLink,
            organizationName,
            inviteCode: inviteCode2,
          });

          await prisma.tenant.update({
            where: { id: currentTenant.id },
            data: {
              ...(existingUserId ? { supabaseUserId: existingUserId } : {}),
              portalStatus: 'invited',
            },
          });

          res.json({ data: { message: 'Invite sent', email: normalizedEmail } });
          return;
        }
        if (inviteResult.data?.user) {
          const inviteCode3 = await stampInviteCode(currentTenant.id);
          const actionLink = inviteResult.data.properties?.action_link ?? redirectTo;
          await sendInviteEmailOrFail({
            tenantName: currentTenant.name,
            tenantEmail: normalizedEmail,
            actionLink,
            organizationName,
            inviteCode: inviteCode3,
          });
          await prisma.tenant.update({
            where: { id: currentTenant.id },
            data: { supabaseUserId: inviteResult.data.user.id, portalStatus: 'invited' },
          });
        }
      }

      res.json({ data: { message: 'Invite sent', email: currentTenant.email } });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/organizations/:orgId/tenants/:tenantId
router.delete(
  '/:tenantId',
  requireManagerAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tenantService.deleteTenant(req.params.orgId as string, req.params.tenantId as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
