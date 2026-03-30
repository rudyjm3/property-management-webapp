import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@propflow/db';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth, requireSupabaseAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/v1/auth/me
 * Returns the authenticated user's profile + organization context.
 * Used by the web client on startup to determine which org to operate on.
 */
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        avatarUrl: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            timezone: true,
            dateFormat: true,
            planTier: true,
            subscriptionStatus: true,
            rentDueDay: true,
            gracePeriodDays: true,
            lateFeeAmount: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
      return;
    }

    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/register
 * Called after Supabase signup to create the User + Organization records in our DB.
 * Body: { name, orgName, orgPhone, timezone }
 */
router.post('/register', requireSupabaseAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, orgName, orgPhone, timezone } = req.body as {
      name: string;
      orgName: string;
      orgPhone?: string;
      timezone?: string;
    };

    if (!name || !orgName) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'name and orgName are required.' } });
      return;
    }

    // Check if this Supabase user already has a DB record
    const existing = await prisma.user.findUnique({
      where: { supabaseUserId: req.user!.supabaseUserId },
    });
    if (existing) {
      res.status(409).json({ error: { code: 'ALREADY_REGISTERED', message: 'User already registered.' } });
      return;
    }

    // Get email from the Supabase token
    const { data: { user: supabaseUser } } = await supabaseAdmin.auth.admin.getUserById(req.user!.supabaseUserId);
    const email = supabaseUser?.email ?? '';

    // Create org slug from org name
    const slug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)
      + '-'
      + Math.random().toString(36).slice(2, 7);

    // Create organization + owner user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug,
          phone: orgPhone ?? null,
          timezone: timezone ?? 'America/Chicago',
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          supabaseUserId: req.user!.supabaseUserId,
          email,
          name,
          role: 'owner',
          status: 'active',
        },
      });

      return { org, user };
    });

    res.status(201).json({
      data: {
        userId: result.user.id,
        orgId: result.org.id,
        orgName: result.org.name,
        role: result.user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
