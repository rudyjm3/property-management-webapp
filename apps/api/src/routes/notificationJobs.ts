import { Router, Request, Response, NextFunction } from 'express';
import * as notifService from '../services/notification.service';

const router = Router({ mergeParams: true });

// Job-trigger endpoints must be called with:
//   Authorization: Bearer <CRON_SECRET>
function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({
      error: { code: 'CRON_NOT_CONFIGURED', message: 'CRON_SECRET is not configured on this server.' },
    });
    return;
  }

  const auth = req.headers.authorization ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (provided !== secret) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing cron secret.' } });
    return;
  }

  next();
}

// POST /api/v1/organizations/:orgId/notifications/jobs/rent-reminders
router.post('/rent-reminders', requireCronSecret, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runRentReminderJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/notifications/jobs/overdue-rent
router.post('/overdue-rent', requireCronSecret, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runOverdueRentJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/notifications/jobs/lease-expiry
router.post('/lease-expiry', requireCronSecret, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runLeaseExpiryJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
