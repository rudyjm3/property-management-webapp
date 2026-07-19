import { Router, Request, Response, NextFunction } from 'express';
import { requireRoles } from '../middleware/auth';
import {
  financialSummaryFiltersSchema,
  revenueTrendFiltersSchema,
  rentRollFiltersSchema,
  spendByLocationFiltersSchema,
} from '@propflow/shared';
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

// GET /api/v1/organizations/:orgId/reports/financial-trend
router.get('/financial-trend', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = revenueTrendFiltersSchema.parse(req.query);
    const data = await reportService.getRevenueTrend(req.params.orgId as string, filters);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/reports/rent-roll
router.get('/rent-roll', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = rentRollFiltersSchema.parse(req.query);
    const data = await reportService.getRentRoll(req.params.orgId as string, filters);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/reports/spend-by-location
router.get('/spend-by-location', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = spendByLocationFiltersSchema.parse(req.query);
    const data = await reportService.getSpendByLocation(req.params.orgId as string, filters);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/reports/vacancy-snapshot
router.get('/vacancy-snapshot', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const propertyId = req.query.propertyId as string | undefined;
    const data = await reportService.getVacancySnapshot(req.params.orgId as string, { propertyId });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
