import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    lease: {
      findFirst: vi.fn(),
    },
    securityDepositDisposition: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@propflow/db';
import { reconcileSecurityDeposit, getSecurityDepositDisposition } from '../src/services/lease.service';

const terminatedLease = {
  id: 'lease-1',
  status: 'terminated',
  moveOutDate: new Date('2026-06-30'),
  depositAmount: 1000,
  securityDepositReturnAmount: 600,
  securityDepositStatus: 'partial_return',
  securityDepositDeductions: { lineItems: [{ reason: 'Carpet cleaning', amount: 400 }] },
};

describe('lease.service reconcileSecurityDeposit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a lease that has not been moved out', async () => {
    (prisma.lease.findFirst as any).mockResolvedValue({ ...terminatedLease, status: 'active', moveOutDate: null });

    await expect(
      reconcileSecurityDeposit('org-1', 'lease-1', 'user-1', {})
    ).rejects.toMatchObject({ code: 'LEASE_NOT_MOVED_OUT' });
  });

  it('rejects an unknown lease', async () => {
    (prisma.lease.findFirst as any).mockResolvedValue(null);

    await expect(
      reconcileSecurityDeposit('org-1', 'lease-1', 'user-1', {})
    ).rejects.toMatchObject({ code: 'LEASE_NOT_FOUND' });
  });

  it('computes total deductions as deposit minus return amount and persists the disposition', async () => {
    (prisma.lease.findFirst as any).mockResolvedValue(terminatedLease);
    (prisma.securityDepositDisposition.upsert as any).mockImplementation(({ create }: any) =>
      Promise.resolve({ id: 'disp-1', ...create })
    );

    const result = await reconcileSecurityDeposit('org-1', 'lease-1', 'user-1', {
      moveOutConditionNotes: 'Carpet stained in living room',
    });

    expect(prisma.securityDepositDisposition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leaseId: 'lease-1' },
        create: expect.objectContaining({
          depositAmount: 1000,
          totalDeductions: 400,
          returnAmount: 600,
          status: 'partial_return',
          reconciledByUserId: 'user-1',
          moveOutConditionNotes: 'Carpet stained in living room',
        }),
      })
    );
    expect(result.totalDeductions).toBe(400);
  });
});

describe('lease.service getSecurityDepositDisposition', () => {
  it('throws when no disposition exists for the lease', async () => {
    (prisma.securityDepositDisposition.findFirst as any).mockResolvedValue(null);

    await expect(
      getSecurityDepositDisposition('org-1', 'lease-1')
    ).rejects.toMatchObject({ code: 'DISPOSITION_NOT_FOUND' });
  });
});
