import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@propflow/db';
import { requireAuth, requireOrg, requireRoles } from '../middleware/auth';
import { ALL_MODULE_KEYS, type ModuleKey } from '@propflow/shared';

const router = Router({ mergeParams: true });
const requireSettingsAccess = requireRoles(['owner', 'manager']);
const PLAN_TIERS = ['starter', 'pro', 'enterprise'] as const;

/**
 * PATCH /api/v1/organizations/:orgId
 * Update organization settings (name, phone, email, timezone, rent defaults, etc.)
 */
router.patch(
  '/',
  requireAuth,
  requireOrg,
  requireSettingsAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const {
        name,
        phone,
        email,
        timezone,
        dateFormat,
        logoUrl,
        planTier,
        rentDueDay,
        gracePeriodDays,
        lateFeeAmount,
        activeModules,
        defaultManagementFeePct,
      } = req.body as {
        name?: string;
        phone?: string;
        email?: string;
        timezone?: string;
        dateFormat?: string;
        logoUrl?: string | null;
        planTier?: (typeof PLAN_TIERS)[number];
        rentDueDay?: number;
        gracePeriodDays?: number;
        lateFeeAmount?: number;
        activeModules?: ModuleKey[];
        defaultManagementFeePct?: number;
      };

      if (planTier !== undefined && !PLAN_TIERS.includes(planTier)) {
        res.status(400).json({
          error: {
            code: 'INVALID_PLAN_TIER',
            message: 'planTier must be one of: starter, pro, enterprise.',
          },
        });
        return;
      }

      // Temporary on/off mechanism ahead of Stripe Subscription Item billing:
      // any owner/manager can toggle their org's active modules directly. Once
      // module billing ships, this should move behind a paid-subscription check.
      if (activeModules !== undefined) {
        if (
          !Array.isArray(activeModules) ||
          activeModules.some((key) => !ALL_MODULE_KEYS.includes(key))
        ) {
          res.status(400).json({
            error: {
              code: 'INVALID_MODULE_KEY',
              message: `activeModules must only contain: ${ALL_MODULE_KEYS.join(', ')}.`,
            },
          });
          return;
        }
      }

      const org = await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(email !== undefined && { email }),
          ...(timezone !== undefined && { timezone }),
          ...(dateFormat !== undefined && { dateFormat }),
          ...(logoUrl !== undefined && { logoUrl }),
          ...(planTier !== undefined && { planTier }),
          ...(rentDueDay !== undefined && { rentDueDay }),
          ...(gracePeriodDays !== undefined && { gracePeriodDays }),
          ...(lateFeeAmount !== undefined && { lateFeeAmount }),
          ...(activeModules !== undefined && { activeModules: [...new Set(activeModules)] }),
          ...(defaultManagementFeePct !== undefined && { defaultManagementFeePct }),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          phone: true,
          email: true,
          timezone: true,
          dateFormat: true,
          rentDueDay: true,
          gracePeriodDays: true,
          lateFeeAmount: true,
          planTier: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          stripeAccountId: true,
          stripeAccountStatus: true,
          activeModules: true,
          defaultManagementFeePct: true,
        },
      });

      res.json({ data: org });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/organizations/:orgId
 * Get organization details.
 */
router.get(
  '/',
  requireAuth,
  requireOrg,
  requireSettingsAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          phone: true,
          email: true,
          timezone: true,
          dateFormat: true,
          rentDueDay: true,
          gracePeriodDays: true,
          lateFeeAmount: true,
          planTier: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          stripeAccountId: true,
          stripeAccountStatus: true,
          activeModules: true,
          defaultManagementFeePct: true,
        },
      });

      if (!org) {
        res
          .status(404)
          .json({ error: { code: 'ORG_NOT_FOUND', message: 'Organization not found.' } });
        return;
      }

      res.json({ data: org });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
