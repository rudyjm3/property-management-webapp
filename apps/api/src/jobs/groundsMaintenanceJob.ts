import { prisma } from '@propflow/db';
import { MODULE_KEYS } from '@propflow/shared';
import { generateWorkOrderForSchedule } from '../services/maintenance-schedule.service';

// Grounds & Property Maintenance (Module 3) recurrence job — generates real
// WorkOrder records from active MaintenanceSchedules on their due date, the
// same pattern rentGenerationJob.ts uses to generate monthly Payment records
// from active leases. Runs daily; a schedule whose nextDueDate has passed
// (even by more than one cadence period, e.g. after downtime) generates
// exactly one WorkOrder per run and steps forward by one cadence — it does
// not backfill multiple missed occurrences.

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface GroundsMaintenanceJobResult {
  processed: number;
  created: number;
  failed: number;
}

export async function generateGroundsMaintenanceWorkOrders(
  organizationId?: string
): Promise<GroundsMaintenanceJobResult> {
  const result: GroundsMaintenanceJobResult = { processed: 0, created: 0, failed: 0 };

  const now = new Date();

  const dueSchedules = await prisma.maintenanceSchedule.findMany({
    where: {
      active: true,
      nextDueDate: { lte: now },
      ...(organizationId ? { organizationId } : {}),
      // Only generate for orgs that still have the module active — an org
      // that disabled grounds_maintenance keeps its existing schedules but
      // stops accruing new work orders from them.
      organization: { activeModules: { has: MODULE_KEYS.GROUNDS_MAINTENANCE } },
    },
  });

  result.processed = dueSchedules.length;

  for (const schedule of dueSchedules) {
    try {
      // null means a concurrent job run/process already claimed this
      // occurrence (see the optimistic-concurrency guard in
      // maintenance-schedule.service.ts) — not a failure, just nothing left
      // to do here.
      const workOrder = await generateWorkOrderForSchedule(schedule);
      if (workOrder) result.created++;
    } catch (err) {
      console.error(`[GroundsMaintenance] Failed to generate work order for schedule ${schedule.id}:`, err);
      result.failed++;
    }
  }

  if (result.created > 0) {
    console.log(
      `[GroundsMaintenance] Generated ${result.created} work order(s) (failed: ${result.failed})`
    );
  }

  return result;
}

export function startGroundsMaintenanceJob() {
  const runSafely = async () => {
    try {
      await generateGroundsMaintenanceWorkOrders();
    } catch (err) {
      console.error('[GroundsMaintenance] Recurrence job run failed:', err);
    }
  };

  void runSafely();
  setInterval(() => {
    void runSafely();
  }, INTERVAL_MS);
  console.log('[GroundsMaintenance] Recurrence job started (interval: 24h)');
}
