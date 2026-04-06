import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    lease: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@propflow/db';
import { renewLease } from '../src/services/lease.service';

const baseExistingLease = {
  id: 'lease-old',
  unitId: 'unit-1',
  status: 'active',
  endDate: new Date('2026-06-30'),
  depositAmount: 1000,
  type: 'fixed_term',
  lateFeeAmount: 50,
  lateFeeGraceDays: 5,
  rentDueDay: 1,
  noticePeriodDays: 30,
  participants: [{ tenantId: 'tenant-1', isPrimary: true }],
};

describe('lease.service renewLease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.lease.findFirst as any).mockResolvedValue(baseExistingLease);
  });

  it('rejects non-renewable statuses', async () => {
    (prisma.lease.findFirst as any).mockResolvedValue({
      ...baseExistingLease,
      status: 'expired',
    });

    await expect(
      renewLease('org-1', 'lease-old', {
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        rentAmount: 1700,
      }),
    ).rejects.toMatchObject({ code: 'LEASE_NOT_RENEWABLE' });
  });

  it('rejects overlapping renewal date ranges', async () => {
    await expect(
      renewLease('org-1', 'lease-old', {
        startDate: '2026-06-30',
        endDate: '2027-06-30',
        rentAmount: 1700,
      }),
    ).rejects.toMatchObject({ code: 'LEASE_RENEWAL_OVERLAP' });
  });

  it('returns renewal metadata on success', async () => {
    (prisma.$transaction as any).mockImplementation(async (callback: any) => {
      const tx = {
        lease: {
          update: vi.fn().mockResolvedValue({ id: 'lease-old', status: 'terminated' }),
          create: vi.fn().mockResolvedValue({
            id: 'lease-new',
            renewalOfLeaseId: 'lease-old',
            status: 'active',
          }),
        },
        unit: {
          update: vi.fn().mockResolvedValue({ id: 'unit-1', status: 'occupied' }),
        },
      };
      return callback(tx);
    });

    const result = await renewLease('org-1', 'lease-old', {
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      rentAmount: 1700,
      type: 'fixed_term',
    });

    expect(result).toMatchObject({
      id: 'lease-new',
      renewalOfLeaseId: 'lease-old',
      createdLeaseId: 'lease-new',
      previousLeaseStatus: 'active',
    });
  });
});
