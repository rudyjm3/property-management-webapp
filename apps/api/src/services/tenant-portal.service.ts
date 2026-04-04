import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import * as stripeService from './stripe.service';
import * as s3Service from './s3.service';
import type { SubmitWorkOrderInput } from '@propflow/shared';

const SLA_HOURS: Record<string, number> = {
  emergency: 1,
  urgent: 24,
  routine: 7 * 24,
};

function computeSlaDeadline(priority: string): Date {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.routine;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getTenantProfile(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      avatarUrl: true,
      portalStatus: true,
      organizationId: true,
      organization: {
        select: { id: true, name: true, phone: true },
      },
      leaseParticipants: {
        where: {
          lease: {
            status: { in: ['active', 'month_to_month'] },
            deletedAt: null,
          },
        },
        take: 1,
        select: {
          lease: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              rentAmount: true,
              unit: {
                select: {
                  id: true,
                  unitNumber: true,
                  property: {
                    select: { id: true, name: true, address: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!tenant) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found.');
  }

  const activeLease = tenant.leaseParticipants[0]?.lease ?? null;

  return {
    id: tenant.id,
    email: tenant.email,
    name: tenant.name,
    phone: tenant.phone,
    avatarUrl: tenant.avatarUrl,
    portalStatus: tenant.portalStatus,
    activeLease,
    organization: tenant.organization,
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getTenantDashboard(tenantId: string) {
  const [nextPayment, openWorkOrdersCount, unreadMessagesCount, activeLease] = await Promise.all([
    // Next pending payment for this tenant
    prisma.payment.findFirst({
      where: {
        tenantId,
        status: 'pending',
        deletedAt: null,
      },
      orderBy: { dueDate: 'asc' },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        status: true,
        stripePaymentIntentId: true,
      },
    }),

    // Open work orders count
    prisma.workOrder.count({
      where: {
        tenantId,
        status: { in: ['new_order', 'assigned', 'in_progress'] },
      },
    }),

    // Unread messages count — only manager-sent messages (senderUserId not null) not yet read
    prisma.message.count({
      where: {
        recipientTenantId: tenantId,
        senderUserId: { not: null },
        readAt: null,
      },
    }),

    // Active lease with expiry info
    prisma.leaseParticipant.findFirst({
      where: {
        tenantId,
        lease: {
          status: { in: ['active', 'month_to_month'] },
          deletedAt: null,
        },
      },
      select: {
        lease: {
          select: {
            id: true,
            endDate: true,
            rentAmount: true,
            unit: {
              select: {
                unitNumber: true,
                property: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    nextPayment: nextPayment
      ? {
          id: nextPayment.id,
          amount: Number(nextPayment.amount),
          dueDate: nextPayment.dueDate,
          status: nextPayment.status,
          stripePaymentIntentId: nextPayment.stripePaymentIntentId,
        }
      : null,
    openWorkOrdersCount,
    unreadMessagesCount,
    activeLease: activeLease?.lease ?? null,
  };
}

// ─── Payment History ──────────────────────────────────────────────────────────

export async function getTenantPayments(
  tenantId: string,
  opts: { cursor?: string; limit?: number }
) {
  const limit = opts.limit ?? 20;

  const payments = await prisma.payment.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      amount: true,
      type: true,
      status: true,
      method: true,
      dueDate: true,
      paidAt: true,
      createdAt: true,
    },
  });

  return {
    data: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    nextCursor: payments.length === limit ? payments[payments.length - 1].createdAt.toISOString() : null,
  };
}

// ─── Initiate Payment ─────────────────────────────────────────────────────────

export async function initiateTenantPayment(
  tenantId: string,
  orgId: string,
  paymentId: string
) {
  // Sync Stripe Connect status and get fresh org
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (org.stripeAccountId) {
    await stripeService.syncAccountStatus(orgId, org.stripeAccountId);
  }
  const freshOrg = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

  if (freshOrg.stripeAccountStatus !== 'active') {
    throw new AppError(400, 'CONNECT_NOT_ACTIVE', 'Payments are not yet enabled. Please contact your property manager.');
  }

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, deletedAt: null },
    include: { tenant: { select: { id: true, name: true } } },
  });

  if (!payment) {
    throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  }

  // Security: tenant can only initiate their own payments
  if (payment.tenantId !== tenantId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot initiate payment on behalf of another tenant.');
  }

  // Idempotent: return existing PaymentIntent if one already exists
  if (payment.stripePaymentIntentId) {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });
    const pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    return { clientSecret: pi.client_secret!, paymentIntentId: pi.id, status: pi.status };
  }

  if (payment.status !== 'pending') {
    throw new AppError(400, 'PAYMENT_NOT_PENDING', 'Only pending payments can be initiated via ACH.');
  }

  const pi = await stripeService.createPaymentIntent({
    leaseId: payment.leaseId,
    paymentId,
    tenantName: payment.tenant.name,
    amount: Number(payment.amount),
    stripeAccountId: freshOrg.stripeAccountId!,
  });

  await prisma.payment.update({
    where: { id: paymentId },
    data: { stripePaymentIntentId: pi.id, method: 'ach' },
  });

  return { clientSecret: pi.client_secret!, paymentIntentId: pi.id, status: pi.status };
}

// ─── Work Orders ──────────────────────────────────────────────────────────────

export async function getTenantWorkOrders(
  tenantId: string,
  opts: { cursor?: string; limit?: number }
) {
  const limit = opts.limit ?? 20;

  const workOrders = await prisma.workOrder.findMany({
    where: {
      tenantId,
      ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      category: true,
      priority: true,
      status: true,
      description: true,
      entryPermissionGranted: true,
      scheduledAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    data: workOrders,
    nextCursor:
      workOrders.length === limit
        ? workOrders[workOrders.length - 1].createdAt.toISOString()
        : null,
  };
}

export async function createTenantWorkOrder(
  tenantId: string,
  orgId: string,
  data: SubmitWorkOrderInput
) {
  // Resolve unit from the tenant's active lease
  const leaseParticipant = await prisma.leaseParticipant.findFirst({
    where: {
      tenantId,
      lease: {
        status: { in: ['active', 'month_to_month'] },
        deletedAt: null,
      },
    },
    select: {
      lease: {
        select: {
          unit: { select: { id: true, propertyId: true } },
        },
      },
    },
  });

  if (!leaseParticipant?.lease) {
    throw new AppError(400, 'NO_ACTIVE_LEASE', 'No active lease found. Cannot submit a work order.');
  }

  const { id: unitId, propertyId } = leaseParticipant.lease.unit;

  const workOrder = await prisma.workOrder.create({
    data: {
      unitId,
      propertyId,
      tenantId,
      title: data.title ?? null,
      category: data.category,
      priority: data.priority ?? 'routine',
      status: 'new_order',
      description: data.description,
      entryPermissionGranted: data.entryPermissionGranted,
      preferredContactWindow: data.preferredContactWindow ?? null,
      slaDeadlineAt: computeSlaDeadline(data.priority ?? 'routine'),
      photosBefore: data.photoKeys ?? [],
      photosAfter: [],
    },
    select: {
      id: true,
      title: true,
      category: true,
      priority: true,
      status: true,
      description: true,
      entryPermissionGranted: true,
      createdAt: true,
    },
  });

  return workOrder;
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────

export async function requestTenantUploadUrl(
  orgId: string,
  fileName: string,
  contentType: string
) {
  const s3Key = s3Service.buildS3Key(orgId, 'work_order', 'pending', fileName);
  const { uploadUrl } = await s3Service.generateUploadPresignedUrl(s3Key, contentType);
  return { uploadUrl, s3Key };
}
