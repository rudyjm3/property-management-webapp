import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    property: { findFirst: vi.fn() },
    vendor: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    preferredVendorAssignment: { findFirst: vi.fn() },
    maintenanceSchedule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workOrder: { create: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
  MaintenanceCadence: {},
  WorkOrderCategory: {},
  WorkOrderLocationType: {},
  VendorStatus: { active: 'active', inactive: 'inactive' },
}));

import { prisma } from '@propflow/db';
import {
  createMaintenanceSchedule,
  advanceDueDate,
  generateWorkOrderForSchedule,
  deleteMaintenanceSchedule,
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

  it('clamps a month-end monthly advance to the target month\'s last day', () => {
    const result = advanceDueDate(new Date('2026-01-31T00:00:00.000Z'), 'monthly' as any);
    expect(result.toISOString().slice(0, 10)).toBe('2026-02-28'); // 2026 is not a leap year
  });

  it('clamps a month-end quarterly advance across a shorter month', () => {
    const result = advanceDueDate(new Date('2026-11-30T00:00:00.000Z'), 'quarterly' as any);
    expect(result.toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('clamps a leap-day annual advance to Feb 28 in a non-leap year', () => {
    const result = advanceDueDate(new Date('2028-02-29T00:00:00.000Z'), 'annual' as any);
    expect(result.toISOString().slice(0, 10)).toBe('2029-02-28');
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
    // vendor_management inactive by default — most of these tests exercise
    // the schedule's own explicit vendorId, not the Module 5 preferred-vendor
    // fallback (covered separately below).
    (prisma.organization.findUnique as any).mockResolvedValue({ activeModules: [] });
    // The schedule's explicit vendor is active by default — the
    // inactive-explicit-vendor fallback case overrides this per-test.
    (prisma.vendor.findFirst as any).mockResolvedValue({ status: 'active' });
  });

  const schedule = {
    id: 'sched-1',
    organizationId: 'org-1',
    propertyId: 'prop-1',
    vendorId: 'vendor-1',
    title: 'Monthly landscaping',
    category: 'grounds' as any,
    locationType: 'landscaping' as any,
    description: null,
    cadence: 'monthly' as any,
    nextDueDate: new Date('2026-02-01T00:00:00.000Z'),
  };

  it('claims the occurrence, creates a WorkOrder linked to the schedule, auto-assigns its vendor, and advances nextDueDate', async () => {
    const txWorkOrderCreate = vi.fn().mockResolvedValue({ id: 'wo-1' });
    const txScheduleUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        workOrder: { create: txWorkOrderCreate },
        maintenanceSchedule: { updateMany: txScheduleUpdateMany },
      })
    );

    const result = await generateWorkOrderForSchedule(schedule);

    expect(result).toEqual({ id: 'wo-1' });
    // The occurrence must be claimed (conditional on the schedule's current
    // nextDueDate) before the work order is created.
    expect(txScheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sched-1', nextDueDate: schedule.nextDueDate },
        data: expect.objectContaining({ nextDueDate: new Date('2026-03-01T00:00:00.000Z') }),
      })
    );
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
  });

  it('leaves status new_order when the schedule has no vendor', async () => {
    const txWorkOrderCreate = vi.fn().mockResolvedValue({ id: 'wo-2' });
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        workOrder: { create: txWorkOrderCreate },
        maintenanceSchedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      })
    );

    await generateWorkOrderForSchedule({
      id: 'sched-2',
      organizationId: 'org-1',
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

  it('defaults to the org preferred vendor for the property+category when vendor_management is active and the schedule has no vendor of its own', async () => {
    (prisma.organization.findUnique as any).mockResolvedValue({ activeModules: ['vendor_management'] });
    (prisma.preferredVendorAssignment.findFirst as any).mockResolvedValueOnce({ vendorId: 'preferred-vendor-1' });

    const txWorkOrderCreate = vi.fn().mockResolvedValue({ id: 'wo-3' });
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        workOrder: { create: txWorkOrderCreate },
        maintenanceSchedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      })
    );

    await generateWorkOrderForSchedule({
      id: 'sched-3',
      organizationId: 'org-1',
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
      expect.objectContaining({
        data: expect.objectContaining({ status: 'assigned', vendorId: 'preferred-vendor-1' }),
      })
    );
  });

  it('leaves the schedule vendorless when vendor_management is active but no preferred vendor matches', async () => {
    (prisma.organization.findUnique as any).mockResolvedValue({ activeModules: ['vendor_management'] });
    (prisma.preferredVendorAssignment.findFirst as any).mockResolvedValue(null);

    const txWorkOrderCreate = vi.fn().mockResolvedValue({ id: 'wo-4' });
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        workOrder: { create: txWorkOrderCreate },
        maintenanceSchedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      })
    );

    await generateWorkOrderForSchedule({
      id: 'sched-4',
      organizationId: 'org-1',
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

  it('returns null and skips creating a WorkOrder when a concurrent run already claimed the occurrence', async () => {
    const txWorkOrderCreate = vi.fn();
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        workOrder: { create: txWorkOrderCreate },
        maintenanceSchedule: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      })
    );

    const result = await generateWorkOrderForSchedule(schedule);

    expect(result).toBeNull();
    expect(txWorkOrderCreate).not.toHaveBeenCalled();
  });

  it('falls through to the org preferred vendor when the schedule\'s explicit vendor has since gone inactive', async () => {
    (prisma.vendor.findFirst as any).mockResolvedValue({ status: 'inactive' });
    (prisma.organization.findUnique as any).mockResolvedValue({ activeModules: ['vendor_management'] });
    (prisma.preferredVendorAssignment.findFirst as any).mockResolvedValueOnce({ vendorId: 'preferred-vendor-1' });

    const txWorkOrderCreate = vi.fn().mockResolvedValue({ id: 'wo-5' });
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        workOrder: { create: txWorkOrderCreate },
        maintenanceSchedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      })
    );

    // schedule has its own explicit vendorId ('vendor-1'), but that vendor is
    // now inactive — the recurrence job must not keep assigning it.
    await generateWorkOrderForSchedule(schedule);

    expect(prisma.vendor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'vendor-1' } })
    );
    expect(txWorkOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'assigned', vendorId: 'preferred-vendor-1' }),
      })
    );
  });

  it('leaves the work order unassigned when the explicit vendor is inactive and vendor_management is not active', async () => {
    (prisma.vendor.findFirst as any).mockResolvedValue({ status: 'inactive' });
    (prisma.organization.findUnique as any).mockResolvedValue({ activeModules: [] });

    const txWorkOrderCreate = vi.fn().mockResolvedValue({ id: 'wo-6' });
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        workOrder: { create: txWorkOrderCreate },
        maintenanceSchedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      })
    );

    await generateWorkOrderForSchedule(schedule);

    expect(txWorkOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'new_order', vendorId: null }) })
    );
  });
});

describe('deleteMaintenanceSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks deletion once the schedule has generated work-order history', async () => {
    (prisma.property.findFirst as any).mockResolvedValue({ id: 'prop-1' });
    (prisma.maintenanceSchedule.findFirst as any).mockResolvedValue({ id: 'sched-1' });
    (prisma.workOrder.count as any).mockResolvedValue(3);

    await expect(deleteMaintenanceSchedule('org-1', 'prop-1', 'sched-1')).rejects.toMatchObject({
      code: 'SCHEDULE_HAS_HISTORY',
    });
    expect(prisma.maintenanceSchedule.delete).not.toHaveBeenCalled();
  });

  it('allows deletion when the schedule has never generated a work order', async () => {
    (prisma.property.findFirst as any).mockResolvedValue({ id: 'prop-1' });
    (prisma.maintenanceSchedule.findFirst as any).mockResolvedValue({ id: 'sched-1' });
    (prisma.workOrder.count as any).mockResolvedValue(0);

    await deleteMaintenanceSchedule('org-1', 'prop-1', 'sched-1');

    expect(prisma.maintenanceSchedule.delete).toHaveBeenCalledWith({ where: { id: 'sched-1' } });
  });
});
