import { prisma, Prisma, VendorStatus, WorkOrderStatus, WorkOrderCategory } from '@propflow/db';
import { MODULE_KEYS, VENDOR_EXPIRY_ALERT_LOOKAHEAD_DAYS } from '@propflow/shared';
import { AppError } from '../middleware/error-handler';

// Vendor & Contractor Management (Module 5). Base vendor CRUD (this file's
// list/get/create/update/delete) ships ungated as base product — see
// docs/reference/modules.md for exactly why the line is drawn there. The
// functions below that, gated behind requireModule('vendor_management') at
// the route layer in routes/vendors.ts and routes/workOrders.ts, are the
// module's net-new functionality: expiry alerts, work-history/spend
// aggregation, per-completion ratings, and preferred-vendor-by-category
// assignments.

export async function isVendorManagementActive(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { activeModules: true },
  });
  return org?.activeModules.includes(MODULE_KEYS.VENDOR_MANAGEMENT) ?? false;
}

// ─── Base CRUD (ungated) ────────────────────────────────────────────────────

export async function listVendors(organizationId: string, opts: { activeOnly?: boolean } = {}) {
  return prisma.vendor.findMany({
    where: {
      organizationId,
      ...(opts.activeOnly ? { status: VendorStatus.active } : {}),
    },
    select: {
      id: true,
      companyName: true,
      contactName: true,
      phonePrimary: true,
      email: true,
      specialties: true,
      status: true,
      preferred: true,
      rating: true,
      licenseExpiresAt: true,
      insuranceExpiresAt: true,
    },
    orderBy: [{ preferred: 'desc' }, { companyName: 'asc' }],
  });
}

export async function getVendor(organizationId: string, vendorId: string) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId },
  });
  if (!vendor) {
    throw new AppError(404, 'VENDOR_NOT_FOUND', 'Vendor not found in your organization.');
  }
  return vendor;
}

interface VendorInput {
  companyName: string;
  contactName: string;
  email: string;
  phonePrimary: string;
  phoneEmergency?: string | null;
  specialties: string[];
  status?: string;
  preferred?: boolean | null;
  notes?: string | null;
  licenseNumber?: string | null;
  licenseExpiresAt?: string | null;
  insuranceOnFile?: boolean;
  insuranceExpiresAt?: string | null;
}

export async function createVendor(organizationId: string, data: VendorInput) {
  return prisma.vendor.create({
    data: {
      organizationId,
      companyName: data.companyName,
      contactName: data.contactName,
      email: data.email,
      phonePrimary: data.phonePrimary,
      phoneEmergency: data.phoneEmergency ?? null,
      specialties: data.specialties,
      status: (data.status ?? 'active') as VendorStatus,
      preferred: data.preferred ?? null,
      notes: data.notes ?? null,
      licenseNumber: data.licenseNumber ?? null,
      licenseExpiresAt: data.licenseExpiresAt ? new Date(data.licenseExpiresAt) : null,
      insuranceOnFile: data.insuranceOnFile ?? false,
      insuranceExpiresAt: data.insuranceExpiresAt ? new Date(data.insuranceExpiresAt) : null,
    },
  });
}

export async function updateVendor(organizationId: string, vendorId: string, data: Partial<VendorInput>) {
  await getVendor(organizationId, vendorId); // throws if not found

  return prisma.vendor.update({
    where: { id: vendorId },
    data: {
      ...(data.companyName !== undefined && { companyName: data.companyName }),
      ...(data.contactName !== undefined && { contactName: data.contactName }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phonePrimary !== undefined && { phonePrimary: data.phonePrimary }),
      ...(data.phoneEmergency !== undefined && { phoneEmergency: data.phoneEmergency }),
      ...(data.specialties !== undefined && { specialties: data.specialties }),
      ...(data.status !== undefined && { status: data.status as VendorStatus }),
      ...(data.preferred !== undefined && { preferred: data.preferred }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.licenseNumber !== undefined && { licenseNumber: data.licenseNumber }),
      ...(data.licenseExpiresAt !== undefined && {
        licenseExpiresAt: data.licenseExpiresAt ? new Date(data.licenseExpiresAt) : null,
      }),
      ...(data.insuranceOnFile !== undefined && { insuranceOnFile: data.insuranceOnFile }),
      ...(data.insuranceExpiresAt !== undefined && {
        insuranceExpiresAt: data.insuranceExpiresAt ? new Date(data.insuranceExpiresAt) : null,
      }),
    },
  });
}

