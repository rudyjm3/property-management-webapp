import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import { CURRENT_LEASE_STATUSES } from '../constants';

export async function listTenants(organizationId: string) {
  return prisma.tenant.findMany({
    where: { organizationId, deletedAt: null },
    include: {
      leaseParticipants: {
        where: {
          lease: { status: { in: [...CURRENT_LEASE_STATUSES] } },
        },
        include: {
          lease: {
            select: {
              status: true,
              endDate: true,
              unit: {
                select: {
                  id: true,
                  unitNumber: true,
                  property: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function getTenant(organizationId: string, tenantId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId, deletedAt: null },
    include: {
      leaseParticipants: {
        include: {
          lease: {
            include: {
              unit: {
                select: {
                  id: true,
                  unitNumber: true,
                  propertyId: true,
                  property: { select: { id: true, name: true, address: true } },
                },
              },
            },
          },
        },
        orderBy: { lease: { startDate: 'desc' } },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      workOrders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!tenant) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }

  return tenant;
}

interface CreateTenantData {
  email: string;
  name: string;
  phone?: string | null;
  fullLegalName?: string | null;
  dateOfBirth?: string | null;
  currentAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContact1Relationship?: string | null;
}

function normalizeOptionalString(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTenantData(data: Partial<CreateTenantData>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  if (data.email !== undefined) normalized.email = data.email.trim().toLowerCase();
  if (data.name !== undefined) normalized.name = data.name.trim();
  if (data.phone !== undefined) normalized.phone = normalizeOptionalString(data.phone);
  if (data.fullLegalName !== undefined) normalized.fullLegalName = normalizeOptionalString(data.fullLegalName);
  if (data.currentAddress !== undefined) normalized.currentAddress = normalizeOptionalString(data.currentAddress);
  if (data.emergencyContactName !== undefined) normalized.emergencyContactName = normalizeOptionalString(data.emergencyContactName);
  if (data.emergencyContactPhone !== undefined) normalized.emergencyContactPhone = normalizeOptionalString(data.emergencyContactPhone);
  if (data.emergencyContact1Relationship !== undefined) {
    normalized.emergencyContact1Relationship = normalizeOptionalString(data.emergencyContact1Relationship);
  }

  if (data.dateOfBirth !== undefined) {
    normalized.dateOfBirth = data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00.000Z`) : null;
  }

  return normalized;
}

export async function createTenant(
  organizationId: string,
  data: CreateTenantData
) {
  const normalizedData = normalizeTenantData(data);
  const normalizedEmail = String(normalizedData.email ?? '').trim().toLowerCase();

  // Check for duplicate email within the organization
  const existing = await prisma.tenant.findFirst({
    where: { organizationId, email: normalizedEmail, deletedAt: null },
  });

  if (existing) {
    throw new AppError(
      409,
      'TENANT_EMAIL_EXISTS',
      'A tenant with this email already exists in your organization'
    );
  }

  return prisma.tenant.create({
    data: {
      ...(normalizedData as any),
      organization: { connect: { id: organizationId } },
    },
  });
}

export async function updateTenant(
  organizationId: string,
  tenantId: string,
  data: Partial<CreateTenantData>
) {
  const normalizedData = normalizeTenantData(data);

  const existing = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId, deletedAt: null },
  });

  if (!existing) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }

  // If email is being changed, check for duplicates
  if (normalizedData.email && normalizedData.email !== existing.email) {
    const emailTaken = await prisma.tenant.findFirst({
      where: {
        organizationId,
        email: String(normalizedData.email),
        deletedAt: null,
        id: { not: tenantId },
      },
    });

    if (emailTaken) {
      throw new AppError(
        409,
        'TENANT_EMAIL_EXISTS',
        'A tenant with this email already exists in your organization'
      );
    }
  }

  return prisma.tenant.update({
    where: { id: tenantId },
    data: normalizedData as any,
  });
}

export async function deleteTenant(organizationId: string, tenantId: string) {
  const existing = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId, deletedAt: null },
    include: {
      leaseParticipants: {
        where: { lease: { status: { in: [...CURRENT_LEASE_STATUSES] } } },
        take: 1,
      },
    },
  });

  if (!existing) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }

  if (existing.leaseParticipants.length > 0) {
    throw new AppError(
      400,
      'TENANT_HAS_ACTIVE_LEASE',
      'Cannot delete a tenant with an active lease. End the lease first.'
    );
  }

  // Soft delete
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { deletedAt: new Date() },
  });
}
