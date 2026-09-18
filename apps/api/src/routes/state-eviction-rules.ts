import { Router, Request, Response, NextFunction } from 'express';
import { createStateEvictionRuleSchema, updateStateEvictionRuleSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as evictionService from '../services/eviction.service';
import { requireRoles } from '../middleware/auth';

// Reference-table CRUD for the jurisdiction lookup StateEvictionRule provides
// — see docs/reference/modules.md "Module 8" for the sourcing/disclaimer.
// Global reference data (not scoped by organization), but mounted under an
// org path like every other authenticated route in this API for a
// consistent auth chain — see routes.md.

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /api/v1/organizations/:orgId/state-eviction-rules?state=CA
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await evictionService.listStateEvictionRules(typeof req.query.state === 'string' ? req.query.state : undefined);
    res.json({ data: rules });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/state-eviction-rules/:ruleId
router.get('/:ruleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rule = await evictionService.getStateEvictionRule(req.params.ruleId as string);
    res.json({ data: rule });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/state-eviction-rules
// Upserts a rule for a given (state, noticeType) — lets a manager who has
// actually verified a jurisdiction's current law correct the seeded value.
router.post('/', requireManagerAccess, validate(createStateEvictionRuleSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rule = await evictionService.createOrUpdateStateEvictionRule(req.body);
    res.status(201).json({ data: rule });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/state-eviction-rules/:ruleId
router.patch('/:ruleId', requireManagerAccess, validate(updateStateEvictionRuleSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rule = await evictionService.updateStateEvictionRule(req.params.ruleId as string, req.body);
    res.json({ data: rule });
  } catch (err) {
    next(err);
  }
});

export default router;
