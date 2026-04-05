import { prisma, WorkOrderStatus, WorkOrderPriority, WorkOrderCategory } from '@propflow/db';
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

const workOrderInclude = {
  unit: {
    select: {
      id: true,
      unitNumber: true,
      property: { select: { id: true, name: true, organizationId: true } },
    },
  },
  tenant: { select: { id: true, name: true, email: true, phone: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  submittedByUser: { select: { id: true, name: true, role: true } },
  vendor: { select: { id: true, companyName: true, contactName: true, phonePrimary: true } },
};

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

  return prisma.workOrder.findMany({
    where: {
      unit: { property: { organizationId } },
      ...(status ? { status: status as WorkOrderStatus } : {}),
      ...(dbPriority ? { priority: dbPriority } : {}),
      ...(category ? { category: category as WorkOrderCategory } : {}),
      ...(propertyId ? { propertyId } : {}),
      ...(unitId ? { unitId } : {}),
      ...(tenantId ? { tenantId } : {}),
    },
    include: workOrderInclude,
    orderBy: [{ slaBreached: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getWorkOrder(organizationId: string, workOrderId: string) {
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      unit: { property: { organizationId } },
    },
    include: workOrderInclude,
  });

  if (!workOrder) {
    throw new AppError(404, 'WORK_ORDER_NOT_FOUND', 'No work order found with that ID in your organization.');
  }

  return workOrder;
}

// ─── Create ───────────────────────────────────────────────────────────────────

interface CreateWorkOrderData {
  unitId: string;
  propertyId?: string | null;
  title?: string | null;
  category: string;
  priority?: string;
  description: string;
  entryPermissionGranted?: boolean;
  preferredContactWindow?: string | null;
  tenantId?: string | null;
  submittedByUserId?: string | null;
}

export async function createWorkOrder(organizationId: string, data: CreateWorkOrderData) {
  // Verify unit belongs to org and get propertyId if not supplied
  const unit = await prisma.unit.findFirst({
    where: { id: data.unitId, property: { organizationId } },
    select: { id: true, propertyId: true },
  });

  if (!unit) {
    throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found in your organization.');
  }

  const requestedPriority = data.priority ?? 'routine';
  const dbPriority = toDbPriority(requestedPriority);

  const workOrder = await prisma.workOrder.create({
    data: {
      unitId: data.unitId,
      propertyId: data.propertyId ?? unit.propertyId,
      title: data.title ?? null,
      category: data.category as WorkOrderCategory,
      priority: dbPriority,
      status: WorkOrderStatus.new_order,
      description: data.description,
      entryPermissionGranted: data.entryPermissionGranted ?? false,
      preferredContactWindow: data.preferredContactWindow ?? null,
      slaDeadlineAt: computeSlaDeadline(requestedPriority),
      tenantId: data.tenantId ?? null,
      submittedByUserId: data.submittedByUserId ?? null,
      // Some local DB states have NOT NULL without default on these columns.
      photosBefore: [],
      photosAfter: [],
    },
    include: workOrderInclude,
  });

  return workOrder;
}

// ─── Update ───────────────────────────────────────────────────────────────────

interface UpdateWorkOrderData {
  status?: string;
  priority?: string;
  assignedToUserId?: string | null;
  vendorId?: string | null;
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
    include: workOrderInclude,
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteWorkOrder(organizationId: string, workOrderId: string) {
  await getWorkOrder(organizationId, workOrderId); // throws if not found

  await prisma.workOrder.delete({ where: { id: workOrderId } });
}
