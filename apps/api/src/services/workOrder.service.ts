import {
  prisma,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderCategory,
  WorkOrderLocationType,
} from '@propflow/db';
import { MODULE_KEYS } from '@propflow/shared';
import { AppError } from '../middleware/error-handler';

// ─── SLA deadline helpers ──────────────────────────────────────────────────────

const SLA_HOURS: Record<string, number> = {
  emergency: 1,
  urgent: 24,
  routine: 7 * 24,
};

function toDbPriority(priority: string): WorkOrderPriority {
  // Backward compatibility: older DB enum uses "normal" where newer UI uses "routine".
  if (priority === 'routine') return WorkOrderPriority.normal;
  return priority as WorkOrderPriority;
}

function computeSlaDeadline(priority: string): Date {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.routine;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// ─── Shared include shape ─────────────────────────────────────────────────────

const workOrderIncludeBase = {
  unit: {
    select: {
      id: true,
      unitNumber: true,
      property: { select: { id: true, name: true, organizationId: true } },
    },
  },
  property: { select: { id: true, name: true, organizationId: true } },
  tenant: { select: { id: true, name: true, email: true, phone: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  submittedByUser: { select: { id: true, name: true, role: true } },
  vendor: { select: { id: true, companyName: true, contactName: true, phonePrimary: true } },
};

const workOrderIncludeWithAppliance = {
  ...workOrderIncludeBase,
  appliance: { select: { id: true, category: true, make: true, model: true } },
};

function workOrderIncludeFor(unitIntelligenceActive: boolean) {
  return unitIntelligenceActive ? workOrderIncludeWithAppliance : workOrderIncludeBase;
}

// WorkOrder itself ships ungated, but appliance linking (WorkOrder.applianceId)
// is Module 2's (Unit Intelligence & Appliance Registry) own feature. Without
// this check, an org could keep creating/reading appliance links through this
// always-open router after deactivating the module — bypassing the gate that's
// only applied at the appliances.ts router mount.
async function isUnitIntelligenceActive(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { activeModules: true },
  });
  return org?.activeModules.includes(MODULE_KEYS.UNIT_INTELLIGENCE) ?? false;
}

// Org scoping: unit-scoped orders resolve via unit → property; property-level
// orders (unitId null) resolve via their direct property relation. The second
// branch is restricted to unitId: null so a unit-scoped order with a stale or
// mismatched property_id can never be matched via the wrong org's property.
function orgScope(organizationId: string) {
  return {
    OR: [
      { unit: { property: { organizationId } } },
      { unitId: null, property: { organizationId } },
    ],
  };
}

// ─── List ─────────────────────────────────────────────────────────────────────

interface ListWorkOrdersOptions {
  status?: string;
  priority?: string;
  category?: string;
  propertyId?: string;
  unitId?: string;
  tenantId?: string;
  limit?: number;
}

export async function listWorkOrders(organizationId: string, opts: ListWorkOrdersOptions = {}) {
  const { status, priority, category, propertyId, unitId, tenantId, limit = 100 } = opts;
  const dbPriority = priority ? toDbPriority(priority) : undefined;
  const moduleActive = await isUnitIntelligenceActive(organizationId);

  return prisma.workOrder.findMany({
    where: {
      ...orgScope(organizationId),
      ...(status ? { status: status as WorkOrderStatus } : {}),
      ...(dbPriority ? { priority: dbPriority } : {}),
      ...(category ? { category: category as WorkOrderCategory } : {}),
      ...(propertyId ? { propertyId } : {}),
      ...(unitId ? { unitId } : {}),
      ...(tenantId ? { tenantId } : {}),
    },
    include: workOrderIncludeFor(moduleActive),
    orderBy: [{ slaBreached: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getWorkOrder(organizationId: string, workOrderId: string) {
  const moduleActive = await isUnitIntelligenceActive(organizationId);

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      ...orgScope(organizationId),
    },
    include: workOrderIncludeFor(moduleActive),
  });

  if (!workOrder) {
    throw new AppError(404, 'WORK_ORDER_NOT_FOUND', 'No work order found with that ID in your organization.');
  }

  return workOrder;
}

// ─── Create ───────────────────────────────────────────────────────────────────

interface CreateWorkOrderData {
  unitId?: string | null;
  propertyId?: string | null;
  applianceId?: string | null;
  title?: string | null;
  category: string;
  priority?: string;
  locationType?: string | null;
  isCapitalProject?: boolean;
  description: string;
  entryPermissionGranted?: boolean;
  preferredContactWindow?: string | null;
  tenantId?: string | null;
  submittedByUserId?: string | null;
}

export async function createWorkOrder(organizationId: string, data: CreateWorkOrderData) {
  let unitId: string | null = null;
  let propertyId: string | null = null;
  let tenantId: string | null = null;
  let applianceId: string | null = null;
  const moduleActive = await isUnitIntelligenceActive(organizationId);

  if (data.unitId) {
    // Unit-scoped: verify unit belongs to org; property always derived from the
    // unit so the pair can never mismatch.
    const unit = await prisma.unit.findFirst({
      where: { id: data.unitId, property: { organizationId } },
      select: { id: true, propertyId: true },
    });

    if (!unit) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found in your organization.');
    }

    unitId = unit.id;
    propertyId = unit.propertyId;

    if (data.tenantId) {
      // Verify the caller-supplied tenantId actually belongs to this org AND
      // has an active/month-to-month lease on this specific unit — checking
      // organizationId alone would still let staff attach a tenant from an
      // unrelated unit, and getTenantWorkOrders() surfaces any work order
      // matching { tenantId } in that tenant's own portal regardless of
      // which unit it's for.
      const participant = await prisma.leaseParticipant.findFirst({
        where: {
          tenantId: data.tenantId,
          lease: {
            unitId,
            status: { in: ['active', 'month_to_month'] },
            deletedAt: null,
          },
        },
        select: { tenantId: true },
      });

      if (!participant) {
        throw new AppError(
          404,
          'TENANT_NOT_FOUND',
          'Tenant not found or has no active lease on this unit.'
        );
      }

      tenantId = participant.tenantId;
    }

    if (data.applianceId) {
      if (!moduleActive) {
        throw new AppError(
          403,
          'MODULE_NOT_ACTIVE',
          'The "unit_intelligence" module is not active for this organization.'
        );
      }

      // Verify the appliance belongs to this specific unit — an appliance
      // record from a different unit (even in the same org) must never be
      // linkable to this work order.
      const appliance = await prisma.appliance.findFirst({
        where: { id: data.applianceId, unitId },
        select: { id: true },
      });

      if (!appliance) {
        throw new AppError(404, 'APPLIANCE_NOT_FOUND', 'Appliance not found on this unit.');
      }

      applianceId = appliance.id;
    }
  } else {
    // Property-level (common area): no unit, no tenant.
    if (!data.propertyId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Either unitId or propertyId is required.');
    }

    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, organizationId },
      select: { id: true },
    });

    if (!property) {
      throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found in your organization.');
    }

    propertyId = property.id;
    tenantId = null;
  }

  const requestedPriority = data.priority ?? 'routine';
  const dbPriority = toDbPriority(requestedPriority);

  const workOrder = await prisma.workOrder.create({
    data: {
      unitId,
      propertyId,
      title: data.title ?? null,
      category: data.category as WorkOrderCategory,
      priority: dbPriority,
      status: WorkOrderStatus.new_order,
      locationType: (data.locationType ?? null) as WorkOrderLocationType | null,
      isCapitalProject: data.isCapitalProject ?? false,
      description: data.description,
      entryPermissionGranted: data.entryPermissionGranted ?? false,
      preferredContactWindow: data.preferredContactWindow ?? null,
      slaDeadlineAt: computeSlaDeadline(requestedPriority),
      tenantId,
      applianceId,
      submittedByUserId: data.submittedByUserId ?? null,
      // Some local DB states have NOT NULL without default on these columns.
      photosBefore: [],
      photosAfter: [],
    },
    include: workOrderIncludeFor(moduleActive),
  });

  return workOrder;
}

