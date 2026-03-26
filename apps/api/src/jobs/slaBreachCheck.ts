import { prisma, WorkOrderStatus } from '@propflow/db';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const TERMINAL_STATUSES: WorkOrderStatus[] = ['completed', 'closed', 'cancelled'];

async function checkSlaBreaches() {
  try {
    const result = await prisma.workOrder.updateMany({
      where: {
        slaBreached: false,
        slaDeadlineAt: { lt: new Date() },
        status: { notIn: TERMINAL_STATUSES },
      },
      data: { slaBreached: true },
    });

    if (result.count > 0) {
      console.log(`[SLA] Marked ${result.count} work order(s) as SLA breached`);
    }
  } catch (err) {
    console.error('[SLA] Breach check failed:', err);
  }
}

export function startSlaBreachJob() {
  // Run once immediately on startup, then every 5 minutes
  checkSlaBreaches();
  setInterval(checkSlaBreaches, INTERVAL_MS);
  console.log('[SLA] Breach detection job started (interval: 5 min)');
}
