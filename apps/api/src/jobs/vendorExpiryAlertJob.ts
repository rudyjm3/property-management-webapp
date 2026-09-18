import { prisma, VendorStatus } from '@propflow/db';
import { MODULE_KEYS, VENDOR_EXPIRY_ALERT_LOOKAHEAD_DAYS } from '@propflow/shared';

// Vendor & Contractor Management (Module 5) — license/insurance expiry
// alerting, mirroring rentGenerationJob.ts's daily-scan pattern. Unlike
// rentGenerationJob (which creates Payment rows) or the SLA breach job
// (which sets a persisted boolean flag), there is nothing new to persist
// here: "expiring" is fully derived from Vendor.licenseExpiresAt/
// insuranceExpiresAt, which already exist. This job's role is scheduled
// server-side visibility (a daily log line per org, the same style as the
// other jobs' summary logs) as a hook for a future outbound notification —
// it does NOT write anything back to the database. The manager dashboard
// widget and the GET .../vendors/expiry-alerts endpoint both compute the
// same alert set live on read (see vendor.service.ts's
// getVendorExpiryAlerts) rather than reading anything this job writes.

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface VendorExpiryAlertJobResult {
  orgsScanned: number;
  vendorsFlagged: number;
}

export async function scanVendorExpiryAlerts(): Promise<VendorExpiryAlertJobResult> {
  const result: VendorExpiryAlertJobResult = { orgsScanned: 0, vendorsFlagged: 0 };

  const now = new Date();
  const lookaheadDate = new Date(now.getTime() + VENDOR_EXPIRY_ALERT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    where: { activeModules: { has: MODULE_KEYS.VENDOR_MANAGEMENT } },
    select: { id: true, name: true },
  });

  result.orgsScanned = orgs.length;

  for (const org of orgs) {
    try {
      const flagged = await prisma.vendor.count({
        where: {
          organizationId: org.id,
          status: VendorStatus.active,
          OR: [{ licenseExpiresAt: { lte: lookaheadDate } }, { insuranceExpiresAt: { lte: lookaheadDate } }],
        },
      });

      if (flagged > 0) {
        result.vendorsFlagged += flagged;
        console.log(`[VendorExpiry] ${org.name} (${org.id}): ${flagged} vendor(s) with expiring/expired license or insurance`);
      }
    } catch (err) {
      console.error(`[VendorExpiry] Failed to scan org ${org.id}:`, err);
    }
  }

  return result;
}

export function startVendorExpiryAlertJob() {
  const runSafely = async () => {
    try {
      await scanVendorExpiryAlerts();
    } catch (err) {
      console.error('[VendorExpiry] Alert scan job run failed:', err);
    }
  };

  void runSafely();
  setInterval(() => {
    void runSafely();
  }, INTERVAL_MS);
  console.log('[VendorExpiry] License/insurance expiry alert job started (interval: 24h)');
}
