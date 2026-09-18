import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    property: { findFirst: vi.fn() },
    vendor: { findFirst: vi.fn() },
    maintenanceSchedule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workOrder: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  MaintenanceCadence: {},
  WorkOrderCategory: {},
  WorkOrderLocationType: {},
}));

import { prisma } from '@propflow/db';
import {
  createMaintenanceSchedule,
  advanceDueDate,
  generateWorkOrderForSchedule,
} from '../src/services/maintenance-schedule.service';

describe('advanceDueDate', () => {
  it('advances weekly by 7 days', () => {
    const result = advanceDueDate(new Date('2026-01-01T00:00:00.000Z'), 'weekly' as any);
    expect(result.toISOString().slice(0, 10)).toBe('2026-01-08');
  });

  it('advances monthly by 1 month', () => {
    const result = advanceDueDate(new Date('2026-01-15T00:00:00.000Z'), 'monthly' as any);
    expect(result.toISOString().slice(0, 10)).toBe('2026-02-15');
  });

  it('advances quarterly by 3 months', () => {
    const result = advanceDueDate(new Date('2026-01-01T00:00:00.000Z'), 'quarterly' as any);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-01');
  });

  it('advances semi_annual by 6 months', () => {
    const result = advanceDueDate(new Date('2026-01-01T00:00:00.000Z'), 'semi_annual' as any);
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-01');
  });

  it('advances annual by 1 year', () => {
    const result = advanceDueDate(new Date('2026-01-01T00:00:00.000Z'), 'annual' as any);
    expect(result.toISOString().slice(0, 10)).toBe('2027-01-01');
  });
});

describe('createMaintenanceSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when the property does not belong to the org', async () => {
    (prisma.property.findFirst as any).mockResolvedValue(null);

    await expect(
      createMaintenanceSchedule('org-1', 'prop-1', {
        title: 'Landscaping',
        cadence: 'monthly',
        nextDueDate: '2026-02-01',
      })
    ).rejects.toThrow('Property not found');
  });

  it('throws when the supplied vendorId does not belong to the org', async () => {
    (prisma.property.findFirst as any).mockResolvedValue({ id: 'prop-1' });
    (prisma.vendor.findFirst as any).mockResolvedValue(null);

    await expect(
      createMaintenanceSchedule('org-1', 'prop-1', {
        title: 'Landscaping',
        cadence: 'monthly',
        vendorId: 'vendor-1',
        nextDueDate: '2026-02-01',
      })
    ).rejects.toThrow('Vendor not found');
  });

  it('creates a schedule with a verified vendor', async () => {
    (prisma.property.findFirst as any).mockResolvedValue({ id: 'prop-1' });
    (prisma.vendor.findFirst as any).mockResolvedValue({ id: 'vendor-1' });
    (prisma.maintenanceSchedule.create as any).mockResolvedValue({ id: 'sched-1' });

    const result = await createMaintenanceSchedule('org-1', 'prop-1', {
      title: 'Landscaping',
      cadence: 'monthly',
      vendorId: 'vendor-1',
      nextDueDate: '2026-02-01',
    });

    expect(result).toEqual({ id: 'sched-1' });
    expect(prisma.maintenanceSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          propertyId: 'prop-1',
          vendorId: 'vendor-1',
          cadence: 'monthly',
        }),
      })
    );
  });
});

describe('generateWorkOrderForSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a WorkOrder linked to the schedule and auto-assigns its vendor, then advances nextDueDate', async () => {
    const txWorkOrderCreate = vi.fn().mockResolvedValue({ id: 'wo-1' });
    const txScheduleUpdate = vi.fn().mockResolvedValue({});
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        workOrder: { create: txWorkOrderCreate },
        maintenanceSchedule: { update: txScheduleUpdate },
      })
    );

    const schedule = {
      id: 'sched-1',
      propertyId: 'prop-1',
      vendorId: 'vendor-1',
      title: 'Monthly landscaping',
      category: 'grounds' as any,
      locationType: 'landscaping' as any,
      description: null,
      cadence: 'monthly' as any,
      nextDueDate: new Date('2026-02-01T00:00:00.000Z'),
    };

    const result = await generateWorkOrderForSchedule(schedule);

    expect(result).toEqual({ id: 'wo-1' });
    expect(txWorkOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: 'prop-1',
          scheduleId: 'sched-1',
          vendorId: 'vendor-1',
          status: 'assigned', // auto-assigned because the schedule has a vendor
          scheduledAt: schedule.nextDueDate,
        }),
      })
    );
    expect(txScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sched-1' },
        data: expect.objectContaining({
          nextDueDate: new Date('2026-03-01T00:00:00.000Z'),
        }),
      })
    );
  });

  it('leaves status new_order when the schedule has no vendor', async () => {
    const txWorkOrderCreate = vi.fn().mockResolvedValue({ id: 'wo-2' });
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        workOrder: { create: txWorkOrderCreate },
        maintenanceSchedule: { update: vi.fn().mockResolvedValue({}) },
      })
    );

    await generateWorkOrderForSchedule({
      id: 'sched-2',
      propertyId: 'prop-1',
      vendorId: null,
      title: 'Pest control',
      category: 'pest' as any,
      locationType: null,
      description: null,
      cadence: 'quarterly' as any,
      nextDueDate: new Date('2026-02-01T00:00:00.000Z'),
    });

    expect(txWorkOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'new_order', vendorId: null }) })
    );
  });
});
