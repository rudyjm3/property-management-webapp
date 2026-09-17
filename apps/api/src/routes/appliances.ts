import { Router, Request, Response, NextFunction } from 'express';
import { createApplianceSchema, updateApplianceSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as applianceService from '../services/appliance.service';
import { requireRoles } from '../middleware/auth';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId/appliances
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const appliances = await applianceService.listAppliances(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string
    );
    res.json({ data: appliances });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId/appliances/:applianceId
router.get('/:applianceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const appliance = await applianceService.getAppliance(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string,
      req.params.applianceId as string
    );
    res.json({ data: appliance });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId/appliances
router.post(
  '/',
  requireManagerAccess,
  validate(createApplianceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appliance = await applianceService.createAppliance(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.unitId as string,
        req.body
      );
      res.status(201).json({ data: appliance });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId/appliances/:applianceId
router.patch(
  '/:applianceId',
  requireManagerAccess,
  validate(updateApplianceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appliance = await applianceService.updateAppliance(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.unitId as string,
        req.params.applianceId as string,
        req.body
      );
      res.json({ data: appliance });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId/appliances/:applianceId
router.delete('/:applianceId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await applianceService.deleteAppliance(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string,
      req.params.applianceId as string
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
