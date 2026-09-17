import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    property: {
      findMany: vi.fn(),
    },
    disbursement: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@propflow/db';
import { getScheduleEExport } from '../src/services/report.service';

const baseProperty = {
  id: 'prop-1',
  organizationId: 'org-1',
  name: 'Test Property',
  address: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  taxParcelId: 'PARCEL-1',
  units: [],
  workOrders: [],
  propertyOwners: [],
};

describe('report.service getScheduleEExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // getFinancialSummary's property query (has `include`) vs. this
    // function's own taxParcelId lookup (has `select`) share the same mock —
    // differentiate by which option key the call used.
    (prisma.property.findMany as any).mockImplementation((args: any) =>
      Promise.resolve(
        args.select
          ? [{ id: baseProperty.id, taxParcelId: baseProperty.taxParcelId }]
          : [baseProperty]
      )
    );
    (prisma.disbursement.findMany as any).mockResolvedValue([]);
  });

  it('queries disbursements by a single recognition date (createdAt), not the statement period', async () => {
    await getScheduleEExport('org-1', { periodStart: '2026-01-01', periodEnd: '2026-01-31' });

    expect(prisma.disbursement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          createdAt: { gte: new Date('2026-01-01'), lte: expect.any(Date) },
        }),
      })
    );
    const call = (prisma.disbursement.findMany as any).mock.calls[0][0];
    expect(call.where.ownerStatement).toBeUndefined();
  });

  it('excludes cancelled disbursements from the management-fee query', async () => {
    await getScheduleEExport('org-1', { periodStart: '2026-01-01', periodEnd: '2026-01-31' });

    const call = (prisma.disbursement.findMany as any).mock.calls[0][0];
    expect(call.where.status).toEqual({ not: 'cancelled' });
  });

  it('sums management fees from matching disbursements into the property row', async () => {
    (prisma.disbursement.findMany as any).mockResolvedValue([
      { propertyId: 'prop-1', managementFeeAmount: 100 },
      { propertyId: 'prop-1', managementFeeAmount: 50 },
    ]);

    const result = await getScheduleEExport('org-1', { periodStart: '2026-01-01', periodEnd: '2026-01-31' });

    expect(result.rows[0].managementFees).toBe(150);
  });
});
