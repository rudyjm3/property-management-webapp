import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@propflow/db';
import { requireAuth, requireOrg } from '../middleware/auth';

const router = Router({ mergeParams: true });

/**
 * PATCH /api/v1/organizations/:orgId
 * Update organization settings (name, phone, email, timezone, rent defaults, etc.)
 */
router.patch('/', requireAuth, requireOrg, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      phone,
      email,
      timezone,
      dateFormat,
      rentDueDay,
      gracePeriodDays,
      lateFeeAmount,
    } = req.body as {
      name?: string;
      phone?: string;
      email?: string;
      timezone?: string;
      dateFormat?: string;
      rentDueDay?: number;
      gracePeriodDays?: number;
      lateFeeAmount?: number;
    };

    const org = await prisma.organization.update({
      where: { id: req.params.orgId },
      data: {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(timezone !== undefined && { timezone }),
        ...(dateFormat !== undefined && { dateFormat }),
        ...(rentDueDay !== undefined && { rentDueDay }),
        ...(gracePeriodDays !== undefined && { gracePeriodDays }),
        ...(lateFeeAmount !== undefined && { lateFeeAmount }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        email: true,
        timezone: true,
        dateFormat: true,
        rentDueDay: true,
        gracePeriodDays: true,
        lateFeeAmount: true,
        planTier: true,
        subscriptionStatus: true,
      },
    });

    res.json({ data: org });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/organizations/:orgId
 * Get organization details.
 */
router.get('/', requireAuth, requireOrg, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        email: true,
        timezone: true,
        dateFormat: true,
        rentDueDay: true,
        gracePeriodDays: true,
        lateFeeAmount: true,
        planTier: true,
        subscriptionStatus: true,
        stripeAccountStatus: true,
      },
    });

    if (!org) {
      res.status(404).json({ error: { code: 'ORG_NOT_FOUND', message: 'Organization not found.' } });
      return;
    }

    res.json({ data: org });
  } catch (err) {
    next(err);
  }
});

export default router;
