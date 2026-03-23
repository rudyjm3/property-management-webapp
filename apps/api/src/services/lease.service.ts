import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';

// ─── Shared include shape used across list/get ────────────────────────────────

const leaseInclude = {
  unit: {
    select: {
      id: true,
      unitNumber: true,
      propertyId: true,
      property: { select: { id: true, name: true, address: true, organizationId: true } },
    },
  },
  participants: {
    include: {
      tenant: {
        select: { id: true, name: true, email: true, phone: true },
      },
    },
  },
  payments: {
    orderBy: { dueDate: 'desc' as const },
    take: 12,
  },
};

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listLeases(organizationId: string) {
  return prisma.lease.findMany({
    where: {
      deletedAt: null,
      unit: { property: { organizationId } },
    },
    include: leaseInclude,
    orderBy: { endDate: 'asc' },
  });
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getLease(organizationId: string, leaseId: string) {
  const lease = await prisma.lease.findFirst({
    where: {
      id: leaseId,
      deletedAt: null,
      unit: { property: { organizationId } },
    },
    include: leaseInclude,
  });

  if (!lease) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  return lease;
}

// ─── Create ───────────────────────────────────────────────────────────────────

interface CreateLeaseData {
  unitId: string;
  tenantIds: string[];
  rentAmount: number;
  depositAmount: number;
  startDate: string;
  endDate: string;
  lateFeeAmount: number;
  lateFeeGraceDays: number;
  notes?: string | null;
}

export async function createLease(organizationId: string, data: CreateLeaseData) {
  const { unitId, tenantIds, ...leaseFields } = data;

  // Verify the unit belongs to this org
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, property: { organizationId } },
  });

  if (!unit) {
    throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found in your organization.');
  }

  // Verify all tenants belong to this org
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds }, organizationId, deletedAt: null },
  });

  if (tenants.length !== tenantIds.length) {
    throw new AppError(400, 'TENANT_NOT_FOUND', 'One or more tenants were not found in your organization.');
  }

  // Check for an existing active lease on the unit
  const existingActive = await prisma.lease.findFirst({
    where: { unitId, status: 'active', deletedAt: null },
  });

  if (existingActive) {
    throw new AppError(409, 'UNIT_ALREADY_LEASED', 'This unit already has an active lease.');
  }

  // Create lease + participants in a transaction, then update unit status
  const lease = await prisma.$transaction(async (tx) => {
    const created = await tx.lease.create({
      data: {
        unit: { connect: { id: unitId } },
        rentAmount: leaseFields.rentAmount,
        depositAmount: leaseFields.depositAmount,
        startDate: new Date(leaseFields.startDate),
        endDate: new Date(leaseFields.endDate),
        lateFeeAmount: leaseFields.lateFeeAmount,
        lateFeeGraceDays: leaseFields.lateFeeGraceDays,
        notes: leaseFields.notes,
        participants: {
          create: tenantIds.map((tenantId, index) => ({
            tenant: { connect: { id: tenantId } },
            isPrimary: index === 0,
          })),
        },
      },
      include: leaseInclude,
    });

    await tx.unit.update({
      where: { id: unitId },
      data: { status: 'occupied' },
    });

    return created;
  });

  return lease;
}

// ─── Update ───────────────────────────────────────────────────────────────────

interface UpdateLeaseData {
  status?: string;
  rentAmount?: number;
  depositAmount?: number;
  endDate?: string;
  lateFeeAmount?: number;
  lateFeeGraceDays?: number;
  notes?: string | null;
}

export async function updateLease(
  organizationId: string,
  leaseId: string,
  data: UpdateLeaseData
) {
  const existing = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
    include: { unit: true },
  });

  if (!existing) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  const updateData: Record<string, unknown> = { ...data };
  if (data.endDate) updateData.endDate = new Date(data.endDate);

  // If status is changing to expired/notice_given, update unit status
  const lease = await prisma.$transaction(async (tx) => {
    const updated = await tx.lease.update({
      where: { id: leaseId },
      data: updateData,
      include: leaseInclude,
    });

    if (data.status === 'expired') {
      await tx.unit.update({ where: { id: existing.unitId }, data: { status: 'vacant' } });
    } else if (data.status === 'notice_given') {
      await tx.unit.update({ where: { id: existing.unitId }, data: { status: 'notice' } });
    }

    return updated;
  });

  return lease;
}

// ─── Renew ────────────────────────────────────────────────────────────────────

interface RenewLeaseData {
  startDate: string;
  endDate: string;
  rentAmount: number;
}

export async function renewLease(
  organizationId: string,
  leaseId: string,
  data: RenewLeaseData
) {
  const existing = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
    include: { participants: true },
  });

  if (!existing) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  if (!['active', 'month_to_month', 'notice_given'].includes(existing.status)) {
    throw new AppError(400, 'LEASE_NOT_RENEWABLE', 'Only active or notice-given leases can be renewed.');
  }

  const tenantIds = existing.participants.map((p) => p.tenantId);

  const newLease = await prisma.$transaction(async (tx) => {
    // Mark old lease as expired
    await tx.lease.update({ where: { id: leaseId }, data: { status: 'expired' } });

    // Create new lease with same unit/tenants but new dates/rent
    const created = await tx.lease.create({
      data: {
        unit: { connect: { id: existing.unitId } },
        rentAmount: data.rentAmount,
        depositAmount: existing.depositAmount,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        lateFeeAmount: existing.lateFeeAmount,
        lateFeeGraceDays: existing.lateFeeGraceDays,
        status: 'active',
        participants: {
          create: tenantIds.map((tenantId, index) => ({
            tenant: { connect: { id: tenantId } },
            isPrimary: index === 0,
          })),
        },
      },
      include: leaseInclude,
    });

    // Ensure unit stays occupied
    await tx.unit.update({ where: { id: existing.unitId }, data: { status: 'occupied' } });

    return created;
  });

  return newLease;
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export async function deleteLease(organizationId: string, leaseId: string) {
  const existing = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
  });

  if (!existing) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  if (existing.status === 'active') {
    throw new AppError(
      400,
      'LEASE_IS_ACTIVE',
      'Cannot delete an active lease. Change the status to expired first.'
    );
  }

  await prisma.lease.update({
    where: { id: leaseId },
    data: { deletedAt: new Date() },
  });
}
