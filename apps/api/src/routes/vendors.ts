import { Router } from 'express';
import { ZodError } from 'zod';
import {
  createVendorSchema,
  updateVendorSchema,
  upsertPreferredVendorAssignmentSchema,
  vendorWorkHistoryQuerySchema,
  MODULE_KEYS,
} from '@propflow/shared';
import { validate } from '../middleware/validate';
import { requireModule } from '../middleware/module-gate';
import { requireRoles } from '../middleware/auth';
import * as vendorService from '../services/vendor.service';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);
const requireVendorManagement = requireModule(MODULE_KEYS.VENDOR_MANAGEMENT);

// ─── Base vendor CRUD — ungated base product ────────────────────────────────
// See docs/reference/modules.md for why this line is drawn here: license
// number/expiry/insurance/rating/notes fields already existed on the Vendor
// model before Module 5 and are plain vendor-record data, not gated
// functionality. Only the routes below this section are Module 5-specific.

// GET /api/v1/organizations/:orgId/vendors?status=active
router.get('/', async (req, res, next) => {
  try {
    const activeOnly = req.query.status === 'active';
    const vendors = await vendorService.listVendors((req.params as Record<string, string>).orgId, { activeOnly });
    res.json({ data: vendors });
  } catch (err) {
    next(err);
  }
});

// ─── Module 5 — vendor management (gated, per-route) ────────────────────────
// Registered before the generic '/:vendorId' route below so these literal
// path segments aren't swallowed as a vendorId param.

// GET /api/v1/organizations/:orgId/vendors/expiry-alerts
router.get('/expiry-alerts', requireVendorManagement, async (req, res, next) => {
  try {
    const alerts = await vendorService.getVendorExpiryAlerts((req.params as Record<string, string>).orgId);
    res.json({ data: alerts });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/vendors/preferred-assignments
router.get('/preferred-assignments', requireVendorManagement, async (req, res, next) => {
  try {
    const assignments = await vendorService.listPreferredVendorAssignments((req.params as Record<string, string>).orgId);
    res.json({ data: assignments });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/vendors/preferred-assignments
// Upserts by (propertyId, category) — see vendor.service.ts.
router.post(
  '/preferred-assignments',
  requireVendorManagement,
  validate(upsertPreferredVendorAssignmentSchema),
  async (req, res, next) => {
    try {
      const assignment = await vendorService.upsertPreferredVendorAssignment((req.params as Record<string, string>).orgId, req.body);
      res.status(201).json({ data: assignment });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/organizations/:orgId/vendors/preferred-assignments/:assignmentId
router.delete('/preferred-assignments/:assignmentId', requireVendorManagement, async (req, res, next) => {
  try {
    await vendorService.deletePreferredVendorAssignment(
      (req.params as Record<string, string>).orgId,
      (req.params as Record<string, string>).assignmentId
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/vendors/:vendorId
router.get('/:vendorId', async (req, res, next) => {
  try {
    const vendor = await vendorService.getVendor((req.params as Record<string, string>).orgId, (req.params as Record<string, string>).vendorId);
    res.json({ data: vendor });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/vendors
router.post('/', validate(createVendorSchema), async (req, res, next) => {
  try {
    const vendor = await vendorService.createVendor((req.params as Record<string, string>).orgId, req.body);
    res.status(201).json({ data: vendor });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/vendors/:vendorId
router.patch('/:vendorId', validate(updateVendorSchema), async (req, res, next) => {
  try {
    const vendor = await vendorService.updateVendor(
      (req.params as Record<string, string>).orgId,
      (req.params as Record<string, string>).vendorId,
      req.body
    );
    res.json({ data: vendor });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/vendors/:vendorId
router.delete('/:vendorId', requireManagerAccess, async (req, res, next) => {
  try {
    await vendorService.deleteVendor((req.params as Record<string, string>).orgId, (req.params as Record<string, string>).vendorId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/vendors/:vendorId/work-history?months=12
router.get('/:vendorId/work-history', requireVendorManagement, async (req, res, next) => {
  try {
    let months: number;
    try {
      months = vendorWorkHistoryQuerySchema.parse(req.query).months;
    } catch (parseErr) {
      if (parseErr instanceof ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: parseErr.errors } });
        return;
      }
      throw parseErr;
    }
    const history = await vendorService.getVendorWorkHistory(
      (req.params as Record<string, string>).orgId,
      (req.params as Record<string, string>).vendorId,
      months
    );
    res.json({ data: history });
  } catch (err) {
    next(err);
  }
});

export default router;
