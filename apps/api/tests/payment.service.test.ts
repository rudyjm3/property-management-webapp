import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  PaymentType: {},
  PaymentStatus: {},
}));

import { prisma } from '@propflow/db';
import { voidPayment } from '../src/services/payment.service';

const basePayment = {
  id: 'payment-1',
  status: 'completed',
  amount: 1500,
  lease: {
    id: 'lease-1',
    rentAmount: 1500,
    unit: { id: 'unit-1', unitNumber: '101', property: { id: 'prop-1', name: 'Test Property', organizationId: 'org-1' } },
  },
  tenant: { id: 'tenant-1', name: 'Test Tenant', email: 'tenant@example.com' },
};

describe('payment.service voidPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.payment.findFirst as any).mockResolvedValue(basePayment);
  });

  function mockTx(ledgerEntries: any[]) {
    const ledgerEntry = {
      findMany: vi.fn().mockResolvedValue(ledgerEntries),
      findFirst: vi.fn().mockResolvedValue(
        ledgerEntries.length ? ledgerEntries[ledgerEntries.length - 1] : null
      ),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'reversal-entry', ...data })),
    };
    const tx = {
      ledgerEntry,
      payment: {
        findUnique: vi.fn().mockResolvedValue({ status: basePayment.status }),
        update: vi.fn().mockResolvedValue({ ...basePayment, status: 'voided' }),
      },
      $executeRaw: vi.fn().mockResolvedValue(undefined),
    };
    (prisma.$transaction as any).mockImplementation((cb: any) => cb(tx));
    return tx;
  }

  it('rejects voiding an already-voided payment', async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({ ...basePayment, status: 'voided' });
    await expect(voidPayment('org-1', 'payment-1', 'mistake')).rejects.toMatchObject({
      code: 'PAYMENT_ALREADY_VOIDED',
    });
  });

  it('reverses a completed payment that posted a single ledger credit, restoring balance to zero', async () => {
    const tx = mockTx([
      {
        id: 'entry-1',
        organizationId: 'org-1',
        paymentId: 'payment-1',
        type: 'credit',
        amount: 1500,
        balanceAfter: 1500,
      },
    ]);

    await voidPayment('org-1', 'payment-1', 'Duplicate ACH charge');

    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
    const reversal = tx.ledgerEntry.create.mock.calls[0][0].data;
    expect(reversal.type).toBe('debit');
    expect(reversal.amount).toBe(1500);
    // Balance was 1500 (from the prior credit) — the reversing debit must bring it back to 0.
    expect(reversal.balanceAfter).toBe(0);
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'voided' }) })
    );
  });

  it('nets multiple prior entries (credit + partial refund debit) into a single reversal', async () => {
    const tx = mockTx([
      { id: 'e1', organizationId: 'org-1', paymentId: 'payment-1', type: 'credit', amount: 1500, balanceAfter: 1500 },
      { id: 'e2', organizationId: 'org-1', paymentId: 'payment-1', type: 'debit', amount: 500, balanceAfter: 1000 },
    ]);

    await voidPayment('org-1', 'payment-1', 'Chargeback');

    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
    const reversal = tx.ledgerEntry.create.mock.calls[0][0].data;
    // Net posted was +1000 (1500 credit - 500 debit), so the reversal must be a 1000 debit.
    expect(reversal.type).toBe('debit');
    expect(reversal.amount).toBe(1000);
  });

  it('does not touch the ledger for a payment that never posted an entry (e.g. cash)', async () => {
    const tx = mockTx([]);

    await voidPayment('org-1', 'payment-1', 'Recorded in error');

    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.payment.update).toHaveBeenCalled();
  });

  it('re-checks status under the lock and refuses a double-reversal from a concurrent void', async () => {
    const tx = mockTx([
      { id: 'entry-1', organizationId: 'org-1', paymentId: 'payment-1', type: 'credit', amount: 1500, balanceAfter: 1500 },
    ]);
    // Simulates a second, overlapping void request: by the time this transaction
    // acquires the advisory lock, a concurrent one has already voided the payment.
    tx.payment.findUnique = vi.fn().mockResolvedValue({ status: 'voided' });

    await expect(voidPayment('org-1', 'payment-1', 'Duplicate ACH charge')).rejects.toMatchObject({
      code: 'PAYMENT_ALREADY_VOIDED',
    });
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalled();
  });
});
