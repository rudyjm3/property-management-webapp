import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';

// ─── Shared include shape ─────────────────────────────────────────────────────

const paymentInclude = {
  lease: {
    select: {
      id: true,
      rentAmount: true,
      unit: {
        select: {
          id: true,
          unitNumber: true,
          property: { select: { id: true, name: true, organizationId: true } },
        },
      },
    },
  },
  tenant: { select: { id: true, name: true, email: true } },
};

// ─── List ─────────────────────────────────────────────────────────────────────

interface ListPaymentsOptions {
  leaseId?: string;
  tenantId?: string;
  status?: string;
  type?: string;
  cursor?: string;
  limit?: number;
}

export async function listPayments(organizationId: string, opts: ListPaymentsOptions = {}) {
  const { leaseId, tenantId, status, type, cursor, limit = 50 } = opts;

  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      lease: { unit: { property: { organizationId } } },
      ...(leaseId ? { leaseId } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    include: paymentInclude,
    orderBy: { dueDate: 'desc' },
    take: limit,
  });

  return {
    data: payments,
    nextCursor: payments.length === limit ? payments[payments.length - 1].id : null,
  };
}

// ─── Stats (for dashboard KPIs) ───────────────────────────────────────────────

export async function getPaymentStats(organizationId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [thisMonthPayments, overduePayments, recentPayments] = await Promise.all([
    // All payments due this month
    prisma.payment.findMany({
      where: {
        deletedAt: null,
        lease: { unit: { property: { organizationId } } },
        dueDate: { gte: startOfMonth, lte: endOfMonth },
        type: 'rent',
      },
      select: { amount: true, status: true },
    }),

    // Overdue: pending rent with dueDate before today
    prisma.payment.findMany({
      where: {
        deletedAt: null,
        lease: { unit: { property: { organizationId } } },
        status: 'pending',
        type: 'rent',
        dueDate: { lt: now },
      },
      include: paymentInclude,
      orderBy: { dueDate: 'asc' },
      take: 10,
    }),

    // Recent completed payments (for dashboard feed)
    prisma.payment.findMany({
      where: {
        deletedAt: null,
        lease: { unit: { property: { organizationId } } },
        status: 'completed',
      },
      include: paymentInclude,
      orderBy: { paidAt: 'desc' },
      take: 5,
    }),
  ]);

  const collectedThisMonth = thisMonthPayments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const expectedThisMonth = thisMonthPayments
    .filter((p) => p.status !== 'waived')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const pendingThisMonth = thisMonthPayments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const collectionRate = expectedThisMonth > 0
    ? Math.round((collectedThisMonth / expectedThisMonth) * 100)
    : 0;

  return {
    collectedThisMonth,
    expectedThisMonth,
    pendingThisMonth,
    collectionRate,
    overdueCount: overduePayments.length,
    overduePayments,
    recentPayments,
  };
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getPayment(organizationId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      deletedAt: null,
      lease: { unit: { property: { organizationId } } },
    },
    include: paymentInclude,
  });

  if (!payment) {
    throw new AppError(404, 'PAYMENT_NOT_FOUND', 'No payment found with that ID in your organization.');
  }

  return payment;
}

// ─── Create ───────────────────────────────────────────────────────────────────

interface CreatePaymentData {
  leaseId: string;
  tenantId: string;
  amount: number;
  type: string;
  status: string;
  dueDate: string;
  paidAt?: string | null;
  notes?: string | null;
}

export async function createPayment(organizationId: string, data: CreatePaymentData) {
  // Verify lease belongs to org
  const lease = await prisma.lease.findFirst({
    where: { id: data.leaseId, deletedAt: null, unit: { property: { organizationId } } },
  });

  if (!lease) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  // Verify tenant belongs to org
  const tenant = await prisma.tenant.findFirst({
    where: { id: data.tenantId, organizationId, deletedAt: null },
  });

  if (!tenant) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found in your organization.');
  }

  const payment = await prisma.payment.create({
    data: {
      lease: { connect: { id: data.leaseId } },
      tenant: { connect: { id: data.tenantId } },
      amount: data.amount,
      type: data.type,
      status: data.status,
      dueDate: new Date(data.dueDate),
      paidAt: data.status === 'completed'
        ? (data.paidAt ? new Date(data.paidAt) : new Date())
        : (data.paidAt ? new Date(data.paidAt) : null),
      notes: data.notes,
    },
    include: paymentInclude,
  });

  return payment;
}

// ─── Update ───────────────────────────────────────────────────────────────────

interface UpdatePaymentData {
  amount?: number;
  type?: string;
  status?: string;
  paidAt?: string | null;
  dueDate?: string;
  notes?: string | null;
}

export async function updatePayment(
  organizationId: string,
  paymentId: string,
  data: UpdatePaymentData
) {
  await getPayment(organizationId, paymentId); // throws if not found

  const updateData: Record<string, unknown> = { ...data };
  if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
  if (data.paidAt) updateData.paidAt = new Date(data.paidAt);
  // Auto-set paidAt when marking completed if not provided
  if (data.status === 'completed' && !data.paidAt) {
    updateData.paidAt = new Date();
  }
  // Clear paidAt when reverting to pending
  if (data.status === 'pending') {
    updateData.paidAt = null;
  }

  return prisma.payment.update({
    where: { id: paymentId },
    data: updateData,
    include: paymentInclude,
  });
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export async function deletePayment(organizationId: string, paymentId: string) {
  await getPayment(organizationId, paymentId); // throws if not found

  await prisma.payment.update({
    where: { id: paymentId },
    data: { deletedAt: new Date() },
  });
}
