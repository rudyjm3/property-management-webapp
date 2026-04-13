import { Router, Request, Response, NextFunction } from 'express';
import { prisma, UserRole, UserStatus } from '@propflow/db';
import { z } from 'zod';
import { requireAuth, requireOrg, requireRoles } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';

const router = Router({ mergeParams: true });
const requireSettingsAccess = requireRoles(['owner', 'manager']);

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.nativeEnum(UserRole).default(UserRole.manager),
});

const updateSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  notifRentOverdue: z.enum(['email', 'in_app', 'both', 'none']).optional(),
  notifWorkOrder: z.enum(['email', 'in_app', 'both', 'none']).optional(),
  notifLeaseExpiry: z.enum(['email', 'in_app', 'both', 'none']).optional(),
  notifNewMessage: z.enum(['email', 'in_app', 'both', 'none']).optional(),
});

async function ensurePrivilegedAccessRemains(
  organizationId: string,
  targetUserId: string
): Promise<boolean> {
  const remaining = await prisma.user.count({
    where: {
      organizationId,
      id: { not: targetUserId },
      status: UserStatus.active,
      role: { in: [UserRole.owner, UserRole.manager] },
    },
  });
  return remaining > 0;
}

/**
 * GET /api/v1/organizations/:orgId/staff
 * List all staff members.
 */
router.get(
  '/',
  requireAuth,
  requireOrg,
  requireSettingsAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const { includeInactive } = req.query as { includeInactive?: string };
      const staff = await prisma.user.findMany({
        where: {
          organizationId: orgId,
          ...(includeInactive !== 'true' && { status: UserStatus.active }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          phone: true,
          avatarUrl: true,
          invitedAt: true,
          lastLoginAt: true,
          notifRentOverdue: true,
          notifWorkOrder: true,
          notifLeaseExpiry: true,
          notifNewMessage: true,
        },
        orderBy: { name: 'asc' },
      });
      res.json({ data: staff });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/organizations/:orgId/staff/invite
 * Invite a new team member via email. Creates a pending User record and sends a Supabase invite.
 */
router.post(
  '/invite',
  requireAuth,
  requireOrg,
  requireSettingsAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const parsed = inviteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: parsed.error.issues[0]?.message ?? 'Invalid invite payload.',
          },
        });
        return;
      }

      const { email, name, role } = parsed.data;

      // Check if user already exists in this org
      const existing = await prisma.user.findFirst({
        where: { organizationId: orgId, email },
      });
      if (existing) {
        res.status(409).json({
          error: {
            code: 'ALREADY_EXISTS',
            message: 'A user with this email already exists in your organization.',
          },
        });
        return;
      }

      // Create the user record as invited
      const invitedUser = await prisma.user.create({
        data: {
          organizationId: orgId,
          email,
          name,
          role,
          status: UserStatus.invited,
          invitedAt: new Date(),
        },
        select: { id: true, email: true, name: true, role: true, status: true, invitedAt: true },
      });

      // Send Supabase invite email so they can set a password
      const onboardingNext = encodeURIComponent('/onboarding?invited=true');
      const {
        data: { user: supabaseUser },
        error,
      } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.APP_URL}/auth/callback?next=${onboardingNext}`,
        data: { organizationId: orgId, role, name },
      });

      if (error) {
        // Clean up the DB record if invite failed
        await prisma.user.delete({ where: { id: invitedUser.id } });
        console.error('Supabase invite error:', error);
        res.status(400).json({
          error: {
            code: 'INVITE_FAILED',
            message:
              error.message ||
              'Failed to send invite email. The address may already be registered.',
          },
        });
        return;
      }

      // Link the Supabase user ID to our record
      if (supabaseUser) {
        await prisma.user.update({
          where: { id: invitedUser.id },
          data: { supabaseUserId: supabaseUser.id },
        });
      }

      res.status(201).json({ data: invitedUser });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/organizations/:orgId/staff/:userId
 * Update a staff member (role, status, notification prefs).
 */
router.patch(
  '/:userId',
  requireAuth,
  requireOrg,
  requireSettingsAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const userId = req.params.userId as string;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: parsed.error.issues[0]?.message ?? 'Invalid update payload.',
          },
        });
        return;
      }

      const target = await prisma.user.findFirst({
        where: { id: userId, organizationId: orgId },
        select: { id: true, role: true, status: true },
      });

      if (!target) {
        res.status(404).json({
          error: {
            code: 'STAFF_NOT_FOUND',
            message: 'Staff member not found in this organization.',
          },
        });
        return;
      }

      const nextRole = parsed.data.role ?? target.role;
      const nextStatus = parsed.data.status ?? target.status;
      const nextIsPrivilegedAndActive =
        nextStatus === UserStatus.active &&
        (nextRole === UserRole.owner || nextRole === UserRole.manager);

      // Prevent current caller from locking themselves out of settings access.
      if (req.user?.userId === target.id && !nextIsPrivilegedAndActive) {
        res.status(400).json({
          error: {
            code: 'SELF_LOCKOUT_BLOCKED',
            message: 'You cannot remove your own owner/manager active access.',
          },
        });
        return;
      }

      const currentlyPrivilegedAndActive =
        target.status === UserStatus.active &&
        (target.role === UserRole.owner || target.role === UserRole.manager);

      if (currentlyPrivilegedAndActive && !nextIsPrivilegedAndActive) {
        const hasOtherPrivileged = await ensurePrivilegedAccessRemains(orgId, target.id);
        if (!hasOtherPrivileged) {
          res.status(400).json({
            error: {
              code: 'LAST_PRIVILEGED_USER',
              message:
                'Cannot remove access from the last active owner/manager in this organization.',
            },
          });
          return;
        }
      }

      const user = await prisma.user.update({
        where: { id: target.id },
        data: {
          ...(parsed.data.role !== undefined && { role: parsed.data.role }),
          ...(parsed.data.status !== undefined && { status: parsed.data.status }),
          ...(parsed.data.notifRentOverdue !== undefined && {
            notifRentOverdue: parsed.data.notifRentOverdue,
          }),
          ...(parsed.data.notifWorkOrder !== undefined && {
            notifWorkOrder: parsed.data.notifWorkOrder,
          }),
          ...(parsed.data.notifLeaseExpiry !== undefined && {
            notifLeaseExpiry: parsed.data.notifLeaseExpiry,
          }),
          ...(parsed.data.notifNewMessage !== undefined && {
            notifNewMessage: parsed.data.notifNewMessage,
          }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          notifRentOverdue: true,
          notifWorkOrder: true,
          notifLeaseExpiry: true,
          notifNewMessage: true,
        },
      });
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
