import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import * as stripeService from '../services/stripe.service';

const router = Router({ mergeParams: true });

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// GET /api/v1/organizations/:orgId/connect/status
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: req.params.orgId as string },
      select: {
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeAccountDetailsSubmitted: true,
      },
    });
    res.json({ data: org });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/connect/account-link
router.post('/account-link', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const account = await stripeService.getOrCreateConnectAccount(req.params.orgId as string);

    const url = account.details_submitted
      ? await stripeService.createLoginLink(account.id)
      : await stripeService.createAccountLink(
          account.id,
          `${APP_URL}/settings/connect/return`,
          `${APP_URL}/settings/connect/refresh`
        );

    res.status(201).json({ data: { url } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/connect/sync
router.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: req.params.orgId as string },
      select: { stripeAccountId: true },
    });

    if (!org.stripeAccountId) {
      throw new AppError(400, 'CONNECT_NOT_STARTED', 'No Stripe Connect account exists for this organization.');
    }

    await stripeService.syncAccountStatus(req.params.orgId as string, org.stripeAccountId);

    const updated = await prisma.organization.findUniqueOrThrow({
      where: { id: req.params.orgId as string },
      select: {
        stripeAccountStatus: true,
        stripeAccountDetailsSubmitted: true,
      },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
