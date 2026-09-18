import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    vendor: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    workOrder: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    maintenanceSchedule: { count: vi.fn() },
    vendorWorkOrderRating: { findUnique: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
    preferredVendorAssignment: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    property: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  VendorStatus: { active: 'active', inactive: 'inactive' },
  WorkOrderStatus: {},
  WorkOrderCategory: {},
}));

import { prisma } from '@propflow/db';
import {
  isVendorManagementActive,
  getVendorExpiryAlerts,
  getVendorWorkHistory,
  rateVendorWorkOrder,
  upsertPreferredVendorAssignment,
  resolvePreferredVendor,
  deleteVendor,
} from '../src/services/vendor.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isVendorManagementActive', () => {
  it('returns true only when vendor_management is in the org activeModules', async () => {
    (prisma.organization.findUnique as any).mockResolvedValue({ activeModules: ['vendor_management'] });
    expect(await isVendorManagementActive('org-1')).toBe(true);

    (prisma.organization.findUnique as any).mockResolvedValue({ activeModules: [] });
    expect(await isVendorManagementActive('org-1')).toBe(false);
  });
});

describe('getVendorExpiryAlerts', () => {
  it('flags an already-expired license and an expiring-soon insurance policy, and omits a vendor with neither', async () => {
    const now = new Date('2026-09-18T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    (prisma.vendor.findMany as any).mockResolvedValue([
      {
        id: 'v-expired-license',
        companyName: 'Acme Plumbing',
        contactName: 'Joe',
        licenseNumber: 'L1',
        licenseExpiresAt: new Date('2026-09-01T00:00:00.000Z'), // already past
        insuranceExpiresAt: null,
      },
      {
        id: 'v-expiring-insurance',
        companyName: 'Bolt Electric',
        contactName: 'Sam',
        licenseNumber: 'L2',
        licenseExpiresAt: null,
        insuranceExpiresAt: new Date('2026-10-01T00:00:00.000Z'), // 13 days out, within 30-day window
      },
    ]);

    const alerts = await getVendorExpiryAlerts('org-1');

    expect(alerts).toHaveLength(2);
    expect(alerts.find((a) => a.id === 'v-expired-license')?.licenseStatus).toBe('expired');
    expect(alerts.find((a) => a.id === 'v-expiring-insurance')?.insuranceStatus).toBe('expiring');

    vi.useRealTimers();
  });
});

describe('getVendorWorkHistory', () => {
  it('sums totalCost when present, falls back to labor+parts otherwise, and buckets by category', async () => {
    (prisma.vendor.findFirst as any).mockResolvedValue({ id: 'vendor-1' });
    (prisma.workOrder.findMany as any).mockResolvedValue([
      {
        id: 'wo-1',
        category: 'plumbing',
        completedAt: new Date(),
        laborCost: null,
        partsCost: null,
        totalCost: 250,
        scheduleId: null,
        vendorRating: { rating: 5, note: 'Great', createdAt: new Date() },
      },
      {
        id: 'wo-2',
        category: 'plumbing',
        completedAt: new Date(),
        laborCost: 100,
        partsCost: 50,
        totalCost: null,
        scheduleId: 'sched-1',
        vendorRating: null,
      },
      {
        id: 'wo-3',
        category: 'grounds',
        completedAt: new Date(),
        laborCost: null,
        partsCost: null,
        totalCost: 40,
        scheduleId: 'sched-2',
        vendorRating: null,
      },
    ]);

    const history = await getVendorWorkHistory('org-1', 'vendor-1', 12);

    expect(history.count).toBe(3);
    expect(history.totalSpend).toBe(440); // 250 + 150 + 40
    expect(history.scheduleGeneratedCount).toBe(2);
    expect(history.byCategory).toEqual(
      expect.arrayContaining([
        { category: 'plumbing', count: 2, spend: 400 },
        { category: 'grounds', count: 1, spend: 40 },
      ])
    );
    expect(history.ratings.count).toBe(1);
    expect(history.ratings.average).toBe(5);
  });

  it('throws when the vendor does not belong to the org', async () => {
    (prisma.vendor.findFirst as any).mockResolvedValue(null);
    await expect(getVendorWorkHistory('org-1', 'vendor-x', 12)).rejects.toMatchObject({ code: 'VENDOR_NOT_FOUND' });
  });
});

