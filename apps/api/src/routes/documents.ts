import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate';
import {
  requestUploadSchema,
  confirmUploadSchema,
  listDocumentsSchema,
} from '@propflow/shared';
import { AppError } from '../middleware/error-handler';
import * as documentService from '../services/document.service';

const router = Router({ mergeParams: true });

/** Resolve the calling user's ID from auth middleware or the x-user-id header. */
function resolveUserId(req: Request): string {
  const userId = (req as any).userId ?? (req.headers['x-user-id'] as string | undefined);
  if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'Missing user identity');
  return userId;
}

// POST /api/v1/organizations/:orgId/documents/upload-url
// Step 1: request a presigned PUT URL for direct browser-to-S3 upload
router.post(
  '/upload-url',
  validate(requestUploadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = resolveUserId(req);
      const result = await documentService.requestUpload(
        req.params.orgId as string,
        userId,
        req.body,
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/organizations/:orgId/documents
// Step 2: confirm upload succeeded and persist document metadata
router.post(
  '/',
  validate(confirmUploadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = resolveUserId(req);
      const document = await documentService.confirmUpload(
        req.params.orgId as string,
        userId,
        req.body,
      );
      res.status(201).json({ data: document });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/organizations/:orgId/documents
// List documents, optionally filtered by entityType + entityId query params
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listDocumentsSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const documents = await documentService.listDocuments(
        req.params.orgId as string,
        parsed.data,
      );
      res.json({ data: documents });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/organizations/:orgId/documents/:docId/download-url
// Get a short-lived presigned download URL
router.get(
  '/:docId/download-url',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await documentService.getDownloadUrl(
        req.params.orgId as string,
        req.params.docId as string,
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/organizations/:orgId/documents/:docId
router.delete(
  '/:docId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await documentService.deleteDocument(
        req.params.orgId as string,
        req.params.docId as string,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
