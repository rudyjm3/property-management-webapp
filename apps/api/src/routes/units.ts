import { Router, Request, Response, NextFunction } from 'express';
import { createUnitSchema, bulkCreateUnitSchema, MODULE_KEYS } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as unitService from '../services/unit.service';
import { requireRoles } from '../middleware/auth';
import { requireModule } from '../middleware/module-gate';
import applianceRoutes from './appliances';
import inspectionRoutes from './inspections';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// Appliance registry — Module 2 (Unit Intelligence & Appliance Registry),
// gated by activeModules at the router mount (mirrors /owners and /reports).
router.use('/:unitId/appliances', requireModule(MODULE_KEYS.UNIT_INTELLIGENCE), applianceRoutes);

// Inspections — Module 6 (Inspections & Compliance), same mount-level
// gating pattern as appliances above (a wholly new domain model nested
// under the unit).
router.use('/:unitId/inspections', requireModule(MODULE_KEYS.INSPECTIONS_COMPLIANCE), inspectionRoutes);

// GET /api/v1/organizations/:orgId/properties/:propertyId/units
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const units = await unitService.listUnits(req.params.orgId as string, req.params.propertyId as string);
    res.json({ data: units });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/properties/:propertyId/units/bulk
// Must be registered before /:unitId to avoid "bulk" being captured as a unitId param
router.post('/bulk', requireManagerAccess, validate(bulkCreateUnitSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await unitService.bulkCreateUnits(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.body.units
    );
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId
router.get('/:unitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = await unitService.getUnit(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string
    );
    res.json({ data: unit });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/properties/:propertyId/units
router.post('/', requireManagerAccess, validate(createUnitSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = await unitService.createUnit(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.body
    );
    res.status(201).json({ data: unit });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId
router.patch('/:unitId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = await unitService.updateUnit(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string,
      req.body
    );
    res.json({ data: unit });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId
router.delete('/:unitId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await unitService.deleteUnit(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
