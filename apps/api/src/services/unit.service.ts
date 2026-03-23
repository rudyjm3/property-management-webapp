import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import { CURRENT_LEASE_STATUSES } from '../constants';

export async function listUnits(organizationId: string, propertyId: string) {
  // Verify property belongs to organization
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
  });

  if (!property) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
  }

  return prisma.unit.findMany({
    where: { propertyId },
    include: {
      leases: {
        where: { status: { in: [...CURRENT_LEASE_STATUSES] } },
        include: {
          participants: {
            where: { isPrimary: true },
            include: { tenant: { select: { id: true, name: true, email: true, phone: true } } },
          },
        },
        take: 1,
      },
      _count: { select: { workOrders: true } },
    },
    orderBy: { unitNumber: 'asc' },
  });
}

export async function getUnit(organizationId: string, propertyId: string, unitId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
  });

  if (!property) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
  }

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, propertyId },
    include: {
      property: { select: { id: true, name: true, address: true, city: true, state: true, zip: true } },
      leases: {
        include: {
          participants: {
            include: { tenant: true },
          },
        },
        orderBy: { startDate: 'desc' },
      },
      workOrders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!unit) {
    throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found');
  }

  return unit;
}

interface CreateUnitData {
  unitNumber: string;
  floor?: number | null;
  bedrooms: number;
  bathrooms: number;
  sqFt?: number | null;
  rentAmount: number;
  depositAmount: number;
  status?: 'vacant' | 'occupied' | 'notice' | 'maintenance';
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
}

export async function createUnit(
  organizationId: string,
  propertyId: string,
  data: CreateUnitData
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
  });

  if (!property) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
  }

  const unit = await prisma.unit.create({
    data: {
      ...data,
      property: { connect: { id: propertyId } },
    },
  });

  // Update property unit count
  await prisma.property.update({
    where: { id: propertyId },
    data: { unitCount: { increment: 1 } },
  });

  return unit;
}

export async function updateUnit(
  organizationId: string,
  propertyId: string,
  unitId: string,
  data: Partial<CreateUnitData>
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
  });

  if (!property) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
  }

  const existing = await prisma.unit.findFirst({
    where: { id: unitId, propertyId },
  });

  if (!existing) {
    throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found');
  }

  return prisma.unit.update({
    where: { id: unitId },
    data,
  });
}

export async function deleteUnit(
  organizationId: string,
  propertyId: string,
  unitId: string
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
  });

  if (!property) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
  }

  const existing = await prisma.unit.findFirst({
    where: { id: unitId, propertyId },
    include: {
      leases: { where: { status: { in: [...CURRENT_LEASE_STATUSES] } }, take: 1 },
    },
  });

  if (!existing) {
    throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found');
  }

  if (existing.leases.length > 0) {
    throw new AppError(
      400,
      'UNIT_HAS_ACTIVE_LEASE',
      'Cannot delete a unit with an active lease'
    );
  }

  await prisma.unit.delete({ where: { id: unitId } });

  // Update property unit count
  await prisma.property.update({
    where: { id: propertyId },
    data: { unitCount: { decrement: 1 } },
  });
}
