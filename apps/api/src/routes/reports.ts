import { Router, Request, Response, NextFunction } from 'express';
import { requireRoles } from '../middleware/auth';
import { financialSummaryFiltersSchema } from '@propflow/shared';
import * as reportService from '../services/report.service';

const router = Router({ mergeParams: true });
const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /api/v1/organizations/:orgId/reports/financial-summary
router.get('/financial-summary', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = financialSummaryFiltersSchema.parse(req.query);
    const summary = await reportService.getFinancialSummary(req.params.orgId as string, filters);
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
});

export default router;
