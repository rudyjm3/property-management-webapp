import { Router, Request, Response, NextFunction } from 'express';
import * as messageService from '../services/message.service';
import { requireRoles } from '../middleware/auth';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /api/v1/organizations/:orgId/messages/threads
router.get('/threads', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const threads = await messageService.listThreads(req.params.orgId as string);
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

// POST /api/v1/organizations/:orgId/messages
router.post('/', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { senderUserId, recipientTenantId, body, threadId, subject, unitId, workOrderId } = req.body;

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
    });

    res.status(201).json({ data: message });
  } catch (err) {
    next(err);
  }
});

export default router;
