import { prisma, MaintenanceCadence, WorkOrderCategory, WorkOrderLocationType, VendorStatus } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import { isVendorManagementActive, resolvePreferredVendor } from './vendor.service';

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

const CADENCE_MONTHS: Record<Exclude<MaintenanceCadence, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
};

function daysInMonth(year: number, monthIndex0: number): number {
  // Day 0 of the *next* month is the last day of monthIndex0.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

// Operates entirely in UTC (nextDueDate is a date-only column, so there's no
// meaningful "local time" to shift by) and clamps the day-of-month to the
// target month's last valid day instead of letting it overflow — plain
// `setMonth`/`setFullYear` on a month-end date (e.g. Jan 31 + 1 month) rolls
// into the following month (Mar 3) rather than landing on Feb's last day.
export function advanceDueDate(from: Date, cadence: MaintenanceCadence): Date {
  if (cadence === 'weekly') {
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  const monthsToAdd = CADENCE_MONTHS[cadence];
  const day = from.getUTCDate();
  const totalMonths = from.getUTCFullYear() * 12 + from.getUTCMonth() + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

// Generates a WorkOrder for a single due schedule and advances its
// nextDueDate. Exported separately from the job loop (groundsMaintenanceJob.ts)
// so it's independently testable and reusable (e.g. a future "generate now"
// manual trigger). Returns null if a concurrent call already claimed this
// occurrence (see the optimistic-concurrency guard below) — the caller
// should treat that as "nothing to do", not an error.
export async function generateWorkOrderForSchedule(
  schedule: {
    id: string;
    organizationId: string;
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

  // Vendor & Contractor Management (Module 5): a schedule with no vendor of
  // its own defaults to the org's preferred vendor for this property+
  // category, if vendor_management is active and one is set. This is a
  // read-only lookup done outside the transaction below (preferred-vendor
  // assignments change rarely, and it doesn't participate in the
  // occurrence-claiming race the transaction guards against). A schedule's
  // own explicit vendorId (Module 3's original "single vendor per schedule")
  // still always wins over the preferred-vendor default — but only while
  // that vendor is still active. A vendor can be marked inactive well after
  // it was set directly on a schedule, and the schedule's recurrence job
  // would otherwise keep generating new work orders assigned to it
  // indefinitely (resolvePreferredVendor's active-only filter only covers
  // the fallback path, since it's never called when schedule.vendorId is
  // set). So an explicit-but-now-inactive vendor is treated the same as "no
  // vendor set" and falls through to the preferred-vendor resolution (or to
  // unassigned, if that also yields nothing).
  let vendorId = schedule.vendorId;
  if (vendorId) {
    const explicitVendor = await prisma.vendor.findFirst({
      where: { id: vendorId },
      select: { status: true },
    });
    if (!explicitVendor || explicitVendor.status !== VendorStatus.active) {
      vendorId = null;
    }
  }
  if (!vendorId && (await isVendorManagementActive(schedule.organizationId))) {
    vendorId = await resolvePreferredVendor(schedule.organizationId, schedule.propertyId, schedule.category);
  }

  return prisma.$transaction(async (tx) => {
    // Claim this occurrence before creating its work order: if two job runs
    // (or two API instances) race on the same due schedule, only the update
    // whose WHERE clause still matches the schedule's current nextDueDate
    // succeeds — the loser's count is 0 and it must not also create a
    // duplicate work order for the same occurrence.
    const { count } = await tx.maintenanceSchedule.updateMany({
      where: { id: schedule.id, nextDueDate: schedule.nextDueDate },
      data: {
        nextDueDate: advanceDueDate(schedule.nextDueDate, schedule.cadence),
        lastGeneratedAt: now,
      },
    });

    if (count === 0) {
      return null;
    }

    const workOrder = await tx.workOrder.create({
      data: {
        propertyId: schedule.propertyId,
        scheduleId: schedule.id,
        vendorId,
        title: schedule.title,
        category: schedule.category,
        priority: 'routine',
        status: vendorId ? 'assigned' : 'new_order',
        locationType: schedule.locationType,
        description: schedule.description || `Recurring ${schedule.title} (auto-generated)`,
        scheduledAt: schedule.nextDueDate,
        photosBefore: [],
        photosAfter: [],
      },
    });

    return workOrder;
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deleteMaintenanceSchedule(organizationId: string, propertyId: string, scheduleId: string) {
  await getMaintenanceSchedule(organizationId, propertyId, scheduleId); // throws if not found

  // WorkOrder.scheduleId is onDelete: SetNull, so a hard delete would keep
  // previously-generated work orders but unlink them — which silently drops
  // them out of the grounds-maintenance compliance report (it only counts
  // work orders with scheduleId still set). Block the delete once a schedule
  // has generated history; pausing (active: false) is the way to stop it
  // without losing that history.
  const generatedCount = await prisma.workOrder.count({ where: { scheduleId } });
  if (generatedCount > 0) {
    throw new AppError(
      400,
      'SCHEDULE_HAS_HISTORY',
      'This schedule has already generated work orders and cannot be deleted — pause it instead to stop future generation without losing its history.'
    );
  }

  await prisma.maintenanceSchedule.delete({ where: { id: scheduleId } });
}
