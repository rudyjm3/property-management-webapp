import { prisma, Prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import { sendPropertyDeletionNotification } from './email.service';
import { CURRENT_LEASE_STATUSES } from '../constants';

export async function listProperties(organizationId: string) {
  return prisma.property.findMany({
    where: { organizationId },
    include: {
      _count: { select: { units: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function getProperty(organizationId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
    include: {
      units: {
        orderBy: { unitNumber: 'asc' },
        include: {
          leases: {
            where: { status: { in: [...CURRENT_LEASE_STATUSES] } },
            include: {
              participants: {
                include: { tenant: { select: { id: true, name: true, email: true } } },
              },
            },
            take: 1,
          },
        },
      },
      _count: { select: { units: true } },
    },
  });

  if (!property) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
  }

  return property;
}

export async function createProperty(
  organizationId: string,
  data: Record<string, unknown>
) {
  const { organizationId: _, ...rest } = data;
  return prisma.property.create({
    data: {
      organization: { connect: { id: organizationId } },
      ...rest,
    } as Prisma.PropertyCreateInput,
    include: { _count: { select: { units: true } } },
  });
}

export async function updateProperty(
  organizationId: string,
  propertyId: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
  });

  if (!existing) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
  }

  return prisma.property.update({
    where: { id: propertyId },
    data,
    include: { _count: { select: { units: true } } },
  });
}

export async function deleteProperty(organizationId: string, propertyId: string) {
  const existing = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
    include: {
      _count: { select: { units: true } },
      organization: { select: { name: true } },
    },
  });

  if (!existing) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
  }

  if (existing._count.units > 0) {
    throw new AppError(
      400,
      'PROPERTY_HAS_UNITS',
      'Cannot delete a property that still has units. Remove all units first.'
    );
  }

  await prisma.property.delete({ where: { id: propertyId } });

  // Fire-and-forget email to org owner — failure must not surface as an error
  const owner = await prisma.user.findFirst({
    where: { organizationId, role: 'owner' },
    select: { name: true, email: true },
  });

  if (owner) {
    sendPropertyDeletionNotification({
      ownerName: owner.name,
      ownerEmail: owner.email,
      propertyName: existing.name,
      propertyAddress: `${existing.address}, ${existing.city}, ${existing.state} ${existing.zip}`,
      unitCount: existing._count.units,
      deletedAt: new Date(),
      organizationName: existing.organization.name,
    }).catch(() => {});
  }
}
