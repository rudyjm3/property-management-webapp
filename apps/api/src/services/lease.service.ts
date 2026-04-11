import { prisma } from '@propflow/db';
import { LeaseType } from '@prisma/client';
import { AppError } from '../middleware/error-handler';
import { CURRENT_LEASE_STATUSES } from '../constants';

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
  renewalOf: {
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  },
  renewals: {
    orderBy: { startDate: 'desc' as const },
    take: 1,
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
    },
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
  type?: string | null;
  rentAmount: number;
  depositAmount: number;
  startDate: string;
  endDate?: string | null;
  noticePeriodDays?: number;
  rentDueDay?: number;
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

  // Check for any existing current lease on the unit (active, month-to-month, or notice given)
  const existingActive = await prisma.lease.findFirst({
    where: { unitId, status: { in: [...CURRENT_LEASE_STATUSES] }, deletedAt: null },
  });

  if (existingActive) {
    throw new AppError(409, 'UNIT_ALREADY_LEASED', 'This unit already has a current lease.');
  }

  // Create lease + participants in a transaction, then update unit status
  const lease = await prisma.$transaction(async (tx) => {
    const startDate = new Date(leaseFields.startDate);
    const endDate = leaseFields.endDate ? new Date(leaseFields.endDate) : new Date(startDate);
    if (!leaseFields.endDate) {
      // Month-to-month compatibility: keep schema-required endDate populated.
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const created = await tx.lease.create({
      data: {
        unit: { connect: { id: unitId } },
        type: (leaseFields.type as LeaseType) ?? null,
        rentAmount: leaseFields.rentAmount,
        depositAmount: leaseFields.depositAmount,
        startDate,
        endDate,
        noticePeriodDays: leaseFields.noticePeriodDays ?? 30,
        rentDueDay: leaseFields.rentDueDay ?? 1,
        lateFeeAmount: leaseFields.lateFeeAmount,
        lateFeeGraceDays: leaseFields.lateFeeGraceDays,
        utilitiesIncluded: [],
        hasPetAddendum: false,
        hasParkingAddendum: false,
        occupantCount: 1,
        occupantNames: [],
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
  moveOutDate?: string | null;
  lateFeeAmount?: number;
  lateFeeGraceDays?: number;
  securityDepositStatus?: string;
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
  if (data.moveOutDate) updateData.moveOutDate = new Date(data.moveOutDate);
  if (data.moveOutDate === null) updateData.moveOutDate = null;

  // If the update would set this lease back to a current status, ensure no other
  // current lease already exists on the same unit (guards against reactivating
  // a lease after a renewal has already created a replacement).
  if (data.status && CURRENT_LEASE_STATUSES.includes(data.status as typeof CURRENT_LEASE_STATUSES[number])) {
    const conflicting = await prisma.lease.findFirst({
      where: {
        unitId: existing.unitId,
        id: { not: leaseId },
        status: { in: [...CURRENT_LEASE_STATUSES] },
        deletedAt: null,
      },
    });
    if (conflicting) {
      throw new AppError(
        409,
        'UNIT_ALREADY_LEASED',
        'This unit already has a current lease. End it before reactivating this one.'
      );
    }
  }

  // If status is changing to expired/notice_given, update unit status
  const lease = await prisma.$transaction(async (tx) => {
    const updated = await tx.lease.update({
      where: { id: leaseId },
      data: updateData,
      include: leaseInclude,
    });

    if (data.status === 'expired' || data.status === 'terminated') {
      await tx.unit.update({ where: { id: existing.unitId }, data: { status: 'vacant' } });
    } else if (data.status === 'notice_given') {
      await tx.unit.update({ where: { id: existing.unitId }, data: { status: 'notice' } });
    }

    // Propagate rent amount change to all pending payments for this lease
    if (data.rentAmount !== undefined) {
      await tx.payment.updateMany({
        where: { leaseId, status: 'pending', deletedAt: null },
        data: { amount: data.rentAmount },
      });
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
  type?: string | null;
  noticePeriodDays?: number;
}

export async function renewLease(
  organizationId: string,
  leaseId: string,
  data: RenewLeaseData
) {
  const existing = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
    include: { participants: { orderBy: { isPrimary: 'desc' } } },
  });

  if (!existing) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  if (!CURRENT_LEASE_STATUSES.includes(existing.status as typeof CURRENT_LEASE_STATUSES[number])) {
    throw new AppError(400, 'LEASE_NOT_RENEWABLE', 'Only active or notice-given leases can be renewed.');
  }

  const parsedStartDate = new Date(data.startDate);
  const parsedEndDate = new Date(data.endDate);
  const previousEndDate = new Date(existing.endDate);

  if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
    throw new AppError(400, 'INVALID_DATES', 'Start date and end date must be valid dates.');
  }

  if (parsedEndDate <= parsedStartDate) {
    throw new AppError(400, 'INVALID_DATE_RANGE', 'Renewal end date must be after the renewal start date.');
  }

  if (parsedStartDate <= previousEndDate) {
    throw new AppError(
      400,
      'LEASE_RENEWAL_OVERLAP',
      'Renewal start date must be after the current lease end date to avoid overlap.'
    );
  }

  const participants = existing.participants;

  const newLease = await prisma.$transaction(async (tx) => {
    // Mark old lease as expired (it ran its course — terminated is for early break)
    await tx.lease.update({ where: { id: leaseId }, data: { status: 'expired' } });

    // Create new lease copying key terms from old lease
    const created = await tx.lease.create({
      data: {
        unit: { connect: { id: existing.unitId } },
        rentAmount: data.rentAmount,
        depositAmount: existing.depositAmount,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        type: (data.type as LeaseType) ?? existing.type,
        lateFeeAmount: existing.lateFeeAmount,
        lateFeeGraceDays: existing.lateFeeGraceDays,
        rentDueDay: existing.rentDueDay,
        noticePeriodDays: data.noticePeriodDays ?? existing.noticePeriodDays,
        utilitiesIncluded: existing.utilitiesIncluded ?? [],
        hasPetAddendum: existing.hasPetAddendum ?? false,
        petDepositAmount: existing.petDepositAmount ?? null,
        hasParkingAddendum: existing.hasParkingAddendum ?? false,
        parkingFee: existing.parkingFee ?? null,
        occupantCount: existing.occupantCount ?? 1,
        occupantNames: existing.occupantNames ?? [],
        renewalOf: { connect: { id: leaseId } },
        status: 'active',
        participants: {
          create: participants.map((p) => ({
            tenant: { connect: { id: p.tenantId } },
            isPrimary: p.isPrimary,
          })),
        },
      },
      include: leaseInclude,
    });

    // Ensure unit stays occupied
    await tx.unit.update({ where: { id: existing.unitId }, data: { status: 'occupied' } });

    return created;
  });

  return {
    ...newLease,
    createdLeaseId: newLease.id,
    previousLeaseStatus: existing.status,
  };
}

// ─── Add Participant ──────────────────────────────────────────────────────────

export async function addParticipant(
  organizationId: string,
  leaseId: string,
  tenantId: string
) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
    include: { participants: true },
  });

  if (!lease) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId, deletedAt: null },
  });

  if (!tenant) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found in your organization.');
  }

  const alreadyOn = lease.participants.some((p) => p.tenantId === tenantId);
  if (alreadyOn) {
    throw new AppError(409, 'TENANT_ALREADY_ON_LEASE', 'This tenant is already on the lease.');
  }

  await prisma.leaseParticipant.create({
    data: { leaseId, tenantId, isPrimary: false },
  });

  return prisma.lease.findFirst({
    where: { id: leaseId },
    include: leaseInclude,
  });
}

