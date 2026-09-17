import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    unit: { findFirst: vi.fn() },
    leaseParticipant: { findFirst: vi.fn() },
    appliance: { findFirst: vi.fn() },
    property: { findFirst: vi.fn() },
    vendor: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    workOrder: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
  WorkOrderStatus: { new_order: 'new_order' },
  WorkOrderPriority: {},
  WorkOrderCategory: {},
  WorkOrderLocationType: {},
}));

import { prisma } from '@propflow/db';
import { createWorkOrder, updateWorkOrder, listWorkOrders, getWorkOrder } from '../src/services/workOrder.service';

function mockModuleActive(active: boolean) {
  (prisma.organization.findUnique as any).mockResolvedValue({
    activeModules: active ? ['unit_intelligence'] : [],
  });
}

describe('workOrder.service appliance linking on create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1', propertyId: 'prop-1' });
    (prisma.workOrder.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'wo-1', ...data })
    );
    mockModuleActive(true);
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

  it('rejects linking an appliance when unit_intelligence is not active for the org', async () => {
    mockModuleActive(false);
    (prisma.appliance.findFirst as any).mockResolvedValue({ id: 'appliance-1' });

    await expect(
      createWorkOrder('org-1', {
        unitId: 'unit-1',
        applianceId: 'appliance-1',
        category: 'hvac',
        description: 'Not cooling',
      })
    ).rejects.toMatchObject({ code: 'MODULE_NOT_ACTIVE' });

    // Never even checks whether the appliance itself is valid — the module
    // gate is the first thing checked, so a deactivated org can't probe for
    // appliance IDs either.
    expect(prisma.appliance.findFirst).not.toHaveBeenCalled();
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
  });

  it('still creates an ordinary (non-appliance) work order when the module is inactive', async () => {
    mockModuleActive(false);

    const result = await createWorkOrder('org-1', {
      unitId: 'unit-1',
      category: 'plumbing',
      description: 'Leaky faucet',
    });

    expect(prisma.workOrder.create).toHaveBeenCalled();
    expect(result.id).toBe('wo-1');
  });
});

describe('workOrder.service appliance linking on update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModuleActive(true);
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

  it('rejects re-linking an existing work order to an appliance once the module is deactivated', async () => {
    mockModuleActive(false);
    (prisma.workOrder.findFirst as any).mockResolvedValue({
      id: 'wo-1',
      unitId: 'unit-1',
      status: 'assigned',
      tenantId: null,
    });

    await expect(
      updateWorkOrder('org-1', 'wo-1', { applianceId: 'appliance-1' })
    ).rejects.toMatchObject({ code: 'MODULE_NOT_ACTIVE' });

    expect(prisma.appliance.findFirst).not.toHaveBeenCalled();
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });
});

describe('workOrder.service hides the appliance relation once the module is deactivated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits the appliance include on listWorkOrders when unit_intelligence is inactive', async () => {
    mockModuleActive(false);
    (prisma.workOrder.findMany as any).mockResolvedValue([]);

    await listWorkOrders('org-1');

    const include = (prisma.workOrder.findMany as any).mock.calls[0][0].include;
    expect(include).not.toHaveProperty('appliance');
  });

  it('includes the appliance relation on listWorkOrders when unit_intelligence is active', async () => {
    mockModuleActive(true);
    (prisma.workOrder.findMany as any).mockResolvedValue([]);

    await listWorkOrders('org-1');

    const include = (prisma.workOrder.findMany as any).mock.calls[0][0].include;
    expect(include).toHaveProperty('appliance');
  });

  it('omits the appliance include on getWorkOrder when unit_intelligence is inactive, even for a work order with an existing link', async () => {
    mockModuleActive(false);
    (prisma.workOrder.findFirst as any).mockResolvedValue({ id: 'wo-1', applianceId: 'appliance-1' });

    await getWorkOrder('org-1', 'wo-1');

    const include = (prisma.workOrder.findFirst as any).mock.calls[0][0].include;
    expect(include).not.toHaveProperty('appliance');
  });
});
