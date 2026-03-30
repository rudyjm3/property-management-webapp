import { Router, Request, Response, NextFunction } from 'express';
import { prisma, UserStatus } from '@propflow/db';
import { requireAuth, requireOrg } from '../middleware/auth';

const router = Router({ mergeParams: true });

/**
 * GET /api/v1/organizations/:orgId/staff
 * List all staff members.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { includeInactive } = req.query as { includeInactive?: string };
    const staff = await prisma.user.findMany({
      where: {
        organizationId: req.params.orgId,
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
});

/**
 * POST /api/v1/organizations/:orgId/staff/invite
 * Invite a new team member via email. Creates a pending User record and sends a Supabase invite.
 */
router.post('/invite', requireAuth, requireOrg, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, role = 'manager' } = req.body as { email: string; name: string; role?: string };

    if (!email || !name) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'email and name are required.' } });
      return;
    }

    // Check if user already exists in this org
    const existing = await prisma.user.findFirst({
      where: { organizationId: req.params.orgId, email },
    });
    if (existing) {
      res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: 'A user with this email already exists in your organization.' } });
      return;
    }

    // Create the user record as invited
    const invitedUser = await prisma.user.create({
      data: {
        organizationId: req.params.orgId,
        email,
        name,
        role: role as any,
        status: UserStatus.invited,
        invitedAt: new Date(),
      },
      select: { id: true, email: true, name: true, role: true, status: true, invitedAt: true },
    });

    // Send Supabase invite email so they can set a password
    const { data: { user: supabaseUser }, error } = await (await import('../lib/supabase')).supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.APP_URL}/onboarding?invited=true`,
      data: {
        organizationId: req.params.orgId,
        role,
        name,
      },
    });

    if (error) {
      // Clean up the DB record if invite failed
      await prisma.user.delete({ where: { id: invitedUser.id } });
      throw error;
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
});

/**
 * PATCH /api/v1/organizations/:orgId/staff/:userId
 * Update a staff member (role, status, notification prefs).
 */
router.patch('/:userId', requireAuth, requireOrg, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      role,
      status,
      notifRentOverdue,
      notifWorkOrder,
      notifLeaseExpiry,
      notifNewMessage,
    } = req.body as {
      role?: string;
      status?: string;
      notifRentOverdue?: string;
      notifWorkOrder?: string;
      notifLeaseExpiry?: string;
      notifNewMessage?: string;
    };

    const user = await prisma.user.update({
      where: { id: req.params.userId, organizationId: req.params.orgId },
      data: {
        ...(role !== undefined && { role: role as any }),
        ...(status !== undefined && { status: status as any }),
        ...(notifRentOverdue !== undefined && { notifRentOverdue }),
        ...(notifWorkOrder !== undefined && { notifWorkOrder }),
        ...(notifLeaseExpiry !== undefined && { notifLeaseExpiry }),
        ...(notifNewMessage !== undefined && { notifNewMessage }),
      },
      select: { id: true, name: true, email: true, role: true, status: true, notifRentOverdue: true, notifWorkOrder: true, notifLeaseExpiry: true, notifNewMessage: true },
    });
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

export default router;
