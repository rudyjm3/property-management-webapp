import { Router, Request, Response, NextFunction } from 'express';
import * as notifService from '../services/notification.service';

const router = Router({ mergeParams: true });

// ─── In-App Notifications ─────────────────────────────────────────────────────

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

// ─── Email Job Triggers ───────────────────────────────────────────────────────
// These endpoints allow triggering notification jobs for a specific org.
// In production these would be called by a cron scheduler (e.g. Railway cron,
// Vercel cron, or an external scheduler hitting a secured endpoint).

// POST /api/v1/organizations/:orgId/notifications/jobs/rent-reminders
router.post('/jobs/rent-reminders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runRentReminderJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/notifications/jobs/overdue-rent
router.post('/jobs/overdue-rent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runOverdueRentJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/notifications/jobs/lease-expiry
router.post('/jobs/lease-expiry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runLeaseExpiryJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
