import { prisma } from '@propflow/db';
import { PaymentType, PaymentStatus, PaymentMethod } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import * as ledgerService from './ledger.service';
import type { RecordPartialPaymentInput } from '@propflow/shared';

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
      ...(status ? { status: status as PaymentStatus } : {}),
      ...(type ? { type: type as PaymentType } : {}),
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

  const overdueWhere = {
    deletedAt: null,
    lease: { unit: { property: { organizationId } } },
    status: 'pending',
    type: 'rent',
    dueDate: { lt: now },
  } as const;

  const [thisMonthPayments, overduePayments, overdueCount, recentPayments] = await Promise.all([
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

    // Overdue preview list (capped for display)
    prisma.payment.findMany({
      where: overdueWhere,
      include: paymentInclude,
      orderBy: { dueDate: 'asc' },
      take: 10,
    }),

    // Accurate overdue count (not capped)
    prisma.payment.count({ where: overdueWhere }),

    // Recent completed payments (for dashboard feed)
    prisma.payment.findMany({
      where: {
        deletedAt: null,
        lease: { unit: { property: { organizationId } } },
        status: 'completed',
      },
      include: paymentInclude,
      orderBy: { paidAt: 'desc' },
      take: 10,
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
    overdueCount,
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
      type: data.type as PaymentType,
      status: data.status as PaymentStatus,
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
  method?: string;
  checkNumber?: string | null;
  referenceNote?: string | null;
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

// ─── Partial payment (Advanced Payments & Accounting / Module 4) ────────────
// Records a manually-recorded payment for less than the amount due, splits
// the original payment down to the amount actually received, and creates a
// new pending payment for the remainder due on the same date — so it shows
// up automatically in the existing tenant/manager pending-balance displays,
// which just sum pending Payment rows. Manual (non-Stripe) payments never
// post ledger entries in this codebase (see voidPayment's reversal comment),
// so this doesn't post one either, matching updatePayment's existing behavior.

export async function recordPartialPayment(
  organizationId: string,
  paymentId: string,
  data: RecordPartialPaymentInput
) {
  const payment = await getPayment(organizationId, paymentId);

  if (payment.status !== 'pending') {
    throw new AppError(400, 'PAYMENT_NOT_PENDING', 'Only pending payments can be partially paid.');
  }

  const amountDue = Number(payment.amount);
  if (data.amountPaid >= amountDue) {
    throw new AppError(
      400,
      'NOT_A_PARTIAL_PAYMENT',
      'The amount paid is greater than or equal to the amount due — use the normal mark-paid flow instead.'
    );
  }

  const remainder = Math.round((amountDue - data.amountPaid) * 100) / 100;
  const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();

  return prisma.$transaction(async (tx) => {
    const updatedOriginal = await tx.payment.update({
      where: { id: paymentId },
      data: {
        amount: data.amountPaid,
        originalAmount: amountDue,
        status: 'completed',
        method: data.method as PaymentMethod,
        checkNumber: data.checkNumber ?? null,
        referenceNote: data.referenceNote ?? null,
        paidAt,
        notes: data.notes ?? payment.notes,
      },
      include: paymentInclude,
    });

    const carriedForwardPayment = await tx.payment.create({
      data: {
        lease: { connect: { id: payment.leaseId } },
        tenant: { connect: { id: payment.tenantId } },
        amount: remainder,
        type: payment.type,
        status: 'pending',
        dueDate: payment.dueDate,
        carriedFromPayment: { connect: { id: paymentId } },
        notes: `Balance carried forward from payment ${paymentId}.`,
      },
      include: paymentInclude,
    });

    return { originalPayment: updatedOriginal, carriedForwardPayment };
  });
}

// ─── Void ─────────────────────────────────────────────────────────────────────

export async function voidPayment(
  organizationId: string,
  paymentId: string,
  reason: string
) {
  const payment = await getPayment(organizationId, paymentId);

  if (payment.status === 'voided') {
    throw new AppError(400, 'PAYMENT_ALREADY_VOIDED', 'This payment has already been voided.');
  }
  if (payment.status === 'refunded') {
    throw new AppError(400, 'PAYMENT_REFUNDED', 'Refunded payments cannot be voided. The refund is already the correction record.');
  }
  if (payment.status !== 'completed' && payment.status !== 'waived') {
    throw new AppError(400, 'PAYMENT_NOT_VOIDABLE', 'Only completed or waived payments can be voided. Delete pending payments instead.');
  }

  return prisma.$transaction(async (tx) => {
    // Serialize concurrent voids of the same payment: acquire the org-wide
    // ledger lock *before* reading anything, then re-check status under the
    // lock. Without this, two overlapping void requests can both pass the
    // status check above and both compute the same reversal, double-posting
    // it once the lock only serializes the writes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId})::bigint)`;

    const current = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    if (!current || current.status === 'voided') {
      throw new AppError(400, 'PAYMENT_ALREADY_VOIDED', 'This payment has already been voided.');
    }

    // Reverse whatever this payment already posted to the ledger (e.g. an ACH
    // credit from the Stripe webhook) so the balance reflects the void.
    // No-ops for payments that never posted a ledger entry (cash/check/waived).
    await ledgerService.reverseLedgerEntriesForPayment(
      tx,
      organizationId,
      paymentId,
      `Void reversal for payment ${paymentId} · ${reason.trim()}`
    );

    return tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'voided',
        voidedAt: new Date(),
        voidReason: reason.trim(),
      },
      include: paymentInclude,
    });
  });
}
