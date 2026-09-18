import { prisma, InspectionType, InspectionStatus, InspectionMediaType, Prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import { buildStorageKey, generateUploadPresignedUrl } from './storage.service';

// Inspections & Compliance (Module 6). See docs/reference/modules.md for what's
// simplified in v1: template configurability, GPS best-effort/unverified,
// client-side-only PDF export, and the typed-name+IP+timestamp signature
// mechanism (mirrors lease-esignature.service.ts, not a canvas-drawn image).

async function verifyUnit(organizationId: string, propertyId: string, unitId: string) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, propertyId, property: { organizationId } },
    select: { id: true },
  });
  if (!unit) {
    throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found in your organization.');
  }
}

async function verifyLease(organizationId: string, leaseId: string, unitId: string) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, unitId, unit: { property: { organizationId } }, deletedAt: null },
    select: { id: true },
  });
  if (!lease) {
    throw new AppError(400, 'LEASE_NOT_FOUND', 'That lease was not found for this unit.');
  }
}

// Verify caller-supplied inspectorUserId/templateId belong to this org before
// writing them — otherwise another org's staff/template could be attached to
// (and leaked via) this inspection. Mirrors workOrder.service.ts's
// vendorId/assignedToUserId scoping check.
async function verifyInspector(organizationId: string, inspectorUserId: string) {
  const user = await prisma.user.findFirst({
    where: { id: inspectorUserId, organizationId },
    select: { id: true },
  });
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Inspector not found in your organization.');
  }
}

async function verifyTemplate(organizationId: string, templateId: string) {
  const template = await prisma.inspectionTemplate.findFirst({
    where: { id: templateId, organizationId },
    select: { id: true },
  });
  if (!template) {
    throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Inspection template not found in your organization.');
  }
}

const inspectionInclude = {
  inspector: { select: { id: true, name: true, role: true } },
  template: { select: { id: true, name: true } },
  media: { orderBy: { capturedAt: 'asc' as const } },
} satisfies Prisma.InspectionInclude;

// ─── List / Get ─────────────────────────────────────────────────────────────

export async function listInspections(organizationId: string, propertyId: string, unitId: string) {
  await verifyUnit(organizationId, propertyId, unitId);
  return prisma.inspection.findMany({
    where: { unitId },
    include: inspectionInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getInspection(
  organizationId: string,
  propertyId: string,
  unitId: string,
  inspectionId: string
) {
  await verifyUnit(organizationId, propertyId, unitId);
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, unitId },
    include: inspectionInclude,
  });
  if (!inspection) {
    throw new AppError(404, 'INSPECTION_NOT_FOUND', 'Inspection not found on this unit.');
  }
  return inspection;
}

// ─── Create / Schedule ──────────────────────────────────────────────────────

interface CreateInspectionInput {
  type: string;
  leaseId?: string | null;
  scheduledAt?: string | null;
  inspectorUserId?: string | null;
  templateId?: string | null;
  notes?: string | null;
}

export async function createInspection(
  organizationId: string,
  propertyId: string,
  unitId: string,
  data: CreateInspectionInput
) {
  await verifyUnit(organizationId, propertyId, unitId);
  if (data.leaseId) {
    await verifyLease(organizationId, data.leaseId, unitId);
  }
  if (data.inspectorUserId) {
    await verifyInspector(organizationId, data.inspectorUserId);
  }
  if (data.templateId) {
    await verifyTemplate(organizationId, data.templateId);
  }

  return prisma.inspection.create({
    data: {
      organizationId,
      unitId,
      leaseId: data.leaseId ?? null,
      type: data.type as InspectionType,
      status: 'scheduled',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      inspectorUserId: data.inspectorUserId ?? null,
      templateId: data.templateId ?? null,
      notes: data.notes ?? null,
      checklistResults: [],
    },
    include: inspectionInclude,
  });
}

// ─── Update (reschedule, reassign inspector, edit notes/status) ────────────

interface UpdateInspectionInput {
  type?: string;
  leaseId?: string | null;
  scheduledAt?: string | null;
  inspectorUserId?: string | null;
  templateId?: string | null;
  notes?: string | null;
  status?: string;
}

async function getExistingInspection(unitId: string, inspectionId: string) {
  const existing = await prisma.inspection.findFirst({ where: { id: inspectionId, unitId } });
  if (!existing) {
    throw new AppError(404, 'INSPECTION_NOT_FOUND', 'Inspection not found on this unit.');
  }
  return existing;
}

