import { Router, Request, Response, NextFunction } from 'express';
import {
  createPropertyInspectionSchema,
  completePropertyInspectionSchema,
  requestInspectionMediaUploadSchema,
  attachInspectionMediaSchema,
} from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as inspectionService from '../services/inspection.service';
import { requireRoles } from '../middleware/auth';

// Grounds/common-area inspections — Module 3's "inspection log with
// completion-photo requirement" (reuses Inspection/InspectionMedia from
// Module 6, scoped to a Property instead of a Unit). See
// inspection.service.ts for why these are separate functions from the
// unit-scoped ones.
const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);
const requireInspectorAccess = requireRoles(['owner', 'manager', 'maintenance']);

// GET /api/v1/organizations/:orgId/properties/:propertyId/inspections
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inspections = await inspectionService.listPropertyInspections(
      req.params.orgId as string,
      req.params.propertyId as string
    );
    res.json({ data: inspections });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/properties/:propertyId/inspections/:inspectionId
router.get('/:inspectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inspection = await inspectionService.getPropertyInspection(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.inspectionId as string
    );
    res.json({ data: inspection });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/properties/:propertyId/inspections
router.post(
  '/',
  requireManagerAccess,
  validate(createPropertyInspectionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await inspectionService.createPropertyInspection(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.body
      );
      res.status(201).json({ data: inspection });
    } catch (err) {
      next(err);
    }
  }
);

// POST .../inspections/:inspectionId/complete
// Enforces the completion-photo requirement — see inspection.service.ts.
router.post(
  '/:inspectionId/complete',
  requireInspectorAccess,
  validate(completePropertyInspectionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await inspectionService.completePropertyInspection(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.inspectionId as string,
        req.body,
        req.user ? { userId: req.user.userId, role: req.user.role } : null
      );
      res.json({ data: inspection });
    } catch (err) {
      next(err);
    }
  }
);

// POST .../inspections/:inspectionId/cancel
router.post(
  '/:inspectionId/cancel',
  requireManagerAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await inspectionService.cancelPropertyInspection(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.inspectionId as string
      );
      res.json({ data: inspection });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Media (photo/video documentation) ─────────────────────────────────────

// POST .../inspections/:inspectionId/media/upload-url
router.post(
  '/:inspectionId/media/upload-url',
  requireInspectorAccess,
  validate(requestInspectionMediaUploadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await inspectionService.requestPropertyMediaUploadUrl(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.inspectionId as string,
        req.body.fileName,
        req.body.contentType,
        req.user ? { userId: req.user.userId, role: req.user.role } : null
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST .../inspections/:inspectionId/media
router.post(
  '/:inspectionId/media',
  requireInspectorAccess,
  validate(attachInspectionMediaSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const media = await inspectionService.attachPropertyMedia(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.inspectionId as string,
        req.body,
        req.user ? { userId: req.user.userId, role: req.user.role } : null
      );
      res.status(201).json({ data: media });
    } catch (err) {
      next(err);
    }
  }
);

// GET .../inspections/:inspectionId/media
router.get('/:inspectionId/media', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const media = await inspectionService.listPropertyMedia(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.inspectionId as string
    );
    res.json({ data: media });
  } catch (err) {
    next(err);
  }
});

export default router;
