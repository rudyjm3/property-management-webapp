import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate';
import { submitApplicationSchema } from '@propflow/shared';
import { inviteRateLimit } from '../middleware/rate-limit';
import { getApplicationContext, submitApplication } from '../services/rental-application.service';

const router = Router();

// GET /apply/:token — public; returns unit/org context for the form header
router.get('/:token', inviteRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params.token);
  try {
    const context = await getApplicationContext(token);
    res.json({ data: context });
  } catch (err) {
    next(err);
  }
});

// POST /apply/:token — public; submit the application
router.post('/:token', inviteRateLimit, validate(submitApplicationSchema), async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params.token);
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  try {
    const result = await submitApplication(token, req.body, ip);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
