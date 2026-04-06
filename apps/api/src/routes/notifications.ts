import { Router, Request, Response, NextFunction } from 'express';
import * as notifService from '../services/notification.service';

const router = Router({ mergeParams: true });

// GET /api/v1/organizations/:orgId/notifications?userId=&unreadOnly=true
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, unreadOnly } = req.query as Record<string, string>;
    if (!userId) {
      res.status(400).json({ error: { code: 'MISSING_USER_ID', message: 'userId query param is required.' } });
      return;
    }

    const notifications = await notifService.listNotifications(
      userId,
      req.params.orgId as string,
      unreadOnly === 'true'
    );
    res.json({ data: notifications });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/notifications/:notifId/read
router.patch('/:notifId/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId) {
      res.status(400).json({ error: { code: 'MISSING_USER_ID', message: 'userId is required in request body.' } });
      return;
    }

    const notification = await notifService.markNotificationRead(userId, req.params.notifId as string);
    if (!notification) {
      res.status(404).json({ error: { code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.' } });
      return;
    }

    res.json({ data: notification });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/notifications/read-all
router.patch('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId) {
      res.status(400).json({ error: { code: 'MISSING_USER_ID', message: 'userId is required in request body.' } });
      return;
    }

    await notifService.markAllNotificationsRead(userId, req.params.orgId as string);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/notifications/jobs/late-fees
// No cron secret required — intended to be triggered from the dashboard UI.
router.post('/jobs/late-fees', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { applyLateFees } = await import('../jobs/lateFeeJob');
    const applyResult = await applyLateFees(req.params.orgId as string);
    const notifResult = await notifService.runLateFeeNotificationJob(req.params.orgId as string);
    res.json({ data: { lateFees: applyResult, notifications: notifResult } });
  } catch (err) {
    next(err);
  }
});


// POST /api/v1/organizations/:orgId/notifications/jobs/rent-reminders
// No cron secret required - intended to be triggered from the dashboard UI.
router.post(`/jobs/rent-reminders`, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runRentReminderJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/notifications/jobs/lease-expiry
// No cron secret required - intended to be triggered from the dashboard UI.
router.post(`/jobs/lease-expiry`, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runLeaseExpiryJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
