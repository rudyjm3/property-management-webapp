import { Router, Request, Response, NextFunction } from 'express';
import * as evictionService from '../services/eviction.service';

// Read-only access to the jurisdiction lookup StateEvictionRule provides —
// see docs/reference/modules.md "Module 8" for the sourcing/disclaimer.
// Global reference data (not scoped by organization), but mounted under an
// org path like every other authenticated route in this API for a
// consistent auth chain — see routes.md.
//
// Deliberately no write endpoints here: StateEvictionRule has no
// organizationId (it's shared across every tenant), and this codebase's
// RBAC is entirely org-scoped (UserRole is owner|manager|maintenance, with
// no platform-admin concept) — an owner/manager endpoint here would let any
// customer whose org has eviction_management active overwrite the notice-
// period data every other customer's deadline computations depend on.
// Correcting a seeded row today requires direct database/ops access
// (eviction.service.ts's createOrUpdateStateEvictionRule/
// updateStateEvictionRule exist for that, just not wired to a route); a
// real platform-admin auth layer would be needed before safely exposing
// writes over the API — see modules.md for this call-out.

const router = Router({ mergeParams: true });

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

export default router;
