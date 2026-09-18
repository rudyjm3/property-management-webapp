import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    unit: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    property: {
      findFirst: vi.fn(),
    },
    lease: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    inspectionTemplate: {
      findFirst: vi.fn(),
    },
    inspection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    inspectionMedia: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  InspectionType: {},
  InspectionStatus: {},
  InspectionMediaType: {},
}));

vi.mock('../src/services/storage.service', () => ({
  buildStorageKey: vi.fn().mockReturnValue('org/org-1/inspection/insp-1/uuid-file.jpg'),
  generateUploadPresignedUrl: vi.fn().mockResolvedValue({ uploadUrl: 'https://storage.example.com/put', storageKey: 'org/org-1/inspection/insp-1/uuid-file.jpg' }),
}));

import { prisma } from '@propflow/db';
import {
  listInspections,
  getInspection,
  createInspection,
  updateInspection,
  completeInspection,
  compareLeaseInspections,
  requestMediaUploadUrl,
  attachMedia,
  createPropertyInspection,
  completePropertyInspection,
} from '../src/services/inspection.service';

function mockTx(opts: { completeCount?: number } = {}) {
  const tx = {
    inspection: {
      updateMany: vi.fn().mockResolvedValue({ count: opts.completeCount ?? 1 }),
      findFirst: vi.fn().mockImplementation(() => Promise.resolve({ id: 'insp-1', status: 'completed' })),
    },
    unit: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  (prisma.$transaction as any).mockImplementation((cb: any) => cb(tx));
  return tx;
}

describe('inspection.service unit scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when the unit does not belong to the org/property', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue(null);

    await expect(listInspections('org-1', 'prop-1', 'unit-1')).rejects.toMatchObject({
      code: 'UNIT_NOT_FOUND',
    });
  });

  it('rejects getInspection for an inspection that does not belong to the unit', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(null);

    await expect(getInspection('org-1', 'prop-1', 'unit-1', 'insp-1')).rejects.toMatchObject({
      code: 'INSPECTION_NOT_FOUND',
    });
  });
});

describe('inspection.service createInspection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates the lease belongs to the unit when leaseId is provided', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.lease.findFirst as any).mockResolvedValue(null);

    await expect(
      createInspection('org-1', 'prop-1', 'unit-1', { type: 'move_in', leaseId: 'lease-1' })
    ).rejects.toMatchObject({ code: 'LEASE_NOT_FOUND' });
  });

  it('creates a scheduled inspection with an empty checklist', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.create as any).mockImplementation(({ data }: any) => Promise.resolve({ id: 'insp-1', ...data }));

    const result = await createInspection('org-1', 'prop-1', 'unit-1', { type: 'annual' });

    expect(prisma.inspection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'scheduled', checklistResults: [] }),
      })
    );
    expect(result.status).toBe('scheduled');
  });
});

describe('inspection.service completeInspection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const existingInspection = {
    id: 'insp-1',
    unitId: 'unit-1',
    status: 'in_progress',
    notes: null,
    inspectorUserId: 'user-2',
  };

  it('rejects completing an already-finalized inspection', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue({ ...existingInspection, status: 'completed' });

    await expect(
      completeInspection('org-1', 'prop-1', 'unit-1', 'insp-1', { checklistResults: [] }, '127.0.0.1', {
        userId: 'user-1',
        role: 'manager',
      })
    ).rejects.toMatchObject({ code: 'INSPECTION_FINALIZED' });
  });

  it('rejects a maintenance-role actor completing an inspection they are not assigned to', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);

    await expect(
      completeInspection('org-1', 'prop-1', 'unit-1', 'insp-1', { checklistResults: [] }, '127.0.0.1', {
        userId: 'user-1',
        role: 'maintenance',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows the assigned maintenance inspector to complete their own inspection', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);
    mockTx();

    const result = await completeInspection(
      'org-1',
      'prop-1',
      'unit-1',
      'insp-1',
      { checklistResults: [{ section: 'Kitchen', item: 'Sink', condition: 'good' }] },
      '127.0.0.1',
      { userId: 'user-2', role: 'maintenance' }
    );

    expect(result.status).toBe('completed');
  });

  it('advances Unit.lastInspectionAt forward-only via a conditional updateMany', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);
    const tx = mockTx();

    await completeInspection(
      'org-1',
      'prop-1',
      'unit-1',
      'insp-1',
      { checklistResults: [], completedAt: '2026-06-01T00:00:00.000Z' },
      '127.0.0.1',
      { userId: 'user-1', role: 'manager' }
    );

    expect(tx.unit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'unit-1',
          OR: [{ lastInspectionAt: null }, { lastInspectionAt: { lt: new Date('2026-06-01T00:00:00.000Z') } }],
        }),
        data: { lastInspectionAt: new Date('2026-06-01T00:00:00.000Z') },
      })
    );
  });

  it('records typed-name signatures with IP + timestamp when provided', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);
    const tx = mockTx();

    await completeInspection(
      'org-1',
      'prop-1',
      'unit-1',
      'insp-1',
      { checklistResults: [], tenantSignatureName: 'Jane Tenant', managerSignatureName: 'Manager Bob' },
      '10.0.0.5',
      { userId: 'user-1', role: 'manager' }
    );

    expect(tx.inspection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantSignatureName: 'Jane Tenant',
          tenantSignatureIp: '10.0.0.5',
          managerSignatureName: 'Manager Bob',
          managerSignatureIp: '10.0.0.5',
        }),
      })
    );
  });

  it('rejects when a concurrent request already finalized the inspection inside the transaction', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);
    mockTx({ completeCount: 0 });

    await expect(
      completeInspection('org-1', 'prop-1', 'unit-1', 'insp-1', { checklistResults: [] }, '127.0.0.1', {
        userId: 'user-1',
        role: 'manager',
      })
    ).rejects.toMatchObject({ code: 'INSPECTION_FINALIZED' });
  });
});