export async function updateInspection(
  organizationId: string,
  propertyId: string,
  unitId: string,
  inspectionId: string,
  data: UpdateInspectionInput
) {
  await verifyUnit(organizationId, propertyId, unitId);
  const existing = await getExistingInspection(unitId, inspectionId);

  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw new AppError(400, 'INSPECTION_FINALIZED', 'A completed or cancelled inspection cannot be edited.');
  }

  if (data.leaseId !== undefined && data.leaseId !== null) {
    await verifyLease(organizationId, data.leaseId, unitId);
  }
  if (data.inspectorUserId !== undefined && data.inspectorUserId !== null) {
    await verifyInspector(organizationId, data.inspectorUserId);
  }
  if (data.templateId !== undefined && data.templateId !== null) {
    await verifyTemplate(organizationId, data.templateId);
  }

  // 'completed' and 'cancelled' are terminal states with their own dedicated
  // endpoints (POST /complete, POST /cancel) that apply required side-effects
  // (completedAt, checklist/signatures, Unit.lastInspectionAt bump for
  // completion). The generic update path must not be able to set either
  // directly, or an inspection could end up "completed" with none of that.
  if (data.status === 'completed' || data.status === 'cancelled') {
    throw new AppError(
      400,
      'INVALID_STATUS_TRANSITION',
      `Use the ${data.status === 'completed' ? 'completion' : 'cancellation'} endpoint to mark an inspection ${data.status}.`
    );
  }

  return prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      ...(data.type !== undefined && { type: data.type as InspectionType }),
      ...(data.leaseId !== undefined && { leaseId: data.leaseId }),
      ...(data.scheduledAt !== undefined && {
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      }),
      ...(data.inspectorUserId !== undefined && { inspectorUserId: data.inspectorUserId }),
      ...(data.templateId !== undefined && { templateId: data.templateId }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.status !== undefined && { status: data.status as InspectionStatus }),
    },
    include: inspectionInclude,
  });
}

export async function cancelInspection(
  organizationId: string,
  propertyId: string,
  unitId: string,
  inspectionId: string
) {
  await verifyUnit(organizationId, propertyId, unitId);
  const existing = await getExistingInspection(unitId, inspectionId);
  if (existing.status === 'completed') {
    throw new AppError(400, 'INSPECTION_FINALIZED', 'A completed inspection cannot be cancelled.');
  }
  return prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: 'cancelled' },
    include: inspectionInclude,
  });
}

export async function deleteInspection(
  organizationId: string,
  propertyId: string,
  unitId: string,
  inspectionId: string
) {
  await verifyUnit(organizationId, propertyId, unitId);
  await getExistingInspection(unitId, inspectionId);
  // InspectionMedia rows cascade (onDelete: Cascade); SecurityDepositDisposition
  // FKs are onDelete: SetNull so a deleted inspection just unlinks there.
  await prisma.inspection.delete({ where: { id: inspectionId } });
}

// A maintenance-role actor may only act on an inspection they were assigned
// to (owner/manager may act on any inspection in their org). Used for both
// completion and media writes, so a maintenance user can't forge/attach
// evidence on an inspection assigned to a different inspector.
function requireInspectorAssignment(
  existing: { inspectorUserId: string | null },
  actor: { userId?: string; role?: string } | null
) {
  if (actor?.role === 'maintenance' && existing.inspectorUserId !== actor.userId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not the assigned inspector for this inspection.');
  }
}

// ─── Complete (checklist results + signatures) ─────────────────────────────
// Captures both tenant and manager signatures in one request — a
// manager/inspector-device walkthrough, not a separate tenant-facing public
// signing link (see modules.md for why). On success, advances
// Unit.lastInspectionAt forward-only via a single conditional UPDATE (no
// separate read-then-write race, unlike appliance.service's counter — this
// is a plain WHERE-guarded SET evaluated atomically by Postgres per statement).

interface CompleteInspectionInput {
  checklistResults: { section: string; item: string; condition?: string | null; notes?: string | null }[];
  notes?: string | null;
  completedAt?: string | null;
  tenantSignatureName?: string | null;
  managerSignatureName?: string | null;
}

export async function completeInspection(
  organizationId: string,
  propertyId: string,
  unitId: string,
  inspectionId: string,
  data: CompleteInspectionInput,
  actorIp: string,
  actor: { userId?: string; role?: string } | null
) {
  await verifyUnit(organizationId, propertyId, unitId);
  const existing = await getExistingInspection(unitId, inspectionId);

  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw new AppError(400, 'INSPECTION_FINALIZED', 'This inspection has already been finalized.');
  }

  requireInspectorAssignment(existing, actor);

  const completedAt = data.completedAt ? new Date(data.completedAt) : new Date();
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    // Conditional update guards against a concurrent completion request: the
    // pre-transaction status check above can race with another request's
    // transaction, so the WHERE here (status not already finalized) is the
    // real guard, evaluated atomically by Postgres. If another request won
    // the race, count is 0 and we must not overwrite its checklist/signatures.
    const { count } = await tx.inspection.updateMany({
      where: { id: inspectionId, status: { notIn: ['completed', 'cancelled'] } },
      data: {
        status: 'completed',
        completedAt,
        checklistResults: data.checklistResults,
        notes: data.notes !== undefined ? data.notes : existing.notes,
        ...(data.tenantSignatureName
          ? { tenantSignatureName: data.tenantSignatureName, tenantSignatureAt: now, tenantSignatureIp: actorIp }
          : {}),
        ...(data.managerSignatureName
          ? { managerSignatureName: data.managerSignatureName, managerSignatureAt: now, managerSignatureIp: actorIp }
          : {}),
      },
    });

    if (count === 0) {
      throw new AppError(400, 'INSPECTION_FINALIZED', 'This inspection has already been finalized.');
    }

    // Forward-only: only advances lastInspectionAt if it's null or older than
    // this inspection's completedAt, so an older inspection completing after a
    // newer one doesn't regress it.
    await tx.unit.updateMany({
      where: {
        id: unitId,
        OR: [{ lastInspectionAt: null }, { lastInspectionAt: { lt: completedAt } }],
      },
      data: { lastInspectionAt: completedAt },
    });

    return tx.inspection.findFirst({ where: { id: inspectionId }, include: inspectionInclude });
  });

  return updated;
}

