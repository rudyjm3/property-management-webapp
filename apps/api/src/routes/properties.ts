import { Router, Request, Response, NextFunction } from 'express';
import { createPropertySchema, MODULE_KEYS } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as propertyService from '../services/property.service';
import unitRoutes from './units';
import maintenanceScheduleRoutes from './maintenance-schedules';
import propertyInspectionRoutes from './property-inspections';
import { requireRoles } from '../middleware/auth';
import { requireModule } from '../middleware/module-gate';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// Nest unit routes under properties
router.use('/:propertyId/units', unitRoutes);

// Recurring maintenance schedules and common-area/grounds inspections —
// Grounds & Property Maintenance (Module 3), gated by activeModules. Same
// router-mount gating pattern as Module 2's appliances.ts and Module 6's
// inspections.ts (see docs/reference/modules.md), one level deeper here
// since both nest directly under a property rather than a unit.
router.use(
  '/:propertyId/maintenance-schedules',
  requireModule(MODULE_KEYS.GROUNDS_MAINTENANCE),
  maintenanceScheduleRoutes
);
router.use(
  '/:propertyId/inspections',
  requireModule(MODULE_KEYS.GROUNDS_MAINTENANCE),
  propertyInspectionRoutes
);

// GET /api/v1/organizations/:orgId/properties
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const properties = await propertyService.listProperties(req.params.orgId as string);
    res.json({ data: properties });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/properties/:propertyId
router.get('/:propertyId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const property = await propertyService.getProperty(req.params.orgId as string, req.params.propertyId as string);
    res.json({ data: property });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/properties
router.post('/', requireManagerAccess, validate(createPropertySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const property = await propertyService.createProperty(req.params.orgId as string, req.body);
    res.status(201).json({ data: property });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/properties/:propertyId
router.patch('/:propertyId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const property = await propertyService.updateProperty(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.body
    );
    res.json({ data: property });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/properties/:propertyId
router.delete('/:propertyId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await propertyService.deleteProperty(req.params.orgId as string, req.params.propertyId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
