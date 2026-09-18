import { Router, Request, Response, NextFunction } from 'express';
import { createWorkOrderSchema, updateWorkOrderSchema, rateVendorWorkOrderSchema, MODULE_KEYS } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as workOrderService from '../services/workOrder.service';
import * as vendorService from '../services/vendor.service';
import { requireRoles } from '../middleware/auth';
import { requireModule } from '../middleware/module-gate';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /api/v1/organizations/:orgId/work-orders
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, priority, category, propertyId, unitId, tenantId, limit } = req.query;
    const workOrders = await workOrderService.listWorkOrders(req.params.orgId as string, {
      status: status as string | undefined,
      priority: priority as string | undefined,
      category: category as string | undefined,
      propertyId: propertyId as string | undefined,
      unitId: unitId as string | undefined,
      tenantId: tenantId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ data: workOrders });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/work-orders/:workOrderId
router.get('/:workOrderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workOrder = await workOrderService.getWorkOrder(
      req.params.orgId as string,
      req.params.workOrderId as string
    );
    res.json({ data: workOrder });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/work-orders
router.post('/', validate(createWorkOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workOrder = await workOrderService.createWorkOrder(req.params.orgId as string, {
      ...req.body,
      submittedByUserId: req.user!.userId,
    });
    res.status(201).json({ data: workOrder });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/work-orders/:workOrderId
router.patch('/:workOrderId', validate(updateWorkOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workOrder = await workOrderService.updateWorkOrder(
      req.params.orgId as string,
      req.params.workOrderId as string,
      req.body
    );
    res.json({ data: workOrder });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/work-orders/:workOrderId/vendor-rating
// Vendor & Contractor Management (Module 5) — captures a 1-5 star rating +
// optional note for a completed/closed work order's assigned vendor, and
// rolls it into Vendor.rating. Per-route gated (the rest of this router
// ships ungated as base product), mirroring the pattern used for e.g.
// payments.ts's card-payment endpoints.
router.post(
  '/:workOrderId/vendor-rating',
  requireModule(MODULE_KEYS.VENDOR_MANAGEMENT),
  validate(rateVendorWorkOrderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rating = await vendorService.rateVendorWorkOrder(
        req.params.orgId as string,
        req.params.workOrderId as string,
        req.body
      );
      res.status(201).json({ data: rating });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/organizations/:orgId/work-orders/:workOrderId
router.delete('/:workOrderId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await workOrderService.deleteWorkOrder(
      req.params.orgId as string,
      req.params.workOrderId as string
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
