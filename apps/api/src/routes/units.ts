import { Router, Request, Response, NextFunction } from 'express';
import { createUnitSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as unitService from '../services/unit.service';
import { requireRoles } from '../middleware/auth';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /api/v1/organizations/:orgId/properties/:propertyId/units
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const units = await unitService.listUnits(req.params.orgId as string, req.params.propertyId as string);
    res.json({ data: units });
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
