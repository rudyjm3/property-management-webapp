import { Router, Request, Response, NextFunction } from 'express';
import { requireRoles } from '../middleware/auth';
import { requireModule } from '../middleware/module-gate';
import {
  financialSummaryFiltersSchema,
  revenueTrendFiltersSchema,
  rentRollFiltersSchema,
  spendByLocationFiltersSchema,
  scheduleEExportFiltersSchema,
  MODULE_KEYS,
} from '@propflow/shared';
import * as reportService from '../services/report.service';

const router = Router({ mergeParams: true });
const requireManagerAccess = requireRoles(['owner', 'manager']);
// Schedule E export is an Advanced Payments & Accounting (Module 4) feature
// layered on top of this router's existing Reporting & Analytics (Module 11)
// gate — a Schedule E request needs both modules active. P&L-by-property
// itself stays under financial-summary/Module 11 (see docs/reference/modules.md
// for why); this only gates the tax-export extension.
const requireAccountingModule = requireModule(MODULE_KEYS.ADVANCED_PAYMENTS_ACCOUNTING);

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

// GET /api/v1/organizations/:orgId/reports/schedule-e-export
// Advanced Payments & Accounting (Module 4).
router.get('/schedule-e-export', requireManagerAccess, requireAccountingModule, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = scheduleEExportFiltersSchema.parse(req.query);
    const data = await reportService.getScheduleEExport(req.params.orgId as string, filters);
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

// GET /api/v1/organizations/:orgId/reports/vacancy-history
router.get('/vacancy-history', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { propertyId, periodStart, periodEnd } = req.query as Record<string, string | undefined>;
    const data = await reportService.getVacancyHistory(req.params.orgId as string, { propertyId, periodStart, periodEnd });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/reports/vacancy-history/snapshot
router.post('/vacancy-history/snapshot', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { propertyId, marketVacancyRatePct } = req.body as { propertyId?: string; marketVacancyRatePct?: number };
    const data = await reportService.recordVacancySnapshot(req.params.orgId as string, { propertyId, marketVacancyRatePct });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/reports/builder
router.post('/builder', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { source, columns, filters } = req.body as {
      source: reportService.ReportBuilderSource;
      columns?: string[];
      filters?: Record<string, unknown>;
    };
    if (!reportService.REPORT_BUILDER_SOURCES.includes(source)) {
      res.status(400).json({ error: { code: 'INVALID_SOURCE', message: `source must be one of: ${reportService.REPORT_BUILDER_SOURCES.join(', ')}` } });
      return;
    }
    const data = await reportService.runReportBuilder(req.params.orgId as string, { source, columns, filters });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/reports/saved
router.get('/saved', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await reportService.listSavedReports(req.params.orgId as string);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/reports/saved
router.post('/saved', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, source, columns, filters } = req.body as {
      name: string;
      source: reportService.ReportBuilderSource;
      columns: string[];
      filters: Record<string, unknown>;
    };
    if (!name || !source) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'name and source are required.' } });
      return;
    }
    const data = await reportService.createSavedReport(req.params.orgId as string, req.user!.userId, {
      name,
      source,
      columns: columns ?? [],
      filters: filters ?? {},
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/reports/saved/:savedReportId
router.delete('/saved/:savedReportId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await reportService.deleteSavedReport(req.params.orgId as string, req.params.savedReportId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
