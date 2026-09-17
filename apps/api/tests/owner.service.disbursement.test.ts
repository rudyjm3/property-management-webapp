import { beforeEach, describe, expect, it, vi } from 'vitest';

// owner.service.ts imports these for the (unrelated) portal-invite flow; mock
// them so importing the module under test doesn't require Supabase env vars.
vi.mock('../src/lib/supabase', () => ({ supabaseAdmin: {} }));
vi.mock('../src/services/email.service', () => ({ sendOwnerPortalInviteEmail: vi.fn() }));

vi.mock('@propflow/db', () => ({
  prisma: {
    ownerStatement: {
      findFirst: vi.fn(),
    },
    organization: {
      findUniqueOrThrow: vi.fn(),
    },
    disbursement: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '@propflow/db';
import { createDisbursement, updateDisbursement } from '../src/services/owner.service';

const baseStatement = {
  id: 'stmt-1',
  organizationId: 'org-1',
  ownerId: 'owner-1',
  propertyId: 'prop-1',
  distributionAmount: 1000,
};

describe('owner.service createDisbursement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.ownerStatement.findFirst as any).mockResolvedValue(baseStatement);
    (prisma.disbursement.findFirst as any).mockResolvedValue(null);
    (prisma.disbursement.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'disb-1', ...data })
    );
  });

  it('rejects a second disbursement while one is already pending or completed', async () => {
    (prisma.disbursement.findFirst as any).mockResolvedValue({ id: 'disb-existing', status: 'pending' });
    (prisma.organization.findUniqueOrThrow as any).mockResolvedValue({ defaultManagementFeePct: 10 });

    await expect(
      createDisbursement('org-1', 'stmt-1', {})
    ).rejects.toMatchObject({ code: 'DISBURSEMENT_ALREADY_EXISTS' });
    expect(prisma.disbursement.create).not.toHaveBeenCalled();
  });

  it('allows a new disbursement once the prior one was cancelled', async () => {
    // findFirst is scoped to status: { in: ['pending', 'completed'] }, so a
    // cancelled-only prior disbursement resolves to null here.
    (prisma.disbursement.findFirst as any).mockResolvedValue(null);
    (prisma.organization.findUniqueOrThrow as any).mockResolvedValue({ defaultManagementFeePct: 10 });

    const result = await createDisbursement('org-1', 'stmt-1', {});

    expect(result.grossAmount).toBe(1000);
  });

  it('rejects when the statement does not belong to the org', async () => {
    (prisma.ownerStatement.findFirst as any).mockResolvedValue(null);

    await expect(
      createDisbursement('org-1', 'stmt-1', {})
    ).rejects.toMatchObject({ code: 'STATEMENT_NOT_FOUND' });
  });

  it('uses the org default management fee percentage when none is provided', async () => {
    (prisma.organization.findUniqueOrThrow as any).mockResolvedValue({ defaultManagementFeePct: 10 });

    const result = await createDisbursement('org-1', 'stmt-1', {});

    expect(result.grossAmount).toBe(1000);
    expect(result.managementFeePct).toBe(10);
    expect(result.managementFeeAmount).toBe(100);
    expect(result.netDisbursementAmount).toBe(900);
  });

  it('overrides the org default when a per-disbursement fee percentage is given', async () => {
    (prisma.organization.findUniqueOrThrow as any).mockResolvedValue({ defaultManagementFeePct: 10 });

    const result = await createDisbursement('org-1', 'stmt-1', { managementFeePct: 15 });

    expect(result.managementFeePct).toBe(15);
    expect(result.managementFeeAmount).toBe(150);
    expect(result.netDisbursementAmount).toBe(850);
  });

  it('rounds the fee to the cent for amounts that do not divide evenly', async () => {
    (prisma.organization.findUniqueOrThrow as any).mockResolvedValue({ defaultManagementFeePct: 10 });
    (prisma.ownerStatement.findFirst as any).mockResolvedValue({ ...baseStatement, distributionAmount: 333.33 });

    const result = await createDisbursement('org-1', 'stmt-1', {});

    expect(result.managementFeeAmount).toBe(33.33);
    expect(result.netDisbursementAmount).toBe(300);
  });
});

describe('owner.service updateDisbursement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unknown disbursement', async () => {
    (prisma.disbursement.findFirst as any).mockResolvedValue(null);

    await expect(
      updateDisbursement('org-1', 'disb-1', { status: 'completed' })
    ).rejects.toMatchObject({ code: 'DISBURSEMENT_NOT_FOUND' });
  });

  it('stamps disbursedAt when marked completed', async () => {
    (prisma.disbursement.findFirst as any).mockResolvedValue({ id: 'disb-1', status: 'pending', referenceNote: null, disbursedAt: null });
    (prisma.disbursement.update as any).mockImplementation(({ data }: any) => Promise.resolve({ id: 'disb-1', ...data }));

    const result = await updateDisbursement('org-1', 'disb-1', { status: 'completed' });

    expect(result.status).toBe('completed');
    expect(result.disbursedAt).toBeInstanceOf(Date);
  });
});
