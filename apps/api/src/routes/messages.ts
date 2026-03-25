import { Router, Request, Response, NextFunction } from 'express';
import * as messageService from '../services/message.service';

const router = Router({ mergeParams: true });

// GET /api/v1/organizations/:orgId/messages/threads
router.get('/threads', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const threads = await messageService.listThreads(req.params.orgId);
    res.json({ data: threads });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/messages/threads/:threadId
router.get('/threads/:threadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messages = await messageService.getThread(req.params.orgId, req.params.threadId);
    res.json({ data: messages });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/messages
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { senderUserId, recipientTenantId, body, threadId, subject, unitId, workOrderId } = req.body;

    if (!recipientTenantId || !body || !senderUserId) {
      res.status(400).json({ error: { message: 'senderUserId, recipientTenantId, and body are required.' } });
      return;
    }

    const message = await messageService.sendMessage(req.params.orgId, {
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