// ─── Remove Participant ───────────────────────────────────────────────────────

export async function removeParticipant(
  organizationId: string,
  leaseId: string,
  participantId: string
) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
    include: { participants: true },
  });

  if (!lease) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  const participant = lease.participants.find((p) => p.id === participantId);
  if (!participant) {
    throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Participant not found on this lease.');
  }

  if (lease.participants.length === 1) {
    throw new AppError(400, 'LAST_PARTICIPANT', 'Cannot remove the only tenant from a lease.');
  }

  await prisma.leaseParticipant.delete({ where: { id: participantId } });

  // If we removed the primary, promote the first remaining participant
  if (participant.isPrimary) {
    const remaining = lease.participants.find((p) => p.id !== participantId);
    if (remaining) {
      await prisma.leaseParticipant.update({
        where: { id: remaining.id },
        data: { isPrimary: true },
      });
    }
  }

  return prisma.lease.findFirst({
    where: { id: leaseId },
    include: leaseInclude,
  });
}

// ─── Set Primary Participant ──────────────────────────────────────────────────

export async function setPrimaryParticipant(
  organizationId: string,
  leaseId: string,
  participantId: string
) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
    include: { participants: true },
  });

  if (!lease) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  const participant = lease.participants.find((p) => p.id === participantId);
  if (!participant) {
    throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Participant not found on this lease.');
  }

  if (participant.isPrimary) {
    return prisma.lease.findFirst({ where: { id: leaseId }, include: leaseInclude });
  }

  await prisma.$transaction([
    prisma.leaseParticipant.updateMany({
      where: { leaseId },
      data: { isPrimary: false },
    }),
    prisma.leaseParticipant.update({
      where: { id: participantId },
      data: { isPrimary: true },
    }),
  ]);

  return prisma.lease.findFirst({ where: { id: leaseId }, include: leaseInclude });
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export async function deleteLease(organizationId: string, leaseId: string) {
  const existing = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
  });

  if (!existing) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  if (CURRENT_LEASE_STATUSES.includes(existing.status as typeof CURRENT_LEASE_STATUSES[number])) {
    throw new AppError(
      400,
      'LEASE_IS_ACTIVE',
      'Cannot delete a current lease. Change the status to expired first.'
    );
  }

  await prisma.lease.update({
    where: { id: leaseId },
    data: { deletedAt: new Date() },
  });
}
