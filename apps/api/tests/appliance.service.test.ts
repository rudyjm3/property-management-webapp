import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    unit: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    appliance: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  ApplianceCategory: {},
}));

import { prisma } from '@propflow/db';
import {
  listAppliances,
  getAppliance,
  createAppliance,
  updateAppliance,
  deleteAppliance,
  retireAppliance,
  replaceAppliance,
} from '../src/services/appliance.service';

function yearsAgo(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
}

function mockTx(applianceCountAfter = 1) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    appliance: {
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'appliance-1', ...data })),
      update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(applianceCountAfter),
    },
    unit: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
  (prisma.$transaction as any).mockImplementation((cb: any) => cb(tx));
  return tx;
}

describe('appliance.service unit scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when the unit does not belong to the org/property', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue(null);

    await expect(listAppliances('org-1', 'prop-1', 'unit-1')).rejects.toMatchObject({
      code: 'UNIT_NOT_FOUND',
    });
    expect(prisma.appliance.findMany).not.toHaveBeenCalled();
  });
});

describe('appliance.service listAppliances / getAppliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
  });

  it('rolls up totalMaintenanceCost from linked work orders and reports a count', async () => {
    (prisma.appliance.findMany as any).mockResolvedValue([
      {
        id: 'appliance-1',
        category: 'hvac',
        installDate: null,
        purchaseDate: null,
        workOrders: [{ totalCost: 150 }, { totalCost: 75.5 }, { totalCost: null }],
      },
    ]);

    const result = await listAppliances('org-1', 'prop-1', 'unit-1');

    expect(result).toHaveLength(1);
    expect(result[0].totalMaintenanceCost).toBe(225.5);
    expect(result[0].workOrderCount).toBe(3);
    expect((result[0] as any).workOrders).toBeUndefined();
  });

  it('throws APPLIANCE_NOT_FOUND when the appliance is not on this unit', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue(null);

    await expect(getAppliance('org-1', 'prop-1', 'unit-1', 'appliance-x')).rejects.toMatchObject({
      code: 'APPLIANCE_NOT_FOUND',
    });
  });

  it('returns maintenanceHistory ordered by the work order include and the cost rollup', async () => {
    const workOrders = [
      { id: 'wo-2', totalCost: 100, category: 'hvac', status: 'completed', priority: 'routine', description: 'x', createdAt: new Date(), completedAt: new Date() },
      { id: 'wo-1', totalCost: 50, category: 'hvac', status: 'new_order', priority: 'routine', description: 'y', createdAt: new Date(), completedAt: null },
    ];
    (prisma.appliance.findFirst as any).mockResolvedValue({
      id: 'appliance-1',
      category: 'hvac',
      installDate: null,
      purchaseDate: null,
      workOrders,
    });

    const result = await getAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1');

    expect(result.totalMaintenanceCost).toBe(150);
    expect(result.maintenanceHistory).toBe(workOrders);
  });
});

describe('appliance.service replacement alert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
  });

  it('is null for a recently installed appliance', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({
      id: 'appliance-1',
      category: 'hvac',
      installDate: yearsAgo(1),
      purchaseDate: null,
      workOrders: [],
    });

    const result = await getAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1');

    expect(result.replacementAlert).toBeNull();
  });

  it('flags "approaching" within the window before expected end-of-life (HVAC: 15yr, 2yr window)', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({
      id: 'appliance-1',
      category: 'hvac',
      installDate: yearsAgo(14),
      purchaseDate: null,
      workOrders: [],
    });

    const result = await getAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1');

    expect(result.replacementAlert).toMatchObject({ status: 'approaching', expectedLifespanYears: 15 });
  });

  it('flags "overdue" once past the expected end-of-life', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({
      id: 'appliance-1',
      category: 'hvac',
      installDate: yearsAgo(16),
      purchaseDate: null,
      workOrders: [],
    });

    const result = await getAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1');

    expect(result.replacementAlert).toMatchObject({ status: 'overdue', expectedLifespanYears: 15 });
  });

  it('falls back to purchaseDate when there is no installDate', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({
      id: 'appliance-1',
      category: 'water_heater',
      installDate: null,
      purchaseDate: yearsAgo(11),
      workOrders: [],
    });

    const result = await getAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1');

    expect(result.replacementAlert).toMatchObject({ status: 'overdue', expectedLifespanYears: 10 });
  });
});

