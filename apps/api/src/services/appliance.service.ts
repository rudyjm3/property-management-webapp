import { prisma, ApplianceCategory, Prisma } from '@propflow/db';
import { APPLIANCE_EXPECTED_LIFESPAN_YEARS } from '@propflow/shared';
import { AppError } from '../middleware/error-handler';

// Recomputes Unit.applianceCount from the appliances table rather than
// incrementing/decrementing in place — that field is nullable (starts at
// null until this module populates it), and Prisma's { increment } compiles
// to `SET appliance_count = appliance_count + 1`, which stays NULL forever
// under Postgres NULL-propagation semantics if the base value was never set.
async function syncApplianceCount(tx: Prisma.TransactionClient, unitId: string): Promise<void> {
  const applianceCount = await tx.appliance.count({ where: { unitId } });
  await tx.unit.update({ where: { id: unitId }, data: { applianceCount } });
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

interface ReplacementAlert {
  ageYears: number;
  expectedLifespanYears: number;
  status: 'approaching' | 'overdue';
}

// Approaching = within 2 years of the category's expected end-of-life.
const APPROACHING_WINDOW_YEARS = 2;

function computeReplacementAlert(
  category: ApplianceCategory,
  installDate: Date | null,
  purchaseDate: Date | null
): ReplacementAlert | null {
  const referenceDate = installDate ?? purchaseDate;
  if (!referenceDate) return null;

  const expectedLifespanYears = APPLIANCE_EXPECTED_LIFESPAN_YEARS[category];
  const ageYears = (Date.now() - referenceDate.getTime()) / MS_PER_YEAR;
  const roundedAge = Math.round(ageYears * 10) / 10;

  if (ageYears >= expectedLifespanYears) {
    return { ageYears: roundedAge, expectedLifespanYears, status: 'overdue' };
  }
  if (ageYears >= expectedLifespanYears - APPROACHING_WINDOW_YEARS) {
    return { ageYears: roundedAge, expectedLifespanYears, status: 'approaching' };
  }
  return null;
}

function decorate<T extends { category: ApplianceCategory; installDate: Date | null; purchaseDate: Date | null }>(
  appliance: T
) {
  return {
    ...appliance,
    replacementAlert: computeReplacementAlert(appliance.category, appliance.installDate, appliance.purchaseDate),
  };
}

async function verifyUnit(organizationId: string, propertyId: string, unitId: string) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, propertyId, property: { organizationId } },
    select: { id: true },
  });

  if (!unit) {
    throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found in your organization.');
  }
}

const maintenanceHistorySelect = {
  id: true,
  category: true,
  status: true,
  priority: true,
  description: true,
  laborCost: true,
  partsCost: true,
  totalCost: true,
  createdAt: true,
  completedAt: true,
} as const;

function sumMaintenanceCost(workOrders: { totalCost: unknown }[]): number {
  return workOrders.reduce((sum, wo) => sum + Number((wo.totalCost as number | null) ?? 0), 0);
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listAppliances(organizationId: string, propertyId: string, unitId: string) {
  await verifyUnit(organizationId, propertyId, unitId);

  const appliances = await prisma.appliance.findMany({
    where: { unitId },
    include: { workOrders: { select: { totalCost: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return appliances.map(({ workOrders, ...appliance }) => ({
    ...decorate(appliance),
    totalMaintenanceCost: sumMaintenanceCost(workOrders),
    workOrderCount: workOrders.length,
  }));
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getAppliance(
  organizationId: string,
  propertyId: string,
  unitId: string,
  applianceId: string
) {
  await verifyUnit(organizationId, propertyId, unitId);

  const appliance = await prisma.appliance.findFirst({
    where: { id: applianceId, unitId },
    include: {
      workOrders: {
        select: maintenanceHistorySelect,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!appliance) {
    throw new AppError(404, 'APPLIANCE_NOT_FOUND', 'Appliance not found on this unit.');
  }

  const { workOrders, ...rest } = appliance;

  return {
    ...decorate(rest),
    totalMaintenanceCost: sumMaintenanceCost(workOrders),
    maintenanceHistory: workOrders,
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

interface ApplianceInput {
  category: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  installDate?: string | null;
  warrantyExpiresAt?: string | null;
  notes?: string | null;
}

function toDateOrNull(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}

export async function createAppliance(
  organizationId: string,
  propertyId: string,
  unitId: string,
  data: ApplianceInput
) {
  await verifyUnit(organizationId, propertyId, unitId);

  const appliance = await prisma.$transaction(async (tx) => {
    const created = await tx.appliance.create({
      data: {
        unitId,
        category: data.category as ApplianceCategory,
        make: data.make ?? null,
        model: data.model ?? null,
        serialNumber: data.serialNumber ?? null,
        purchaseDate: toDateOrNull(data.purchaseDate) ?? null,
        installDate: toDateOrNull(data.installDate) ?? null,
        warrantyExpiresAt: toDateOrNull(data.warrantyExpiresAt) ?? null,
        notes: data.notes ?? null,
      },
    });

    await syncApplianceCount(tx, unitId);

    return created;
  });

  return decorate(appliance);
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateAppliance(
  organizationId: string,
  propertyId: string,
  unitId: string,
  applianceId: string,
  data: Partial<ApplianceInput>
) {
  await verifyUnit(organizationId, propertyId, unitId);

  const existing = await prisma.appliance.findFirst({ where: { id: applianceId, unitId } });
  if (!existing) {
    throw new AppError(404, 'APPLIANCE_NOT_FOUND', 'Appliance not found on this unit.');
  }

  const updated = await prisma.appliance.update({
    where: { id: applianceId },
    data: {
      ...(data.category !== undefined && { category: data.category as ApplianceCategory }),
      ...(data.make !== undefined && { make: data.make }),
      ...(data.model !== undefined && { model: data.model }),
      ...(data.serialNumber !== undefined && { serialNumber: data.serialNumber }),
      ...(data.purchaseDate !== undefined && { purchaseDate: toDateOrNull(data.purchaseDate) }),
      ...(data.installDate !== undefined && { installDate: toDateOrNull(data.installDate) }),
      ...(data.warrantyExpiresAt !== undefined && { warrantyExpiresAt: toDateOrNull(data.warrantyExpiresAt) }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });

  return decorate(updated);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteAppliance(
  organizationId: string,
  propertyId: string,
  unitId: string,
  applianceId: string
) {
  await verifyUnit(organizationId, propertyId, unitId);

  const existing = await prisma.appliance.findFirst({ where: { id: applianceId, unitId } });
  if (!existing) {
    throw new AppError(404, 'APPLIANCE_NOT_FOUND', 'Appliance not found on this unit.');
  }

  // Linked work orders keep their history — WorkOrder.applianceId is ON DELETE
  // SET NULL, so deleting an appliance record never deletes its work orders.
  await prisma.$transaction(async (tx) => {
    await tx.appliance.delete({ where: { id: applianceId } });
    await syncApplianceCount(tx, unitId);
  });
}