describe('rateVendorWorkOrder', () => {
  it('rejects rating a work order with no vendor assigned', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({ id: 'wo-1', vendorId: null, status: 'completed' });
    await expect(rateVendorWorkOrder('org-1', 'wo-1', { rating: 5 })).rejects.toMatchObject({
      code: 'NO_VENDOR_ASSIGNED',
    });
  });

  it('rejects rating a work order that is not completed/closed', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({ id: 'wo-1', vendorId: 'v-1', status: 'in_progress' });
    await expect(rateVendorWorkOrder('org-1', 'wo-1', { rating: 5 })).rejects.toMatchObject({
      code: 'WORK_ORDER_NOT_COMPLETE',
    });
  });

  it('rejects a second rating for the same work order', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({ id: 'wo-1', vendorId: 'v-1', status: 'completed' });
    (prisma.vendorWorkOrderRating.findUnique as any).mockResolvedValue({ id: 'existing-rating' });
    await expect(rateVendorWorkOrder('org-1', 'wo-1', { rating: 4 })).rejects.toMatchObject({ code: 'ALREADY_RATED' });
  });

  it('creates the rating and recomputes Vendor.rating as the average of all ratings', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({ id: 'wo-1', vendorId: 'v-1', status: 'completed' });
    (prisma.vendorWorkOrderRating.findUnique as any).mockResolvedValue(null);

    const txCreate = vi.fn().mockResolvedValue({ id: 'rating-1', workOrderId: 'wo-1', vendorId: 'v-1', rating: 5 });
    const txAggregate = vi.fn().mockResolvedValue({ _avg: { rating: 4.5 } });
    const txVendorUpdate = vi.fn().mockResolvedValue({ id: 'v-1', rating: 4.5 });
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        vendorWorkOrderRating: { create: txCreate, aggregate: txAggregate },
        vendor: { update: txVendorUpdate },
      })
    );

    const result = await rateVendorWorkOrder('org-1', 'wo-1', { rating: 5, note: 'Solid work' });

    expect(result).toEqual({ id: 'rating-1', workOrderId: 'wo-1', vendorId: 'v-1', rating: 5 });
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { workOrderId: 'wo-1', vendorId: 'v-1', rating: 5, note: 'Solid work' } })
    );
    expect(txVendorUpdate).toHaveBeenCalledWith({ where: { id: 'v-1' }, data: { rating: 4.5 } });
  });
});

describe('deleteVendor', () => {
  it('blocks deletion when the vendor has work order or schedule history', async () => {
    (prisma.vendor.findFirst as any).mockResolvedValue({ id: 'v-1' });
    (prisma.workOrder.count as any).mockResolvedValue(2);
    (prisma.maintenanceSchedule.count as any).mockResolvedValue(0);

    await expect(deleteVendor('org-1', 'v-1')).rejects.toMatchObject({ code: 'VENDOR_HAS_HISTORY' });
    expect(prisma.vendor.delete).not.toHaveBeenCalled();
  });

  it('allows deletion when the vendor has no history', async () => {
    (prisma.vendor.findFirst as any).mockResolvedValue({ id: 'v-1' });
    (prisma.workOrder.count as any).mockResolvedValue(0);
    (prisma.maintenanceSchedule.count as any).mockResolvedValue(0);

    await deleteVendor('org-1', 'v-1');
    expect(prisma.vendor.delete).toHaveBeenCalledWith({ where: { id: 'v-1' } });
  });
});

describe('upsertPreferredVendorAssignment / resolvePreferredVendor', () => {
  it('creates a new assignment when none exists for the (org, propertyId, category) combo', async () => {
    (prisma.property.findFirst as any).mockResolvedValue({ id: 'prop-1' });
    (prisma.vendor.findFirst as any).mockResolvedValue({ id: 'vendor-1' });
    (prisma.preferredVendorAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.preferredVendorAssignment.create as any).mockResolvedValue({ id: 'assign-1' });

    const result = await upsertPreferredVendorAssignment('org-1', {
      propertyId: 'prop-1',
      category: 'plumbing',
      vendorId: 'vendor-1',
    });

    expect(result).toEqual({ id: 'assign-1' });
    expect(prisma.preferredVendorAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { organizationId: 'org-1', propertyId: 'prop-1', category: 'plumbing', vendorId: 'vendor-1' },
      })
    );
  });

  it('updates the existing assignment instead of creating a duplicate for the same (org, null propertyId, category) combo', async () => {
    (prisma.vendor.findFirst as any).mockResolvedValue({ id: 'vendor-2' });
    (prisma.preferredVendorAssignment.findFirst as any).mockResolvedValue({ id: 'assign-existing' });
    (prisma.preferredVendorAssignment.update as any).mockResolvedValue({ id: 'assign-existing', vendorId: 'vendor-2' });

    const result = await upsertPreferredVendorAssignment('org-1', { category: 'grounds', vendorId: 'vendor-2' });

    expect(result).toEqual({ id: 'assign-existing', vendorId: 'vendor-2' });
    expect(prisma.preferredVendorAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', propertyId: null, category: 'grounds' } })
    );
    expect(prisma.preferredVendorAssignment.create).not.toHaveBeenCalled();
  });

  it('resolvePreferredVendor prefers a property+category match over the org-wide default', async () => {
    (prisma.preferredVendorAssignment.findFirst as any)
      .mockResolvedValueOnce({ vendorId: 'property-specific-vendor' }) // property match
      .mockResolvedValueOnce({ vendorId: 'org-wide-vendor' });

    const result = await resolvePreferredVendor('org-1', 'prop-1', 'plumbing');
    expect(result).toBe('property-specific-vendor');
  });

  it('resolvePreferredVendor falls back to the org-wide default when no property match exists', async () => {
    (prisma.preferredVendorAssignment.findFirst as any)
      .mockResolvedValueOnce(null) // no property match
      .mockResolvedValueOnce({ vendorId: 'org-wide-vendor' });

    const result = await resolvePreferredVendor('org-1', 'prop-1', 'plumbing');
    expect(result).toBe('org-wide-vendor');
  });

  it('resolvePreferredVendor returns null when nothing matches', async () => {
    (prisma.preferredVendorAssignment.findFirst as any).mockResolvedValue(null);
    const result = await resolvePreferredVendor('org-1', null, 'plumbing');
    expect(result).toBeNull();
  });
});
