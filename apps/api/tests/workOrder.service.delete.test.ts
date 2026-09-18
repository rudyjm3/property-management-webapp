import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    workOrder: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  WorkOrderStatus: {},
  WorkOrderPriority: {},
  WorkOrderCategory: {},
  WorkOrderLocationType: {},
}));

import { prisma } from '@propflow/db';
import { deleteWorkOrder } from '../src/services/workOrder.service';

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.organization.findUnique as any).mockResolvedValue({ activeModules: [] });
});

describe('deleteWorkOrder', () => {
  it('throws when the work order does not belong to the org', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue(null);

    await expect(deleteWorkOrder('org-1', 'wo-x')).rejects.toMatchObject({
      code: 'WORK_ORDER_NOT_FOUND',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes a rated work order by removing its VendorWorkOrderRating and recomputing the vendor average first, in the same transaction', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({ id: 'wo-1', vendorId: 'v-1' });

    const txRatingFindUnique = vi.fn().mockResolvedValue({ id: 'rating-1', vendorId: 'v-1', workOrderId: 'wo-1' });
    const txRatingDelete = vi.fn().mockResolvedValue({ id: 'rating-1' });
    const txAggregate = vi.fn().mockResolvedValue({ _avg: { rating: 3.5 } });
    const txVendorUpdate = vi.fn().mockResolvedValue({ id: 'v-1', rating: 3.5 });
    const txExecuteRaw = vi.fn().mockResolvedValue(undefined);
    const txWorkOrderDelete = vi.fn().mockResolvedValue({ id: 'wo-1' });

    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        vendorWorkOrderRating: { findUnique: txRatingFindUnique, delete: txRatingDelete, aggregate: txAggregate },
        vendor: { update: txVendorUpdate },
        workOrder: { delete: txWorkOrderDelete },
        $executeRaw: txExecuteRaw,
      })
    );

    await deleteWorkOrder('org-1', 'wo-1');

    expect(txRatingFindUnique).toHaveBeenCalledWith({ where: { workOrderId: 'wo-1' } });
    expect(txRatingDelete).toHaveBeenCalledWith({ where: { id: 'rating-1' } });
    expect(txVendorUpdate).toHaveBeenCalledWith({ where: { id: 'v-1' }, data: { rating: 3.5 } });
    expect(txWorkOrderDelete).toHaveBeenCalledWith({ where: { id: 'wo-1' } });

    // Rating removal + rollup must happen before the work order row is gone,
    // since the rating's FK to the work order is Restrict.
    const ratingDeleteOrder = txRatingDelete.mock.invocationCallOrder[0];
    const workOrderDeleteOrder = txWorkOrderDelete.mock.invocationCallOrder[0];
    expect(ratingDeleteOrder).toBeLessThan(workOrderDeleteOrder);
  });

  it('deletes an unrated work order without touching VendorWorkOrderRating', async () => {
    (prisma.workOrder.findFirst as any).mockResolvedValue({ id: 'wo-2', vendorId: null });

    const txRatingFindUnique = vi.fn().mockResolvedValue(null);
    const txRatingDelete = vi.fn();
    const txVendorUpdate = vi.fn();
    const txWorkOrderDelete = vi.fn().mockResolvedValue({ id: 'wo-2' });

    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        vendorWorkOrderRating: { findUnique: txRatingFindUnique, delete: txRatingDelete },
        vendor: { update: txVendorUpdate },
        workOrder: { delete: txWorkOrderDelete },
      })
    );

    await deleteWorkOrder('org-1', 'wo-2');

    expect(txRatingDelete).not.toHaveBeenCalled();
    expect(txVendorUpdate).not.toHaveBeenCalled();
    expect(txWorkOrderDelete).toHaveBeenCalledWith({ where: { id: 'wo-2' } });
  });
});
