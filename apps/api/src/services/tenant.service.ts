import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';

export async function listTenants(organizationId: string) {
  return prisma.tenant.findMany({
    where: { organizationId, deletedAt: null },
    include: {
      leaseParticipants: {
        where: {
          lease: { status: 'active' },
        },
        include: {
          lease: {
            include: {
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
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

export async function createTenant(
  organizationId: string,
  data: CreateTenantData
) {
  // Check for duplicate email within the organization
  const existing = await prisma.tenant.findFirst({
    where: { organizationId, email: data.email, deletedAt: null },
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
      ...data,
      organization: { connect: { id: organizationId } },
    },
  });
}

export async function updateTenant(
  organizationId: string,
  tenantId: string,
  data: Partial<CreateTenantData>
) {
  const existing = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId, deletedAt: null },
  });

  if (!existing) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }

  // If email is being changed, check for duplicates
  if (data.email && data.email !== existing.email) {
    const emailTaken = await prisma.tenant.findFirst({
      where: { organizationId, email: data.email, deletedAt: null, id: { not: tenantId } },
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
    data,
  });
}

export async function deleteTenant(organizationId: string, tenantId: string) {
  const existing = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId, deletedAt: null },
    include: {
      leaseParticipants: {
        where: { lease: { status: 'active' } },
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