// ─── Media ──────────────────────────────────────────────────────────────────

export async function requestMediaUploadUrl(
  organizationId: string,
  propertyId: string,
  unitId: string,
  inspectionId: string,
  fileName: string,
  contentType: string,
  actor: { userId?: string; role?: string } | null
) {
  await verifyUnit(organizationId, propertyId, unitId);
  const existing = await getExistingInspection(unitId, inspectionId);
  requireInspectorAssignment(existing, actor);

  const storageKey = buildStorageKey(organizationId, 'inspection', inspectionId, fileName);
  const { uploadUrl } = await generateUploadPresignedUrl(storageKey, contentType);
  return { uploadUrl, storageKey, expiresInSeconds: 900 };
}

interface AttachMediaInput {
  storageKey: string;
  mediaType: string;
  capturedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export async function attachMedia(
  organizationId: string,
  propertyId: string,
  unitId: string,
  inspectionId: string,
  data: AttachMediaInput,
  actor: { userId?: string; role?: string } | null
) {
  await verifyUnit(organizationId, propertyId, unitId);
  const existing = await getExistingInspection(unitId, inspectionId);
  requireInspectorAssignment(existing, actor);

  return prisma.inspectionMedia.create({
    data: {
      inspectionId,
      storageKey: data.storageKey,
      mediaType: data.mediaType as InspectionMediaType,
      capturedAt: data.capturedAt ? new Date(data.capturedAt) : new Date(),
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    },
  });
}

export async function listMedia(
  organizationId: string,
  propertyId: string,
  unitId: string,
  inspectionId: string
) {
  await verifyUnit(organizationId, propertyId, unitId);
  await getExistingInspection(unitId, inspectionId);
  return prisma.inspectionMedia.findMany({
    where: { inspectionId },
    orderBy: { capturedAt: 'asc' },
  });
}

// ─── Move-in vs. move-out comparison ────────────────────────────────────────
// Basis for deposit disposition (Module 4 linkage) — diffs the two
// inspections' checklist results item-by-item where sections/items match by
// name, and separately lists any items unique to one side.

interface ChecklistResult {
  section: string;
  item: string;
  condition?: string | null;
  notes?: string | null;
}

function keyOf(r: ChecklistResult) {
  return `${r.section}::${r.item}`;
}

export async function compareLeaseInspections(organizationId: string, leaseId: string) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
    select: { id: true },
  });
  if (!lease) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }

  const [moveIn, moveOut] = await Promise.all([
    prisma.inspection.findFirst({
      where: { leaseId, type: 'move_in', status: 'completed' },
      include: inspectionInclude,
      orderBy: { completedAt: 'desc' },
    }),
    prisma.inspection.findFirst({
      where: { leaseId, type: 'move_out', status: 'completed' },
      include: inspectionInclude,
      orderBy: { completedAt: 'desc' },
    }),
  ]);

  const moveInResults = ((moveIn?.checklistResults as ChecklistResult[] | null) ?? []);
  const moveOutResults = ((moveOut?.checklistResults as ChecklistResult[] | null) ?? []);

  const moveInByKey = new Map(moveInResults.map((r) => [keyOf(r), r]));
  const moveOutByKey = new Map(moveOutResults.map((r) => [keyOf(r), r]));

  const allKeys = new Set([...moveInByKey.keys(), ...moveOutByKey.keys()]);

  const items = Array.from(allKeys).map((key) => {
    const moveInItem = moveInByKey.get(key) ?? null;
    const moveOutItem = moveOutByKey.get(key) ?? null;
    const conditionChanged = Boolean(
      moveInItem && moveOutItem && (moveInItem.condition ?? null) !== (moveOutItem.condition ?? null)
    );
    return {
      section: (moveInItem ?? moveOutItem)!.section,
      item: (moveInItem ?? moveOutItem)!.item,
      moveIn: moveInItem,
      moveOut: moveOutItem,
      conditionChanged,
    };
  });

  return {
    moveInInspection: moveIn,
    moveOutInspection: moveOut,
    items,
  };
}
