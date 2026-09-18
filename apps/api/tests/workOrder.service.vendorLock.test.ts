import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    vendor: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    workOrder: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  WorkOrderStatus: {},
  WorkOrderPriority: {},
  WorkOrderCategory: {},
  WorkOrderLocationType: {},
}));

import { prisma } from '@propflow/db';
import { updateWorkOrder } from '../src/services/workOrder.service';

// Once a VendorWorkOrderRating exists for a work order, it "locks in" the
// vendor it was submitted for. This suite covers the review finding that
// reassigning vendorId on a rated work order otherwise leaves the rating
// pointing at a vendor the work order is no longer assigned to.
describe('updateWorkOrder vendor-reassignment lock (rated work orders)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.organization.findUnique as any).mockResolvedValue({ activeModules: [] });
  });

  it('rejects reassigning the vendor on a work order that already has a rating', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({
      id: 'wo-1',
      unitId: null,
      status: 'completed',
      tenantId: null,
      vendorId: 'vendor-old',
      vendorRating: { id: 'rating-1', rating: 5, note: null, createdAt: new Date() },
    });
    (prisma.vendor.findFirst as any).mockResolvedValue({ id: 'vendor-new' });

    await expect(
      updateWorkOrder('org-1', 'wo-1', { vendorId: 'vendor-new' })
    ).rejects.toMatchObject({ code: 'VENDOR_LOCKED_BY_RATING' });

    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it('rejects clearing the vendor on a rated work order', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({
      id: 'wo-1',
      unitId: null,
      status: 'completed',
      tenantId: null,
      vendorId: 'vendor-old',
      vendorRating: { id: 'rating-1', rating: 5, note: null, createdAt: new Date() },
    });

    await expect(
      updateWorkOrder('org-1', 'wo-1', { vendorId: null })
    ).rejects.toMatchObject({ code: 'VENDOR_LOCKED_BY_RATING' });

    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it('allows other field updates on a rated work order as long as vendorId is left unchanged', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({
      id: 'wo-1',
      unitId: null,
      status: 'completed',
      tenantId: null,
      vendorId: 'vendor-old',
      vendorRating: { id: 'rating-1', rating: 5, note: null, createdAt: new Date() },
    });
    (prisma.workOrder.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'wo-1', ...data })
    );

    await updateWorkOrder('org-1', 'wo-1', { resolutionNotes: 'Follow-up note' });

    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolutionNotes: 'Follow-up note' }) })
    );
  });

  it('allows setting the same vendorId again on a rated work order (no-op reassignment)', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({
      id: 'wo-1',
      unitId: null,
      status: 'completed',
      tenantId: null,
      vendorId: 'vendor-old',
      vendorRating: { id: 'rating-1', rating: 5, note: null, createdAt: new Date() },
    });
    (prisma.vendor.findFirst as any).mockResolvedValue({ id: 'vendor-old' });
    (prisma.workOrder.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'wo-1', ...data })
    );

    await updateWorkOrder('org-1', 'wo-1', { vendorId: 'vendor-old' });

    expect(prisma.workOrder.update).toHaveBeenCalled();
  });

  it('allows vendor reassignment on a work order with no rating', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({
      id: 'wo-2',
      unitId: null,
      status: 'assigned',
      tenantId: null,
      vendorId: 'vendor-old',
      vendorRating: null,
    });
    (prisma.vendor.findFirst as any).mockResolvedValue({ id: 'vendor-new' });
    (prisma.workOrder.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'wo-2', ...data })
    );

    await updateWorkOrder('org-1', 'wo-2', { vendorId: 'vendor-new' });

    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vendorId: 'vendor-new' }) })
    );
  });
});