export async function deleteVendor(organizationId: string, vendorId: string) {
  await getVendor(organizationId, vendorId); // throws if not found

  // Block deletion once a vendor has any linked work-order history,
  // maintenance-schedule history, or a preferred-vendor assignment —
  // deleting it would either fail on the FK (schedules, preferred
  // assignments — both Restrict) or silently orphan cost/rating history
  // (work orders' vendor relation has no explicit onDelete, so Prisma's
  // default for an optional FK is Restrict, but we want a clear error
  // rather than a raw DB one).
  const [workOrderCount, scheduleCount, preferredAssignmentCount] = await Promise.all([
    prisma.workOrder.count({ where: { vendorId } }),
    prisma.maintenanceSchedule.count({ where: { vendorId } }),
    prisma.preferredVendorAssignment.count({ where: { vendorId } }),
  ]);
  if (workOrderCount > 0 || scheduleCount > 0 || preferredAssignmentCount > 0) {
    throw new AppError(
      400,
      'VENDOR_HAS_HISTORY',
      'This vendor has associated work orders, maintenance schedules, or preferred-vendor assignments and cannot be deleted — set it to inactive instead.'
    );
  }

  await prisma.vendor.delete({ where: { id: vendorId } });
}

// ─── Expiry alerts (Module 5) ───────────────────────────────────────────────

export interface VendorExpiryAlert {
  id: string;
  companyName: string;
  contactName: string;
  licenseNumber: string | null;
  licenseExpiresAt: Date | null;
  licenseStatus: 'expired' | 'expiring' | null;
  insuranceExpiresAt: Date | null;
  insuranceStatus: 'expired' | 'expiring' | null;
}

function expiryStatus(expiresAt: Date | null, now: Date, lookaheadMs: number): 'expired' | 'expiring' | null {
  if (!expiresAt) return null;
  if (expiresAt.getTime() < now.getTime()) return 'expired';
  if (expiresAt.getTime() <= now.getTime() + lookaheadMs) return 'expiring';
  return null;
}

// Flags active vendors whose license and/or insurance is already expired or
// expiring within VENDOR_EXPIRY_ALERT_LOOKAHEAD_DAYS. Computed live on read
// (like the dashboard's lease-expiry section) — there is no persisted
// "alert" row; see vendorExpiryAlertJob.ts for the scheduled counterpart,
// which currently only logs for ops visibility rather than writing anything
// this function reads back.
export async function getVendorExpiryAlerts(organizationId: string): Promise<VendorExpiryAlert[]> {
  const now = new Date();
  const lookaheadMs = VENDOR_EXPIRY_ALERT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;
  const lookaheadDate = new Date(now.getTime() + lookaheadMs);

  const vendors = await prisma.vendor.findMany({
    where: {
      organizationId,
      status: VendorStatus.active,
      OR: [{ licenseExpiresAt: { lte: lookaheadDate } }, { insuranceExpiresAt: { lte: lookaheadDate } }],
    },
    select: {
      id: true,
      companyName: true,
      contactName: true,
      licenseNumber: true,
      licenseExpiresAt: true,
      insuranceExpiresAt: true,
    },
    orderBy: { companyName: 'asc' },
  });

  return vendors
    .map((v) => ({
      ...v,
      licenseStatus: expiryStatus(v.licenseExpiresAt, now, lookaheadMs),
      insuranceStatus: expiryStatus(v.insuranceExpiresAt, now, lookaheadMs),
    }))
    .filter((v) => v.licenseStatus !== null || v.insuranceStatus !== null);
}

// ─── Work history / spend tracking (Module 5) ──────────────────────────────
// Aggregates completed WorkOrders assigned to a vendor, including ones
// generated by a Module 3 MaintenanceSchedule — those are just regular
// WorkOrder rows with vendorId set (via scheduleId), so no special-casing is
// needed to cover them here.

const HISTORY_TERMINAL_STATUSES: WorkOrderStatus[] = ['completed', 'closed'];

