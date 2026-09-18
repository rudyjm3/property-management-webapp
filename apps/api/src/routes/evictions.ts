import { Router, Request, Response, NextFunction } from 'express';
import {
  createEvictionSchema,
  updateEvictionSchema,
  resolveEvictionNoticeSchema,
  fileEvictionSchema,
  setEvictionCourtDateSchema,
  recordEvictionJudgmentSchema,
  recordEvictionWritSchema,
  completeEvictionSchema,
  dismissEvictionSchema,
} from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as evictionService from '../services/eviction.service';
import { requireRoles } from '../middleware/auth';
import type { EvictionStatus } from '@propflow/db';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// Eviction records carry sensitive tenant legal information — every route
// in this router requires owner/manager, including reads (mirrors
// leases.ts's blanket manager-only gating, not the more permissive
// read-open pattern some other resources use).

// GET /api/v1/organizations/:orgId/evictions?leaseId=&status=
router.get('/', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const evictions = await evictionService.listEvictions(req.params.orgId as string, {
      leaseId: typeof req.query.leaseId === 'string' ? req.query.leaseId : undefined,
      status: typeof req.query.status === 'string' ? (req.query.status as EvictionStatus) : undefined,
    });
    res.json({ data: evictions });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/evictions/:evictionId
router.get('/:evictionId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eviction = await evictionService.getEviction(req.params.orgId as string, req.params.evictionId as string);
    res.json({ data: eviction });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/evictions
// Creates a notice record — auto-looks up the notice period/allowed delivery
// methods from StateEvictionRule via the lease's property state, unless the
// manager overrides it (overrideReason required if so — see eviction.service.ts).
router.post('/', requireManagerAccess, validate(createEvictionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eviction = await evictionService.createEviction(req.params.orgId as string, req.body);
    res.status(201).json({ data: eviction });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/evictions/:evictionId
router.patch('/:evictionId', requireManagerAccess, validate(updateEvictionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eviction = await evictionService.updateEviction(req.params.orgId as string, req.params.evictionId as string, req.body);
    res.json({ data: eviction });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/evictions/:evictionId
router.delete('/:evictionId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await evictionService.deleteEviction(req.params.orgId as string, req.params.evictionId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── Lifecycle transitions ─────────────────────────────────────────────────

// POST .../evictions/:evictionId/resolve — tenant cured/paid before the
// deadline, or the notice period expired uncured.
router.post(
  '/:evictionId/resolve',
  requireManagerAccess,
  validate(resolveEvictionNoticeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eviction = await evictionService.resolveEvictionNotice(
        req.params.orgId as string,
        req.params.evictionId as string,
        req.body.outcome,
        req.body.resolvedAt
      );
      res.json({ data: eviction });
    } catch (err) {
      next(err);
    }
  }
);

// POST .../evictions/:evictionId/file — files with the court once the notice
// period has expired uncured.
router.post('/:evictionId/file', requireManagerAccess, validate(fileEvictionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eviction = await evictionService.fileEviction(req.params.orgId as string, req.params.evictionId as string, req.body);
    res.json({ data: eviction });
  } catch (err) {
    next(err);
  }
});

// POST .../evictions/:evictionId/court-date
router.post(
  '/:evictionId/court-date',
  requireManagerAccess,
  validate(setEvictionCourtDateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eviction = await evictionService.setEvictionCourtDate(req.params.orgId as string, req.params.evictionId as string, req.body.courtDate);
      res.json({ data: eviction });
    } catch (err) {
      next(err);
    }
  }
);

// POST .../evictions/:evictionId/judgment
router.post(
  '/:evictionId/judgment',
  requireManagerAccess,
  validate(recordEvictionJudgmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eviction = await evictionService.recordEvictionJudgment(
        req.params.orgId as string,
        req.params.evictionId as string,
        req.body.judgmentOutcome,
        req.body.judgmentAt
      );
      res.json({ data: eviction });
    } catch (err) {
      next(err);
    }
  }
);

// POST .../evictions/:evictionId/writ — writ of possession issued (only
// valid after a judgment awarding possession to the landlord).
router.post('/:evictionId/writ', requireManagerAccess, validate(recordEvictionWritSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eviction = await evictionService.recordEvictionWrit(req.params.orgId as string, req.params.evictionId as string, req.body.writIssuedAt);
    res.json({ data: eviction });
  } catch (err) {
    next(err);
  }
});

// POST .../evictions/:evictionId/complete
router.post('/:evictionId/complete', requireManagerAccess, validate(completeEvictionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eviction = await evictionService.completeEviction(req.params.orgId as string, req.params.evictionId as string, req.body.completedAt);
    res.json({ data: eviction });
  } catch (err) {
    next(err);
  }
});

// POST .../evictions/:evictionId/dismiss
router.post('/:evictionId/dismiss', requireManagerAccess, validate(dismissEvictionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eviction = await evictionService.dismissEviction(
      req.params.orgId as string,
      req.params.evictionId as string,
      req.body.dismissedReason,
      req.body.dismissedAt
    );
    res.json({ data: eviction });
  } catch (err) {
    next(err);
  }
});

export default router;