// ─── Update ───────────────────────────────────────────────────────────────────

interface UpdateWorkOrderData {
  status?: string;
  priority?: string;
  locationType?: string | null;
  isCapitalProject?: boolean;
  assignedToUserId?: string | null;
  vendorId?: string | null;
  applianceId?: string | null;
  scheduledAt?: string | null;
  resolutionNotes?: string | null;
  laborCost?: number | null;
  partsCost?: number | null;
  totalCost?: number | null;
  chargedToTenant?: boolean | null;
  tenantChargeAmount?: number | null;
  slaBreached?: boolean;
  entryPermissionGranted?: boolean;
  preferredContactWindow?: string | null;
}

export async function updateWorkOrder(
  organizationId: string,
  workOrderId: string,
  data: UpdateWorkOrderData
) {
  const existing = await getWorkOrder(organizationId, workOrderId); // throws if not found

  if (data.chargedToTenant === true && !existing.tenantId) {
    throw new AppError(
      400,
      'NO_TENANT_TO_CHARGE',
      'This work order has no associated tenant to charge.'
    );
  }

  // Verify caller-supplied vendorId/assignedToUserId belong to this org before
  // writing them — otherwise another org's vendor/staff contact info could be
  // attached to (and leaked via) this work order.
  if (data.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: data.vendorId, organizationId },
      select: { id: true },
    });
    if (!vendor) {
      throw new AppError(404, 'VENDOR_NOT_FOUND', 'Vendor not found in your organization.');
    }
  }
  if (data.assignedToUserId) {
    const assignee = await prisma.user.findFirst({
      where: { id: data.assignedToUserId, organizationId },
      select: { id: true },
    });
    if (!assignee) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Assignee not found in your organization.');
    }
  }
  const moduleActive = await isUnitIntelligenceActive(organizationId);
  if (data.applianceId) {
    if (!moduleActive) {
      throw new AppError(
        403,
        'MODULE_NOT_ACTIVE',
        'The "unit_intelligence" module is not active for this organization.'
      );
    }
    if (!existing.unitId) {
      throw new AppError(
        400,
        'NO_UNIT_FOR_APPLIANCE',
        'Property-level work orders cannot be linked to an appliance.'
      );
    }
    const appliance = await prisma.appliance.findFirst({
      where: { id: data.applianceId, unitId: existing.unitId },
      select: { id: true },
    });
    if (!appliance) {
      throw new AppError(404, 'APPLIANCE_NOT_FOUND', "Appliance not found on this work order's unit.");
    }
  }

  const updateData: Record<string, unknown> = { ...data };

  // Auto-transition to 'assigned' when a staff member or vendor is first set
  if (
    (data.assignedToUserId || data.vendorId) &&
    existing.status === 'new_order' &&
    !data.status
  ) {
    updateData.status = 'assigned';
  }

  if (data.scheduledAt !== undefined) {
    updateData.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  }

  // Auto-set completedAt when status moves to completed/closed
  if (data.status === 'completed' || data.status === 'closed') {
    updateData.completedAt = new Date();
  }

  // Recompute SLA deadline if priority changes
  if (data.priority) {
    updateData.priority = toDbPriority(data.priority);
    updateData.slaDeadlineAt = computeSlaDeadline(data.priority);
  }

  return prisma.workOrder.update({
    where: { id: workOrderId },
    data: updateData,
    include: workOrderIncludeFor(moduleActive),
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteWorkOrder(organizationId: string, workOrderId: string) {
  await getWorkOrder(organizationId, workOrderId); // throws if not found

  await prisma.workOrder.delete({ where: { id: workOrderId } });
}
