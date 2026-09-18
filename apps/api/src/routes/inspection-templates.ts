import { Router, Request, Response, NextFunction } from 'express';
import { createInspectionTemplateSchema, updateInspectionTemplateSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as templateService from '../services/inspection-template.service';
import { requireRoles } from '../middleware/auth';

// Mounted at /api/v1/organizations/:orgId/inspection-templates, gated by
// requireModule(INSPECTIONS_COMPLIANCE) at the mount in routes/index.ts.
const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await templateService.ensureDefaultTemplate(req.params.orgId as string);
    const templates = await templateService.listTemplates(req.params.orgId as string);
    res.json({ data: templates });
  } catch (err) {
    next(err);
  }
});

// GET /:templateId
router.get('/:templateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await templateService.getTemplate(req.params.orgId as string, req.params.templateId as string);
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

// POST /
router.post(
  '/',
  requireManagerAccess,
  validate(createInspectionTemplateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await templateService.createTemplate(req.params.orgId as string, req.body);
      res.status(201).json({ data: template });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /:templateId
router.patch(
  '/:templateId',
  requireManagerAccess,
  validate(updateInspectionTemplateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await templateService.updateTemplate(
        req.params.orgId as string,
        req.params.templateId as string,
        req.body
      );
      res.json({ data: template });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /:templateId
router.delete('/:templateId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await templateService.deleteTemplate(req.params.orgId as string, req.params.templateId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
