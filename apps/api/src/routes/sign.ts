import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate';
import { signLeaseSchema } from '@propflow/shared';
import { inviteRateLimit } from '../middleware/rate-limit';
import { getSigningContext, tenantSignLease } from '../services/lease-esignature.service';

const router = Router();

// GET /sign/:token — public; returns lease summary for the signing page
router.get('/:token', inviteRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params.token);
  try {
    const context = await getSigningContext(token);
    res.json({ data: context });
  } catch (err) {
    next(err);
  }
});

// POST /sign/:token — public; tenant submits their e-signature
router.post('/:token', inviteRateLimit, validate(signLeaseSchema), async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params.token);
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  try {
    const result = await tenantSignLease(token, req.body.signatureName, ip);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
