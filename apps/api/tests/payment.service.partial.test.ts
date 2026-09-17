import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    payment: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  PaymentType: {},
  PaymentStatus: {},
  PaymentMethod: {},
}));

import { prisma } from '@propflow/db';
import { recordPartialPayment } from '../src/services/payment.service';

const basePayment = {
  id: 'payment-1',
  leaseId: 'lease-1',
  tenantId: 'tenant-1',
  status: 'pending',
  amount: 1500,
  type: 'rent',
  dueDate: new Date('2026-07-01'),
  notes: null,
  lease: {
    id: 'lease-1',
    rentAmount: 1500,
    unit: { id: 'unit-1', unitNumber: '101', property: { id: 'prop-1', name: 'Test Property', organizationId: 'org-1' } },
  },
  tenant: { id: 'tenant-1', name: 'Test Tenant', email: 'tenant@example.com' },
};

describe('payment.service recordPartialPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.payment.findFirst as any).mockResolvedValue(basePayment);
  });

  function mockTx() {
    const tx = {
      payment: {
        update: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ ...basePayment, ...data })
        ),
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'payment-2', ...data })
        ),
      },
    };
    (prisma.$transaction as any).mockImplementation((cb: any) => cb(tx));
    return tx;
  }

  it('rejects a payment that is not pending', async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({ ...basePayment, status: 'completed' });

    await expect(
      recordPartialPayment('org-1', 'payment-1', { amountPaid: 500, method: 'cash' } as any)
    ).rejects.toMatchObject({ code: 'PAYMENT_NOT_PENDING' });
  });

  it('rejects an amountPaid that is not actually partial', async () => {
    mockTx();

    await expect(
      recordPartialPayment('org-1', 'payment-1', { amountPaid: 1500, method: 'cash' } as any)
    ).rejects.toMatchObject({ code: 'NOT_A_PARTIAL_PAYMENT' });

    await expect(
      recordPartialPayment('org-1', 'payment-1', { amountPaid: 2000, method: 'cash' } as any)
    ).rejects.toMatchObject({ code: 'NOT_A_PARTIAL_PAYMENT' });
  });

  it('splits the payment: original completed at the amount paid, remainder carried forward as pending', async () => {
    const tx = mockTx();

    const result = await recordPartialPayment('org-1', 'payment-1', {
      amountPaid: 500,
      method: 'cash',
    } as any);

    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment-1' },
        data: expect.objectContaining({
          amount: 500,
          originalAmount: 1500,
          status: 'completed',
          method: 'cash',
        }),
      })
    );

    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 1000,
          status: 'pending',
          dueDate: basePayment.dueDate,
          carriedFromPayment: { connect: { id: 'payment-1' } },
        }),
      })
    );

    expect(result.originalPayment.amount).toBe(500);
    expect(result.carriedForwardPayment.amount).toBe(1000);
  });

  it('rounds the carried-forward remainder to the cent', async () => {
    const tx = mockTx();
    (prisma.payment.findFirst as any).mockResolvedValue({ ...basePayment, amount: 100.1 });

    await recordPartialPayment('org-1', 'payment-1', { amountPaid: 33.33, method: 'cash' } as any);

    const createCall = tx.payment.create.mock.calls[0][0];
    expect(createCall.data.amount).toBe(66.77);
  });
});
