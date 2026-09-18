import { Router, Request, Response, NextFunction } from 'express';
import {
  createInspectionSchema,
  updateInspectionSchema,
  completeInspectionSchema,
  requestInspectionMediaUploadSchema,
  attachInspectionMediaSchema,
} from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as inspectionService from '../services/inspection.service';
import { requireRoles } from '../middleware/auth';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);
// Completing an inspection is also allowed for maintenance staff who were
// assigned as the inspector — inspection.service.completeInspection enforces
// that a maintenance-role actor may only complete their own assignment.
const requireInspectorAccess = requireRoles(['owner', 'manager', 'maintenance']);

// GET /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId/inspections
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inspections = await inspectionService.listInspections(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string
    );
    res.json({ data: inspections });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId/inspections/:inspectionId
router.get('/:inspectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inspection = await inspectionService.getInspection(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string,
      req.params.inspectionId as string
    );
    res.json({ data: inspection });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId/inspections
// Schedules/creates an inspection (move-in, move-out, ad hoc, annual, semi-annual).
router.post(
  '/',
  requireManagerAccess,
  validate(createInspectionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await inspectionService.createInspection(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.unitId as string,
        req.body
      );
      res.status(201).json({ data: inspection });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/organizations/:orgId/properties/:propertyId/units/:unitId/inspections/:inspectionId
// Reschedule, reassign inspector, edit notes/template/status (not for completing — see /complete).
router.patch(
  '/:inspectionId',
  requireManagerAccess,
  validate(updateInspectionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await inspectionService.updateInspection(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.unitId as string,
        req.params.inspectionId as string,
        req.body
      );
      res.json({ data: inspection });
    } catch (err) {
      next(err);
    }
  }
);

// POST .../inspections/:inspectionId/complete
// Captures the filled-in checklist and tenant/manager signatures (typed
// name + IP + timestamp — see inspection.service.ts), marks the inspection
// completed, and advances Unit.lastInspectionAt forward-only.
router.post(
  '/:inspectionId/complete',
  requireInspectorAccess,
  validate(completeInspectionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await inspectionService.completeInspection(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.unitId as string,
        req.params.inspectionId as string,
        req.body,
        req.ip ?? '',
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
      const inspection = await inspectionService.cancelInspection(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.unitId as string,
        req.params.inspectionId as string
      );
      res.json({ data: inspection });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE .../inspections/:inspectionId
router.delete('/:inspectionId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await inspectionService.deleteInspection(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string,
      req.params.inspectionId as string
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── Media (photo/video documentation) ─────────────────────────────────────

// POST .../inspections/:inspectionId/media/upload-url
// Step 1 of the presigned-upload pattern (mirrors documents/upload-url):
// returns a Supabase Storage presigned PUT URL scoped to this inspection.
router.post(
  '/:inspectionId/media/upload-url',
  requireInspectorAccess,
  validate(requestInspectionMediaUploadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await inspectionService.requestMediaUploadUrl(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.unitId as string,
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
// Step 2: records the uploaded media's storage key + captured timestamp/GPS
// (GPS is best-effort/permission-gated — see modules.md).
router.post(
  '/:inspectionId/media',
  requireInspectorAccess,
  validate(attachInspectionMediaSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const media = await inspectionService.attachMedia(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.unitId as string,
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
    const media = await inspectionService.listMedia(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.unitId as string,
      req.params.inspectionId as string
    );
    res.json({ data: media });
  } catch (err) {
    next(err);
  }
});

export default router;