export async function getVendorWorkHistory(organizationId: string, vendorId: string, months: number) {
  await getVendor(organizationId, vendorId); // throws if not found, verifies org scope

  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const workOrders = await prisma.workOrder.findMany({
    where: {
      vendorId,
      status: { in: HISTORY_TERMINAL_STATUSES },
      completedAt: { gte: since },
    },
    select: {
      id: true,
      category: true,
      completedAt: true,
      laborCost: true,
      partsCost: true,
      totalCost: true,
      scheduleId: true,
      vendorRating: { select: { rating: true, note: true, createdAt: true } },
    },
    orderBy: { completedAt: 'desc' },
  });

  const costOf = (wo: (typeof workOrders)[number]) => {
    if (wo.totalCost != null) return Number(wo.totalCost);
    const labor = wo.laborCost != null ? Number(wo.laborCost) : 0;
    const parts = wo.partsCost != null ? Number(wo.partsCost) : 0;
    return labor + parts;
  };

  const byCategory = new Map<WorkOrderCategory, { count: number; spend: number }>();
  let totalSpend = 0;
  let scheduleGeneratedCount = 0;

  for (const wo of workOrders) {
    const cost = costOf(wo);
    totalSpend += cost;
    if (wo.scheduleId) scheduleGeneratedCount++;
    const entry = byCategory.get(wo.category) ?? { count: 0, spend: 0 };
    entry.count += 1;
    entry.spend += cost;
    byCategory.set(wo.category, entry);
  }

  const ratings = workOrders.map((wo) => wo.vendorRating).filter((r): r is NonNullable<typeof r> => r !== null);
  const ratingAverage = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : null;

  return {
    range: { since, months },
    count: workOrders.length,
    scheduleGeneratedCount,
    totalSpend,
    byCategory: Array.from(byCategory.entries()).map(([category, v]) => ({ category, ...v })),
    ratings: {
      count: ratings.length,
      average: ratingAverage,
      recent: ratings.slice(0, 10),
    },
  };
}

// ─── Per-completion ratings (Module 5) ─────────────────────────────────────
// Approach (a) from the module spec: keep the existing single running
// Vendor.rating field (used by e.g. listVendors' ordering) as a rolling
// average, recomputed from all VendorWorkOrderRating rows every time one is
// created, rather than replacing it outright.

