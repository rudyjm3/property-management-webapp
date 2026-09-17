import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    unit: { findFirst: vi.fn() },
    leaseParticipant: { findFirst: vi.fn() },
    appliance: { findFirst: vi.fn() },
    property: { findFirst: vi.fn() },
    vendor: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    workOrder: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
  },
  WorkOrderStatus: { new_order: 'new_order' },
  WorkOrderPriority: {},
  WorkOrderCategory: {},
  WorkOrderLocationType: {},
}));

import { prisma } from '@propflow/db';
import { createWorkOrder, updateWorkOrder } from '../src/services/workOrder.service';

describe('workOrder.service appliance linking on create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1', propertyId: 'prop-1' });
    (prisma.workOrder.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'wo-1', ...data })
    );
  });

  it('rejects an applianceId that does not belong to the target unit', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue(null);

    await expect(
      createWorkOrder('org-1', {
        unitId: 'unit-1',
        applianceId: 'appliance-other-unit',
        category: 'hvac',
        description: 'Not cooling',
      })
    ).rejects.toMatchObject({ code: 'APPLIANCE_NOT_FOUND' });

    expect(prisma.appliance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'appliance-other-unit', unitId: 'unit-1' } })
    );
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
  });

  it('links the work order to the appliance once it is verified on this unit', async () => {
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'appliance-1' });

    const result = await createWorkOrder('org-1', {
      unitId: 'unit-1',
      applianceId: 'appliance-1',
      category: 'hvac',
      description: 'Not cooling',
    });

    expect(prisma.workOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ applianceId: 'appliance-1' }) })
    );
    expect(result.applianceId).toBe('appliance-1');
  });
});

describe('workOrder.service appliance linking on update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects linking an appliance to a property-level (unitless) work order', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({
      id: 'wo-1',
      unitId: null,
      status: 'new_order',
      tenantId: null,
    });

    await expect(
      updateWorkOrder('org-1', 'wo-1', { applianceId: 'appliance-1' })
    ).rejects.toMatchObject({ code: 'NO_UNIT_FOR_APPLIANCE' });

    expect(prisma.appliance.findFirst).not.toHaveBeenCalled();
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it('rejects an applianceId that is not on the work order\'s own unit', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({
      id: 'wo-1',
      unitId: 'unit-1',
      status: 'new_order',
      tenantId: null,
    });
    (prisma.appliance.findFirst as any).mockResolvedValue(null);

    await expect(
      updateWorkOrder('org-1', 'wo-1', { applianceId: 'appliance-elsewhere' })
    ).rejects.toMatchObject({ code: 'APPLIANCE_NOT_FOUND' });

    expect(prisma.appliance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'appliance-elsewhere', unitId: 'unit-1' } })
    );
  });

  it('allows unlinking an appliance by explicitly passing null', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({
      id: 'wo-1',
      unitId: 'unit-1',
      status: 'assigned',
      tenantId: null,
    });
    (prisma.workOrder.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'wo-1', ...data })
    );

    await updateWorkOrder('org-1', 'wo-1', { applianceId: null });

    expect(prisma.appliance.findFirst).not.toHaveBeenCalled();
    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ applianceId: null }) })
    );
  });
});
