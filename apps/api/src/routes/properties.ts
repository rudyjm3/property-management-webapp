import { Router, Request, Response, NextFunction } from 'express';
import { createPropertySchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as propertyService from '../services/property.service';
import unitRoutes from './units';

const router = Router({ mergeParams: true });

// Nest unit routes under properties
router.use('/:propertyId/units', unitRoutes);

// GET /api/v1/organizations/:orgId/properties
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const properties = await propertyService.listProperties(req.params.orgId);
    res.json({ data: properties });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/properties/:propertyId
router.get('/:propertyId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const property = await propertyService.getProperty(req.params.orgId, req.params.propertyId);
    res.json({ data: property });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/properties
router.post('/', validate(createPropertySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const property = await propertyService.createProperty(req.params.orgId, req.body);
    res.status(201).json({ data: property });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/properties/:propertyId
router.patch('/:propertyId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const property = await propertyService.updateProperty(
      req.params.orgId,
      req.params.propertyId,
      req.body
    );
    res.json({ data: property });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/properties/:propertyId
router.delete('/:propertyId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await propertyService.deleteProperty(req.params.orgId, req.params.propertyId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