describe('appliance.service createAppliance / deleteAppliance keep applianceCount in sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
  });

  it('recomputes Unit.applianceCount from a fresh count when an appliance is created', async () => {
    // Deliberately returning a count tx.appliance.count() would produce
    // regardless of any prior (possibly null) value on the row — this is
    // the regression check for the NULL-propagation bug in a naive
    // { increment: 1 } on a nullable column.
    const tx = mockTx(3);

    const result = await createAppliance('org-1', 'prop-1', 'unit-1', {
      category: 'refrigerator',
      make: 'Samsung',
    });

    expect(tx.appliance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unitId: 'unit-1', category: 'refrigerator', make: 'Samsung' }) })
    );
    expect(tx.appliance.count).toHaveBeenCalledWith({ where: { unitId: 'unit-1', status: 'active' } });
    expect(tx.unit.update).toHaveBeenCalledWith({
      where: { id: 'unit-1' },
      data: { applianceCount: 3 },
    });
    expect(result.id).toBe('appliance-1');

    // Serializes concurrent count-then-write races on the same unit (two
    // overlapping creates could otherwise each count before the other
    // commits and write back the same stale total) — acquired before the
    // count, inside the same transaction as the create.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const lockCallOrder = (tx.$executeRaw as any).mock.invocationCallOrder[0];
    const countCallOrder = (tx.appliance.count as any).mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(countCallOrder);
  });

  it('recomputes Unit.applianceCount from a fresh count when an appliance is deleted', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'appliance-1' });
    const tx = mockTx(0);

    await deleteAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1');

    expect(tx.appliance.delete).toHaveBeenCalledWith({ where: { id: 'appliance-1' } });
    expect(tx.appliance.count).toHaveBeenCalledWith({ where: { unitId: 'unit-1', status: 'active' } });
    expect(tx.unit.update).toHaveBeenCalledWith({
      where: { id: 'unit-1' },
      data: { applianceCount: 0 },
    });
  });

  it('rejects deleting an appliance that does not belong to this unit', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue(null);

    await expect(deleteAppliance('org-1', 'prop-1', 'unit-1', 'appliance-x')).rejects.toMatchObject({
      code: 'APPLIANCE_NOT_FOUND',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('appliance.service updateAppliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
  });

  it('rejects updating an appliance that does not belong to this unit', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue(null);

    await expect(updateAppliance('org-1', 'prop-1', 'unit-1', 'appliance-x', { make: 'LG' })).rejects.toMatchObject({
      code: 'APPLIANCE_NOT_FOUND',
    });
    expect(prisma.appliance.update).not.toHaveBeenCalled();
  });

  it('only writes fields explicitly provided, leaving others untouched', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'appliance-1', category: 'hvac' });
    (prisma.appliance.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'appliance-1', category: 'hvac', installDate: null, purchaseDate: null, ...data })
    );

    await updateAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1', { make: 'LG' });

    expect(prisma.appliance.update).toHaveBeenCalledWith({
      where: { id: 'appliance-1' },
      data: { make: 'LG' },
    });
  });

  it('clears a date field back to null when explicitly passed null', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'appliance-1', category: 'hvac' });
    (prisma.appliance.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'appliance-1', category: 'hvac', installDate: null, purchaseDate: null, ...data })
    );

    await updateAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1', { warrantyExpiresAt: null });

    expect(prisma.appliance.update).toHaveBeenCalledWith({
      where: { id: 'appliance-1' },
      data: { warrantyExpiresAt: null },
    });
  });
});

describe('appliance.service retireAppliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
  });

  it('rejects retiring an appliance that does not belong to this unit', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue(null);

    await expect(retireAppliance('org-1', 'prop-1', 'unit-1', 'appliance-x')).rejects.toMatchObject({
      code: 'APPLIANCE_NOT_FOUND',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects retiring an appliance that is already removed', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'appliance-1', status: 'removed' });

    await expect(retireAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1')).rejects.toMatchObject({
      code: 'APPLIANCE_ALREADY_REMOVED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks the appliance removed with the given date and recomputes the active count', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'appliance-1', status: 'active' });
    const tx = mockTx(0);

    const result = await retireAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1', '2026-06-01');

    expect(tx.appliance.update).toHaveBeenCalledWith({
      where: { id: 'appliance-1' },
      data: { status: 'removed', removedAt: new Date('2026-06-01') },
    });
    expect(tx.appliance.count).toHaveBeenCalledWith({ where: { unitId: 'unit-1', status: 'active' } });
    expect(tx.unit.update).toHaveBeenCalledWith({ where: { id: 'unit-1' }, data: { applianceCount: 0 } });
    expect(result.status).toBe('removed');
  });

  it('defaults removedAt to today when none is given', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'appliance-1', status: 'active' });
    const tx = mockTx(0);

    await retireAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1');

    const call = (tx.appliance.update as any).mock.calls[0][0];
    expect(call.data.removedAt).toBeInstanceOf(Date);
  });
});

describe('appliance.service replaceAppliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
  });

  it('rejects replacing an appliance that does not belong to this unit', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue(null);

    await expect(
      replaceAppliance('org-1', 'prop-1', 'unit-1', 'appliance-x', { category: 'dishwasher' })
    ).rejects.toMatchObject({ code: 'APPLIANCE_NOT_FOUND' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects replacing an appliance that has already been retired or replaced', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'appliance-1', status: 'removed' });

    await expect(
      replaceAppliance('org-1', 'prop-1', 'unit-1', 'appliance-1', { category: 'dishwasher' })
    ).rejects.toMatchObject({ code: 'APPLIANCE_ALREADY_REMOVED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retires the old appliance and creates a new one linked via replacesApplianceId', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'old-dishwasher', status: 'active' });
    const tx = mockTx(1);

    const result = await replaceAppliance('org-1', 'prop-1', 'unit-1', 'old-dishwasher', {
      removedAt: '2026-06-01',
      category: 'dishwasher',
      make: 'Bosch',
      model: 'SHEM63W55N',
    });

    expect(tx.appliance.update).toHaveBeenCalledWith({
      where: { id: 'old-dishwasher' },
      data: { status: 'removed', removedAt: new Date('2026-06-01') },
    });
    expect(tx.appliance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        unitId: 'unit-1',
        category: 'dishwasher',
        make: 'Bosch',
        model: 'SHEM63W55N',
        replacesApplianceId: 'old-dishwasher',
      }),
    });
    expect(tx.appliance.count).toHaveBeenCalledWith({ where: { unitId: 'unit-1', status: 'active' } });
    expect(result.id).toBe('appliance-1');
  });
});