// Recomputes Vendor.rating as the average of all its VendorWorkOrderRating
// rows, inside the caller's transaction. Concurrent rating submissions for
// the same vendor (or a rating create racing a rating delete, e.g. from
// workOrder.service.ts's deleteWorkOrder) can each read a stale _avg before
// the other commits, undercounting whichever update lands last — so this
// takes a session-level advisory lock keyed by vendorId first, mirroring the
// pattern in appliance.service.ts's syncApplianceCount, to serialize the
// read-aggregate-write against any other in-flight recompute for the same
// vendor.
export async function recomputeVendorRating(
  tx: Prisma.TransactionClient,
  vendorId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${vendorId})::bigint)`;

  const agg = await tx.vendorWorkOrderRating.aggregate({
    where: { vendorId },
    _avg: { rating: true },
  });

  await tx.vendor.update({
    where: { id: vendorId },
    data: { rating: agg._avg.rating ?? null },
  });
}

export async function rateVendorWorkOrder(
  organizationId: string,
  workOrderId: string,
  data: { rating: number; note?: string | null }
) {
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      OR: [{ unit: { property: { organizationId } } }, { unitId: null, property: { organizationId } }],
    },
    select: { id: true, vendorId: true, status: true },
  });

  if (!workOrder) {
    throw new AppError(404, 'WORK_ORDER_NOT_FOUND', 'No work order found with that ID in your organization.');
  }
  if (!workOrder.vendorId) {
    throw new AppError(400, 'NO_VENDOR_ASSIGNED', 'This work order has no vendor assigned to rate.');
  }
  if (!HISTORY_TERMINAL_STATUSES.includes(workOrder.status)) {
    throw new AppError(400, 'WORK_ORDER_NOT_COMPLETE', 'Only a completed or closed work order can be rated.');
  }

  const existing = await prisma.vendorWorkOrderRating.findUnique({ where: { workOrderId } });
  if (existing) {
    throw new AppError(400, 'ALREADY_RATED', 'This work order already has a vendor rating on file.');
  }

  const vendorId = workOrder.vendorId;

  const rating = await prisma.$transaction(async (tx) => {
    const created = await tx.vendorWorkOrderRating.create({
      data: { workOrderId, vendorId, rating: data.rating, note: data.note ?? null },
    });

    await recomputeVendorRating(tx, vendorId);

    return created;
  });

  return rating;
}

// ─── Preferred vendor assignments (Module 5) ───────────────────────────────

export async function listPreferredVendorAssignments(organizationId: string) {
  return prisma.preferredVendorAssignment.findMany({
    where: { organizationId },
    include: {
      vendor: { select: { id: true, companyName: true, contactName: true } },
      property: { select: { id: true, name: true } },
    },
    orderBy: [{ category: 'asc' }, { propertyId: 'asc' }],
  });
}

interface PreferredVendorAssignmentInput {
  propertyId?: string | null;
  category: string;
  vendorId: string;
}

// Manual find-then-write instead of prisma's `upsert` — Postgres treats each
// NULL in a unique index as distinct, so the DB-level
// @@unique([organizationId, propertyId, category]) constraint does NOT by
// itself stop duplicate org-wide (propertyId: null) rows for the same
// category, and `upsert` relies on that same constraint to find the existing
// row. This explicit lookup handles the null case correctly.
export async function upsertPreferredVendorAssignment(
  organizationId: string,
  data: PreferredVendorAssignmentInput
) {
  const propertyId = data.propertyId ?? null;

  if (propertyId) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId }, select: { id: true } });
    if (!property) {
      throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found in your organization.');
    }
  }

  const vendor = await prisma.vendor.findFirst({ where: { id: data.vendorId, organizationId }, select: { id: true } });
  if (!vendor) {
    throw new AppError(404, 'VENDOR_NOT_FOUND', 'Vendor not found in your organization.');
  }

  const existing = await prisma.preferredVendorAssignment.findFirst({
    where: { organizationId, propertyId, category: data.category as WorkOrderCategory },
  });

  if (existing) {
    return prisma.preferredVendorAssignment.update({
      where: { id: existing.id },
      data: { vendorId: data.vendorId },
      include: { vendor: { select: { id: true, companyName: true } }, property: { select: { id: true, name: true } } },
    });
  }

  try {
    return await prisma.preferredVendorAssignment.create({
      data: {
        organizationId,
        propertyId,
        category: data.category as WorkOrderCategory,
        vendorId: data.vendorId,
      },
      include: { vendor: { select: { id: true, companyName: true } }, property: { select: { id: true, name: true } } },
    });
  } catch (err) {
    // Backstop for the race between the findFirst above and this create:
    // the DB-level partial unique index (organization_id, category) WHERE
    // property_id IS NULL — see migration 20260918022840_fix_module5_fk_drift
    // — rejects a concurrent duplicate org-wide assignment with P2002. Turn
    // that into the same clean application error rather than a raw 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(
        400,
        'PREFERRED_ASSIGNMENT_EXISTS',
        'A preferred vendor assignment for this property/category already exists.'
      );
    }
    throw err;
  }
}

export async function deletePreferredVendorAssignment(organizationId: string, assignmentId: string) {
  const existing = await prisma.preferredVendorAssignment.findFirst({
    where: { id: assignmentId, organizationId },
  });
  if (!existing) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Preferred vendor assignment not found in your organization.');
  }
  await prisma.preferredVendorAssignment.delete({ where: { id: assignmentId } });
}

// Looks up the preferred vendor for a (propertyId, category) pair: an exact
// property+category match first, then falling back to the org-wide
// (propertyId: null) default for that category. Returns null if neither
// exists — callers should treat that as "no default, leave vendorId unset".
// Callers are expected to check isVendorManagementActive() themselves before
// calling this (see workOrder.service.ts and maintenance-schedule.service.ts)
// so a deactivated module stops auto-assigning without deleting the
// assignment rows.
export async function resolvePreferredVendor(
  organizationId: string,
  propertyId: string | null,
  category: string
): Promise<string | null> {
  // Filters to vendor.status === active so an inactive vendor (the
  // documented alternative to deletion when it has work history) doesn't
  // keep getting auto-assigned to new work orders — an inactive match just
  // falls through to the next fallback tier (or to null, "no default").
  if (propertyId) {
    const propertyMatch = await prisma.preferredVendorAssignment.findFirst({
      where: {
        organizationId,
        propertyId,
        category: category as WorkOrderCategory,
        vendor: { status: VendorStatus.active },
      },
      select: { vendorId: true },
    });
    if (propertyMatch) return propertyMatch.vendorId;
  }

  const orgWideMatch = await prisma.preferredVendorAssignment.findFirst({
    where: {
      organizationId,
      propertyId: null,
      category: category as WorkOrderCategory,
      vendor: { status: VendorStatus.active },
    },
    select: { vendorId: true },
  });

  return orgWideMatch?.vendorId ?? null;
}
