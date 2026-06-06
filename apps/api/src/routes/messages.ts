import { Router, Request, Response, NextFunction } from 'express';
import * as messageService from '../services/message.service';
import { requireRoles } from '../middleware/auth';
import { generateUploadPresignedUrl, buildStorageKey } from '../services/storage.service';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /api/v1/organizations/:orgId/messages/threads
router.get('/threads', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const threads = await messageService.listThreads(req.params.orgId as string, req.query.tenantId as string | undefined);
    res.json({ data: threads });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/messages/threads/:threadId
router.get('/threads/:threadId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messages = await messageService.getThread(req.params.orgId as string, req.params.threadId as string);
    res.json({ data: messages });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/messages/attachment-upload-url
router.post('/attachment-upload-url', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fileName, contentType } = req.body as { fileName?: string; contentType?: string };
    if (!fileName || !contentType) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'fileName and contentType are required.' } });
      return;
    }
    const storageKey = buildStorageKey(req.params.orgId as string, 'messages', 'attachments', fileName);
    const result = await generateUploadPresignedUrl(storageKey, contentType);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/messages
router.post('/', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      senderUserId, recipientTenantId, body, threadId, subject, unitId, workOrderId,
      attachmentStorageKey, attachmentName, attachmentMimeType,
    } = req.body;

    if (!recipientTenantId || !body || !senderUserId) {
      res.status(400).json({ error: { message: 'senderUserId, recipientTenantId, and body are required.' } });
      return;
    }

    const message = await messageService.sendMessage(req.params.orgId as string, {
      senderUserId,
      recipientTenantId,
      body,
      threadId: threadId ?? null,
      subject: subject ?? null,
      unitId: unitId ?? null,
      workOrderId: workOrderId ?? null,
      attachmentStorageKey: attachmentStorageKey ?? null,
      attachmentName: attachmentName ?? null,
      attachmentMimeType: attachmentMimeType ?? null,
    });

    res.status(201).json({ data: message });
  } catch (err) {
    next(err);
  }
});

export default router;
