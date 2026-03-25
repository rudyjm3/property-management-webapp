import { prisma } from '@propflow/db';

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface LateFeeJobResult {
  processed: number;
  applied: number;
  skipped: number;
  failed: number;
}

export async function applyLateFees(organizationId?: string): Promise<LateFeeJobResult> {
  const result: LateFeeJobResult = { processed: 0, applied: 0, skipped: 0, failed: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      status: 'pending',
      type: 'rent',
      lateFeeApplied: false,
      dueDate: { lt: today },
      ...(organizationId
        ? { lease: { unit: { property: { organizationId } } } }
        : {}),
    },
    include: {
      tenant: { select: { id: true, name: true, email: true } },
      lease: {
        select: {
          id: true,
          lateFeeAmount: true,
          lateFeeGraceDays: true,
          unit: {
            select: {
              property: {
                select: {
                  organization: {
                    select: { id: true, lateFeeAmount: true, gracePeriodDays: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  result.processed = payments.length;

  for (const payment of payments) {
    try {
      const graceDays = payment.lease.lateFeeGraceDays ?? payment.lease.unit.property.organization.gracePeriodDays ?? 5;
      const graceCutoff = new Date(payment.dueDate);
      graceCutoff.setDate(graceCutoff.getDate() + graceDays);

      if (today <= graceCutoff) {
        result.skipped++;
        continue;
      }

      const feeAmount =
        Number(payment.lease.lateFeeAmount) > 0
          ? payment.lease.lateFeeAmount
          : payment.lease.unit.property.organization.lateFeeAmount;

      if (!feeAmount || Number(feeAmount) === 0) {
        result.skipped++;
        continue;
      }

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: { isLate: true, lateFeeApplied: true },
        }),
        prisma.payment.create({
          data: {
            leaseId: payment.leaseId,
            tenantId: payment.tenantId,
            type: 'late_fee',
            status: 'pending',
            amount: feeAmount,
            dueDate: today,
          },
        }),
      ]);

      result.applied++;
    } catch (err) {
      console.error(`[LateFee] Failed to apply late fee for payment ${payment.id}:`, err);
      result.failed++;
    }
  }

  if (result.applied > 0) {
    console.log(`[LateFee] Applied ${result.applied} late fee(s) (skipped: ${result.skipped}, failed: ${result.failed})`);
  }

  return result;
}

export function startLateFeeJob() {
  applyLateFees();
  setInterval(applyLateFees, INTERVAL_MS);
  console.log('[LateFee] Late fee job started (interval: 24h)');
}
