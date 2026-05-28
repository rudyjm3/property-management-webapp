import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate';
import { submitApplicationSchema } from '@propflow/shared';
import { inviteRateLimit } from '../middleware/rate-limit';
import { getApplicationContext, submitApplication } from '../services/rental-application.service';

const router = Router();

// GET /apply/:token — public; returns unit/org context for the form header
router.get('/:token', inviteRateLimit, async (req: Request, res: Response) => {
  const token = String(req.params.token);
  try {
    const context = await getApplicationContext(token);
    res.json({ data: context });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: { code: 'ERROR', message: err.message } });
  }
});

// POST /apply/:token — public; submit the application
router.post('/:token', inviteRateLimit, validate(submitApplicationSchema), async (req: Request, res: Response) => {
  const token = String(req.params.token);
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  try {
    const result = await submitApplication(token, req.body, ip);
    res.status(201).json({ data: result });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: { code: 'ERROR', message: err.message } });
  }
});

export default router;
