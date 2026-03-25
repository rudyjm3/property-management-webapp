import { Router, Request, Response, NextFunction } from 'express';
import * as notifService from '../services/notification.service';

const router = Router({ mergeParams: true });

// ─── Cron-secret guard ────────────────────────────────────────────────────────
// Job-trigger endpoints must be called with:
//   Authorization: Bearer <CRON_SECRET>
// Set CRON_SECRET in .env (and in your scheduler's environment) before use.
function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // If no secret is configured, block all job requests to fail safe.
    res.status(503).json({ error: { code: 'CRON_NOT_CONFIGURED', message: 'CRON_SECRET is not configured on this server.' } });
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
router.post('/jobs/rent-reminders', requireCronSecret, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runRentReminderJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/notifications/jobs/overdue-rent
router.post('/jobs/overdue-rent', requireCronSecret, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runOverdueRentJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/notifications/jobs/lease-expiry
router.post('/jobs/lease-expiry', requireCronSecret, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notifService.runLeaseExpiryJob(req.params.orgId as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/notifications/jobs/late-fees
// No cron secret required — intended to be triggered from the dashboard UI
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

export default router;
