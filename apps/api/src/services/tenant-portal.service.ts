import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import * as stripeService from './stripe.service';
import * as s3Service from './s3.service';
import type { SubmitWorkOrderInput, UpdateTenantProfileInput } from '@propflow/shared';

const SLA_HOURS: Record<string, number> = {
  emergency: 1,
  urgent: 24,
  routine: 7 * 24,
};

function computeSlaDeadline(priority: string): Date {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.routine;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function getTenantDocumentScope(tenantId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      leaseParticipants: {
        where: {
          lease: {
            status: { in: ['active', 'month_to_month'] },
            deletedAt: null,
          },
        },
        select: { leaseId: true },
      },
    },
  });

  if (!tenant) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found.');
  }

  return {
    tenantId: tenant.id,
    organizationId: tenant.organizationId,
    activeLeaseIds: tenant.leaseParticipants.map((p) => p.leaseId),
  };
}

async function loadTenantProfile(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      avatarUrl: true,
      preferredContact: true,
      languagePreference: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      emergencyContact1Relationship: true,
      emergencyContact1Email: true,
      emergencyContact2Name: true,
      emergencyContact2Phone: true,
      emergencyContact2Relationship: true,
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
    preferredContact: tenant.preferredContact,
    languagePreference: tenant.languagePreference,
    emergencyContactName: tenant.emergencyContactName,
    emergencyContactPhone: tenant.emergencyContactPhone,
    emergencyContact1Relationship: tenant.emergencyContact1Relationship,
    emergencyContact1Email: tenant.emergencyContact1Email,
    emergencyContact2Name: tenant.emergencyContact2Name,
    emergencyContact2Phone: tenant.emergencyContact2Phone,
    emergencyContact2Relationship: tenant.emergencyContact2Relationship,
    portalStatus: tenant.portalStatus,
    activeLease,
    organization: tenant.organization,
  };
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getTenantProfile(tenantId: string) {
  return loadTenantProfile(tenantId);
}

export async function updateTenantProfile(tenantId: string, input: UpdateTenantProfileInput) {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.preferredContact !== undefined ? { preferredContact: input.preferredContact } : {}),
      ...(input.languagePreference !== undefined ? { languagePreference: input.languagePreference } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.emergencyContactName !== undefined ? { emergencyContactName: input.emergencyContactName } : {}),
      ...(input.emergencyContactPhone !== undefined ? { emergencyContactPhone: input.emergencyContactPhone } : {}),
      ...(input.emergencyContact1Relationship !== undefined ? { emergencyContact1Relationship: input.emergencyContact1Relationship } : {}),
      ...(input.emergencyContact1Email !== undefined ? { emergencyContact1Email: input.emergencyContact1Email } : {}),
      ...(input.emergencyContact2Name !== undefined ? { emergencyContact2Name: input.emergencyContact2Name } : {}),
      ...(input.emergencyContact2Phone !== undefined ? { emergencyContact2Phone: input.emergencyContact2Phone } : {}),
      ...(input.emergencyContact2Relationship !== undefined ? { emergencyContact2Relationship: input.emergencyContact2Relationship } : {}),
    },
  });

  return loadTenantProfile(tenantId);
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
      referenceNote: true,
      notes: true,
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

export async function getTenantDocuments(tenantId: string) {
  const scope = await getTenantDocumentScope(tenantId);

  return prisma.document.findMany({
    where: {
      organizationId: scope.organizationId,
      visibleToTenant: true,
      OR: [
        { entityType: 'tenant', entityId: scope.tenantId },
        ...(scope.activeLeaseIds.length > 0
          ? [{ entityType: 'lease' as const, entityId: { in: scope.activeLeaseIds } }]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      mimeType: true,
      sizeBytes: true,
      docCategory: true,
      label: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTenantDocumentDownloadUrl(tenantId: string, documentId: string) {
  const scope = await getTenantDocumentScope(tenantId);

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: scope.organizationId,
      visibleToTenant: true,
      OR: [
        { entityType: 'tenant', entityId: scope.tenantId },
        ...(scope.activeLeaseIds.length > 0
          ? [{ entityType: 'lease' as const, entityId: { in: scope.activeLeaseIds } }]
          : []),
      ],
    },
    select: { s3Key: true },
  });

  if (!document) {
    throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  }

  const downloadUrl = await s3Service.generateDownloadPresignedUrl(document.s3Key);
  return { downloadUrl };
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
