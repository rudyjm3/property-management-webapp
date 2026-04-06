import { Router, Request, Response, NextFunction } from 'express';
import { listLedgerFiltersSchema } from '@propflow/shared';
import * as ledgerService from '../services/ledger.service';
import { requireRoles } from '../middleware/auth';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /api/v1/organizations/:orgId/ledger
router.get('/', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = listLedgerFiltersSchema.parse(req.query);
    const result = await ledgerService.listLedgerEntries(
      req.params.orgId as string,
      filters
    );
    res.json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    next(err);
  }
});

export default router;
