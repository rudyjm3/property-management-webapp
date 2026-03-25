import { Router, Request, Response, NextFunction } from 'express';
import { createWorkOrderSchema, updateWorkOrderSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as workOrderService from '../services/workOrder.service';

const router = Router({ mergeParams: true });

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
    const workOrder = await workOrderService.createWorkOrder(req.params.orgId as string, req.body);
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

// DELETE /api/v1/organizations/:orgId/work-orders/:workOrderId
router.delete('/:workOrderId', async (req: Request, res: Response, next: NextFunction) => {
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