describe('inspection.service updateInspection status guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const existingInspection = {
    id: 'insp-1',
    unitId: 'unit-1',
    status: 'in_progress',
    notes: null,
    inspectorUserId: null,
  };

  it('rejects a direct PATCH to status: completed (must use the /complete endpoint)', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);

    await expect(
      updateInspection('org-1', 'prop-1', 'unit-1', 'insp-1', { status: 'completed' })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    expect(prisma.inspection.update).not.toHaveBeenCalled();
  });

  it('rejects a direct PATCH to status: cancelled (must use the /cancel endpoint)', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);

    await expect(
      updateInspection('org-1', 'prop-1', 'unit-1', 'insp-1', { status: 'cancelled' })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    expect(prisma.inspection.update).not.toHaveBeenCalled();
  });
});

describe('inspection.service cross-org inspector/template validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects creating an inspection with an inspectorUserId from another org', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.user.findFirst as any).mockResolvedValue(null);

    await expect(
      createInspection('org-1', 'prop-1', 'unit-1', { type: 'annual', inspectorUserId: 'user-from-org-b' })
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'user-from-org-b', organizationId: 'org-1' }) })
    );
  });

  it('rejects creating an inspection with a templateId from another org', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspectionTemplate.findFirst as any).mockResolvedValue(null);

    await expect(
      createInspection('org-1', 'prop-1', 'unit-1', { type: 'annual', templateId: 'template-from-org-b' })
    ).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });

  it('rejects reassigning an inspection to an inspectorUserId from another org via update', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue({
      id: 'insp-1',
      unitId: 'unit-1',
      status: 'scheduled',
    });
    (prisma.user.findFirst as any).mockResolvedValue(null);

    await expect(
      updateInspection('org-1', 'prop-1', 'unit-1', 'insp-1', { inspectorUserId: 'user-from-org-b' })
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});

describe('inspection.service media inspector-assignment enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const existingInspection = {
    id: 'insp-1',
    unitId: 'unit-1',
    status: 'in_progress',
    inspectorUserId: 'user-2',
  };

  it('rejects requestMediaUploadUrl from a maintenance user who is not the assigned inspector', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);

    await expect(
      requestMediaUploadUrl('org-1', 'prop-1', 'unit-1', 'insp-1', 'photo.jpg', 'image/jpeg', {
        userId: 'user-1',
        role: 'maintenance',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects attachMedia from a maintenance user who is not the assigned inspector', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);

    await expect(
      attachMedia(
        'org-1',
        'prop-1',
        'unit-1',
        'insp-1',
        { storageKey: 'org/org-1/inspection/insp-1/uuid-file.jpg', mediaType: 'photo' },
        { userId: 'user-1', role: 'maintenance' }
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prisma.inspectionMedia.create).not.toHaveBeenCalled();
  });

  it('allows the assigned maintenance inspector to attach media', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingInspection);
    (prisma.inspectionMedia.create as any).mockResolvedValue({ id: 'media-1' });

    const result = await attachMedia(
      'org-1',
      'prop-1',
      'unit-1',
      'insp-1',
      { storageKey: 'org/org-1/inspection/insp-1/uuid-file.jpg', mediaType: 'photo' },
      { userId: 'user-2', role: 'maintenance' }
    );

    expect(result.id).toBe('media-1');
  });
});

