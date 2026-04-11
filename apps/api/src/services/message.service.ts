import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import { sendExpoPush } from './push.service';
import { createInAppNotification } from './notification.service';

// ─── Shared include shape ─────────────────────────────────────────────────────

const messageInclude = {
  sender: { select: { id: true, name: true, email: true } },
  recipient: { select: { id: true, name: true, email: true, phone: true } },
  unit: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } } },
};

// ─── List threads ─────────────────────────────────────────────────────────────

export async function listThreads(organizationId: string, tenantId?: string) {
  const messages = await prisma.message.findMany({
    where: {
      organizationId,
      ...(tenantId ? { recipientTenantId: tenantId } : {}),
    },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
  });

  // Deduplicate by threadId — first occurrence is the latest message per thread
  const seen = new Set<string>();
  const latestPerThread: typeof messages = [];

  for (const msg of messages) {
    const key = msg.threadId ?? msg.id;
    if (!seen.has(key)) {
      seen.add(key);
      latestPerThread.push(msg);
    }
  }

  // Compute unread count per thread (tenant-sent messages with no readAt)
  const threadIds = latestPerThread.map((m) => m.threadId ?? m.id).filter(Boolean) as string[];
  const unreadCounts = await prisma.message.groupBy({
    by: ['threadId'],
    where: {
      organizationId,
      threadId: { in: threadIds },
      senderUserId: null,
      readAt: null,
      ...(tenantId ? { recipientTenantId: tenantId } : {}),
    },
    _count: { id: true },
  });

  const unreadMap = new Map(unreadCounts.map((r) => [r.threadId, r._count.id]));

  return latestPerThread.map((msg) => ({
    threadId: msg.threadId ?? msg.id,
    subject: msg.subject,
    latestMessage: msg,
    tenant: msg.recipient,
    unit: msg.unit,
    unreadCount: unreadMap.get(msg.threadId ?? '') ?? 0,
  }));
}

// ─── Get thread messages ──────────────────────────────────────────────────────

export async function getThread(organizationId: string, threadId: string) {
  const messages = await prisma.message.findMany({
    where: { organizationId, threadId },
    include: messageInclude,
    orderBy: { createdAt: 'asc' },
  });

  if (messages.length === 0) {
    throw new AppError(404, 'THREAD_NOT_FOUND', 'No messages found for that thread.');
  }

  // Mark tenant-sent unread messages as read
  await prisma.message.updateMany({
    where: { organizationId, threadId, senderUserId: null, readAt: null },
    data: { readAt: new Date() },
  });

  return messages;
}

// ─── Send message ─────────────────────────────────────────────────────────────

interface SendMessageData {
  senderUserId: string;
  recipientTenantId: string;
  body: string;
  threadId?: string | null;
  subject?: string | null;
  unitId?: string | null;
  workOrderId?: string | null;
}

export async function sendMessage(organizationId: string, data: SendMessageData) {
  // Verify tenant belongs to org
  const tenant = await prisma.tenant.findFirst({
    where: { id: data.recipientTenantId, organizationId },
    select: { id: true },
  });

  if (!tenant) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found in your organization.');
  }

  const threadId = data.threadId ?? crypto.randomUUID();

  const message = await prisma.message.create({
    data: {
      organizationId,
      threadId,
      senderUserId: data.senderUserId,
      recipientTenantId: data.recipientTenantId,
      body: data.body,
      subject: data.subject ?? null,
      unitId: data.unitId ?? null,
      workOrderId: data.workOrderId ?? null,
    },
    include: messageInclude,
  });

  // Fire-and-forget push notification to tenant
  const tenantWithToken = await prisma.tenant.findUnique({
    where: { id: data.recipientTenantId },
    select: { expoPushToken: true, notifMessage: true },
  });
  if (tenantWithToken?.expoPushToken && tenantWithToken.notifMessage !== 'none') {
    void sendExpoPush(
      tenantWithToken.expoPushToken,
      'New message from your property manager',
      message.subject ?? 'You have a new message',
      { threadId: message.threadId }
    );
  }

  return message;
}

// ─── Tenant-side functions ────────────────────────────────────────────────────

export async function listTenantThreads(tenantId: string) {
  const messages = await prisma.message.findMany({
    where: { recipientTenantId: tenantId },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
  });

  // Deduplicate by threadId — first occurrence is the latest message per thread
  const seen = new Set<string>();
  const latestPerThread: typeof messages = [];

  for (const msg of messages) {
    const key = msg.threadId ?? msg.id;
    if (!seen.has(key)) {
      seen.add(key);
      latestPerThread.push(msg);
    }
  }

  // Compute unread count per thread: manager messages (senderUserId != null) not yet read by tenant
  const threadIds = latestPerThread.map((m) => m.threadId ?? m.id).filter(Boolean) as string[];
  const unreadCounts = await prisma.message.groupBy({
    by: ['threadId'],
    where: {
      recipientTenantId: tenantId,
      threadId: { in: threadIds },
      senderUserId: { not: null },
      readAt: null,
    },
    _count: { id: true },
  });

  const unreadMap = new Map(unreadCounts.map((r) => [r.threadId, r._count.id]));

  return latestPerThread.map((msg) => ({
    threadId: msg.threadId ?? msg.id,
    subject: msg.subject,
    latestBody: msg.body,
    latestAt: msg.createdAt,
    unreadCount: unreadMap.get(msg.threadId ?? '') ?? 0,
  }));
}

export async function getTenantThread(tenantId: string, threadId: string) {
  const messages = await prisma.message.findMany({
    where: { recipientTenantId: tenantId, threadId },
    include: messageInclude,
    orderBy: { createdAt: 'asc' },
  });

  if (messages.length === 0) {
    throw new AppError(404, 'THREAD_NOT_FOUND', 'No messages found for that thread.');
  }

  // Mark manager messages as read (tenant is now viewing them)
  await prisma.message.updateMany({
    where: { recipientTenantId: tenantId, threadId, senderUserId: { not: null }, readAt: null },
    data: { readAt: new Date() },
  });

  return messages.map((msg) => ({
    id: msg.id,
    body: msg.body,
    isFromTenant: msg.senderUserId === null,
    createdAt: msg.createdAt,
  }));
}

export async function sendTenantReply(
  tenantId: string,
  orgId: string,
  threadId: string,
  body: string
) {
  // Verify the thread exists and belongs to this tenant
  const existing = await prisma.message.findFirst({
    where: { recipientTenantId: tenantId, threadId },
  });

  if (!existing) {
    throw new AppError(404, 'THREAD_NOT_FOUND', 'No thread found with that ID for your account.');
  }

  const message = await prisma.message.create({
    data: {
      organizationId: orgId,
      threadId,
      senderUserId: null,
      recipientTenantId: tenantId,
      body,
    },
  });

  // Notify all active owner/manager users in the org
  const managers = await prisma.user.findMany({
    where: {
      organizationId: orgId,
      role: { in: ['owner', 'manager'] },
      status: 'active',
    },
    select: { id: true },
  });

  await Promise.all(
    managers.map((m) =>
      createInAppNotification({
        userId: m.id,
        organizationId: orgId,
        type: 'new_message',
        title: 'New message from tenant',
        body: body.length > 120 ? body.slice(0, 117) + '…' : body,
        actionUrl: `/messages?threadId=${threadId}`,
      })
    )
  );

  return { ...message, isFromTenant: true };
}
