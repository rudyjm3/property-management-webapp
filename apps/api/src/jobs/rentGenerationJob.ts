import { prisma } from '@propflow/db';
import { CURRENT_LEASE_STATUSES } from '../constants';

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RentGenerationJobResult {
  processed: number;
  created: number;
  skipped: number;
  failed: number;
}

export async function generateRentPayments(organizationId?: string): Promise<RentGenerationJobResult> {
  const result: RentGenerationJobResult = { processed: 0, created: 0, skipped: 0, failed: 0 };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const activeLeases = await prisma.lease.findMany({
    where: {
      status: { in: [...CURRENT_LEASE_STATUSES] },
      deletedAt: null,
      ...(organizationId
        ? { unit: { property: { organizationId } } }
        : {}),
    },
    include: {
      participants: {
        where: { isPrimary: true },
        select: { tenantId: true },
      },
    },
  });

  result.processed = activeLeases.length;

  for (const lease of activeLeases) {
    try {
      const primaryParticipant = lease.participants[0];
      if (!primaryParticipant) {
        result.skipped++;
        continue;
      }

      // Skip if a non-waived rent payment already exists for this month
      const existing = await prisma.payment.findFirst({
        where: {
          leaseId: lease.id,
          type: 'rent',
          status: { not: 'waived' },
          dueDate: { gte: monthStart, lte: monthEnd },
          deletedAt: null,
        },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      const dueDate = new Date(now.getFullYear(), now.getMonth(), lease.rentDueDay ?? 1);

      await prisma.payment.create({
        data: {
          leaseId: lease.id,
          tenantId: primaryParticipant.tenantId,
          type: 'rent',
          status: 'pending',
          amount: lease.rentAmount,
          dueDate,
          periodStart: monthStart,
          periodEnd: monthEnd,
        },
      });

      result.created++;
    } catch (err) {
      console.error(`[RentGen] Failed to create rent payment for lease ${lease.id}:`, err);
      result.failed++;
    }
  }

  if (result.created > 0) {
    console.log(`[RentGen] Created ${result.created} rent payment(s) (skipped: ${result.skipped}, failed: ${result.failed})`);
  }

  return result;
}

export function startRentGenerationJob() {
  const runSafely = async () => {
    try {
      await generateRentPayments();
    } catch (err) {
      console.error('[RentGen] Rent generation job run failed:', err);
    }
  };

  void runSafely();
  setInterval(() => {
    void runSafely();
  }, INTERVAL_MS);
  console.log('[RentGen] Rent generation job started (interval: 24h)');
}
