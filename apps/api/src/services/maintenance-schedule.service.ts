import { prisma, MaintenanceCadence, WorkOrderCategory, WorkOrderLocationType } from '@propflow/db';
import { AppError } from '../middleware/error-handler';

// Grounds & Property Maintenance (Module 3). See docs/reference/modules.md
// for what "recurring" covers in v1: a fixed cadence set
// (weekly/monthly/quarterly/semi_annual/annual), not a full cron-style rule
// engine, and no support for e.g. "every 2nd Tuesday" or custom intervals.

async function verifyProperty(organizationId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
    select: { id: true },
  });
  if (!property) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found in your organization.');
  }
}

async function verifyVendor(organizationId: string, vendorId: string) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId },
    select: { id: true },
  });
  if (!vendor) {
    throw new AppError(404, 'VENDOR_NOT_FOUND', 'Vendor not found in your organization.');
  }
}

const scheduleInclude = {
  vendor: { select: { id: true, companyName: true, contactName: true, phonePrimary: true } },
  property: { select: { id: true, name: true } },
} as const;

// ─── List / Get ─────────────────────────────────────────────────────────────

export async function listMaintenanceSchedules(organizationId: string, propertyId: string) {
  await verifyProperty(organizationId, propertyId);
  return prisma.maintenanceSchedule.findMany({
    where: { propertyId },
    include: scheduleInclude,
    orderBy: { nextDueDate: 'asc' },
  });
}

export async function getMaintenanceSchedule(organizationId: string, propertyId: string, scheduleId: string) {
  await verifyProperty(organizationId, propertyId);
  const schedule = await prisma.maintenanceSchedule.findFirst({
    where: { id: scheduleId, propertyId },
    include: scheduleInclude,
  });
  if (!schedule) {
    throw new AppError(404, 'SCHEDULE_NOT_FOUND', 'Maintenance schedule not found on this property.');
  }
  return schedule;
}

// ─── Create ───────────────────────────────────────────────────────────────

interface CreateScheduleInput {
  title: string;
  category?: string;
  locationType?: string | null;
  description?: string | null;
  cadence: string;
  vendorId?: string | null;
  nextDueDate: string;
  active?: boolean;
}

export async function createMaintenanceSchedule(
  organizationId: string,
  propertyId: string,
  data: CreateScheduleInput
) {
  await verifyProperty(organizationId, propertyId);
  if (data.vendorId) {
    await verifyVendor(organizationId, data.vendorId);
  }

  return prisma.maintenanceSchedule.create({
    data: {
      organizationId,
      propertyId,
      title: data.title,
      category: (data.category ?? 'grounds') as WorkOrderCategory,
      locationType: (data.locationType ?? null) as WorkOrderLocationType | null,
      description: data.description ?? null,
      cadence: data.cadence as MaintenanceCadence,
      vendorId: data.vendorId ?? null,
      nextDueDate: new Date(data.nextDueDate),
      active: data.active ?? true,
    },
    include: scheduleInclude,
  });
}

// ─── Update ───────────────────────────────────────────────────────────────

interface UpdateScheduleInput {
  title?: string;
  category?: string;
  locationType?: string | null;
  description?: string | null;
  cadence?: string;
  vendorId?: string | null;
  nextDueDate?: string;
  active?: boolean;
}

export async function updateMaintenanceSchedule(
  organizationId: string,
  propertyId: string,
  scheduleId: string,
  data: UpdateScheduleInput
) {
  await getMaintenanceSchedule(organizationId, propertyId, scheduleId); // throws if not found
  if (data.vendorId) {
    await verifyVendor(organizationId, data.vendorId);
  }

  return prisma.maintenanceSchedule.update({
    where: { id: scheduleId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.category !== undefined && { category: data.category as WorkOrderCategory }),
      ...(data.locationType !== undefined && { locationType: data.locationType as WorkOrderLocationType | null }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.cadence !== undefined && { cadence: data.cadence as MaintenanceCadence }),
      ...(data.vendorId !== undefined && { vendorId: data.vendorId }),
      ...(data.nextDueDate !== undefined && { nextDueDate: new Date(data.nextDueDate) }),
      ...(data.active !== undefined && { active: data.active }),
    },
    include: scheduleInclude,
  });
}

// ─── Recurrence ─────────────────────────────────────────────────────────────
// Advances a schedule's nextDueDate forward by its cadence. Always steps from
// the schedule's own nextDueDate (not "now"), so a schedule that was paused
// (active: false) for a while and reactivated resumes on its original cadence
// alignment rather than drifting to the reactivation date.

export function advanceDueDate(from: Date, cadence: MaintenanceCadence): Date {
  const next = new Date(from);
  switch (cadence) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'semi_annual':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'annual':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

// Generates a WorkOrder for a single due schedule and advances its
// nextDueDate. Exported separately from the job loop (groundsMaintenanceJob.ts)
// so it's independently testable and reusable (e.g. a future "generate now"
// manual trigger).
export async function generateWorkOrderForSchedule(
  schedule: {
    id: string;
    propertyId: string;
    vendorId: string | null;
    title: string;
    category: WorkOrderCategory;
    locationType: WorkOrderLocationType | null;
    description: string | null;
    cadence: MaintenanceCadence;
    nextDueDate: Date;
  }
) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.create({
      data: {
        propertyId: schedule.propertyId,
        scheduleId: schedule.id,
        vendorId: schedule.vendorId,
        title: schedule.title,
        category: schedule.category,
        priority: 'routine',
        status: schedule.vendorId ? 'assigned' : 'new_order',
        locationType: schedule.locationType,
        description: schedule.description || `Recurring ${schedule.title} (auto-generated)`,
        scheduledAt: schedule.nextDueDate,
        photosBefore: [],
        photosAfter: [],
      },
    });

    await tx.maintenanceSchedule.update({
      where: { id: schedule.id },
      data: {
        nextDueDate: advanceDueDate(schedule.nextDueDate, schedule.cadence),
        lastGeneratedAt: now,
      },
    });

    return workOrder;
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deleteMaintenanceSchedule(organizationId: string, propertyId: string, scheduleId: string) {
  await getMaintenanceSchedule(organizationId, propertyId, scheduleId); // throws if not found
  // WorkOrder.scheduleId is onDelete: SetNull, so previously-generated work
  // orders are kept and simply unlinked from the deleted schedule.
  await prisma.maintenanceSchedule.delete({ where: { id: scheduleId } });
}
