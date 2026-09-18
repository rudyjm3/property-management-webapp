import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    unit: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    lease: {
      findFirst: vi.fn(),
    },
    inspection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    inspectionMedia: {
      create: vi.fn(),
      findMany: vi.fn(),
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
  completeInspection,
  compareLeaseInspections,
  requestMediaUploadUrl,
} from '../src/services/inspection.service';

function mockTx() {
  const tx = {
    inspection: {
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'insp-1', ...data })),
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

    expect(tx.inspection.update).toHaveBeenCalledWith(
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

    const result = await requestMediaUploadUrl('org-1', 'prop-1', 'unit-1', 'insp-1', 'photo.jpg', 'image/jpeg');

    expect(result.storageKey).toContain('inspection');
    expect(result.uploadUrl).toBeTruthy();
  });
});