describe('inspection.service compareLeaseInspections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unknown lease', async () => {
    (prisma.lease.findFirst as any).mockResolvedValue(null);

    await expect(compareLeaseInspections('org-1', 'lease-1')).rejects.toMatchObject({
      code: 'LEASE_NOT_FOUND',
    });
  });

  it('diffs move-in vs move-out checklist results by section+item', async () => {
    (prisma.lease.findFirst as any).mockResolvedValue({ id: 'lease-1' });
    (prisma.inspection.findFirst as any)
      .mockResolvedValueOnce({
        id: 'insp-move-in',
        type: 'move_in',
        checklistResults: [
          { section: 'Kitchen', item: 'Sink', condition: 'good' },
          { section: 'Bedrooms', item: 'Walls', condition: 'good' },
        ],
      })
      .mockResolvedValueOnce({
        id: 'insp-move-out',
        type: 'move_out',
        checklistResults: [
          { section: 'Kitchen', item: 'Sink', condition: 'damaged' },
          { section: 'Living Areas', item: 'Flooring', condition: 'fair' },
        ],
      });

    const result = await compareLeaseInspections('org-1', 'lease-1');

    const sinkItem = result.items.find((i) => i.item === 'Sink');
    expect(sinkItem?.conditionChanged).toBe(true);

    const wallsItem = result.items.find((i) => i.item === 'Walls');
    expect(wallsItem?.moveOut).toBeNull();

    const flooringItem = result.items.find((i) => i.item === 'Flooring');
    expect(flooringItem?.moveIn).toBeNull();

    expect(result.items).toHaveLength(3);
  });
});

describe('inspection.service media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the upload URL storage key to the inspection', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue({ id: 'insp-1', unitId: 'unit-1' });

    const result = await requestMediaUploadUrl('org-1', 'prop-1', 'unit-1', 'insp-1', 'photo.jpg', 'image/jpeg', {
      userId: 'user-1',
      role: 'manager',
    });

    expect(result.storageKey).toContain('inspection');
    expect(result.uploadUrl).toBeTruthy();
  });
});

describe('inspection.service property-scoped (grounds) inspections — Module 3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a grounds inspection scoped to the property, not a unit', async () => {
    (prisma.property.findFirst as any).mockResolvedValue({ id: 'prop-1' });
    (prisma.inspection.create as any).mockImplementation(({ data }: any) => Promise.resolve({ id: 'insp-1', ...data }));

    const result = await createPropertyInspection('org-1', 'prop-1', {});

    expect(prisma.inspection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ propertyId: 'prop-1', type: 'grounds', status: 'scheduled' }),
      })
    );
    expect(result.type).toBe('grounds');
  });

  const existingGroundsInspection = {
    id: 'insp-1',
    propertyId: 'prop-1',
    status: 'in_progress',
    notes: null,
    inspectorUserId: null,
  };

  it('rejects completion when no photo has been attached', async () => {
    (prisma.property.findFirst as any).mockResolvedValue({ id: 'prop-1' });
    (prisma.inspection.findFirst as any).mockResolvedValue(existingGroundsInspection);
    (prisma.inspectionMedia.findFirst as any).mockResolvedValue(null);

    await expect(
      completePropertyInspection('org-1', 'prop-1', 'insp-1', {}, { userId: 'user-1', role: 'manager' })
    ).rejects.toMatchObject({ code: 'PHOTO_REQUIRED' });

    expect(prisma.inspection.updateMany).not.toHaveBeenCalled();
  });

  it('allows completion once at least one photo is attached', async () => {
    (prisma.property.findFirst as any).mockResolvedValue({ id: 'prop-1' });
    (prisma.inspection.findFirst as any)
      .mockResolvedValueOnce(existingGroundsInspection) // getExistingPropertyInspection
      .mockResolvedValueOnce({ ...existingGroundsInspection, status: 'completed' }); // final re-fetch
    (prisma.inspectionMedia.findFirst as any).mockResolvedValue({ id: 'media-1' });
    (prisma.inspection.updateMany as any).mockResolvedValue({ count: 1 });

    const result = await completePropertyInspection(
      'org-1',
      'prop-1',
      'insp-1',
      { notes: 'Grounds look good' },
      { userId: 'user-1', role: 'manager' }
    );

    expect(prisma.inspection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) })
    );
    expect(result?.status).toBe('completed');
  });
});
