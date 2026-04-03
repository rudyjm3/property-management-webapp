/**
 * One-time script: removes any existing units from "The Meadows" and bulk-inserts
 * all 128 units from the final_grouped_addresses_v3 CSV.
 *
 * Run with: npm run seed:meadows
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// All 128 units from the CSV (unit number is the Apt number, unique across
// the whole property since each building uses a different number range).
// ---------------------------------------------------------------------------
const UNITS_DATA: { unitNumber: string; address: string; city: string; state: string; zip: string }[] = [
  // 1293 Old Newport Hwy — units 1201–1208
  { unitNumber: '1201', address: '1293 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1202', address: '1293 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1203', address: '1293 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1204', address: '1293 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1205', address: '1293 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1206', address: '1293 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1207', address: '1293 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1208', address: '1293 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1297 Old Newport Hwy — units 901–908
  { unitNumber: '901', address: '1297 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '902', address: '1297 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '903', address: '1297 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '904', address: '1297 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '905', address: '1297 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '906', address: '1297 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '907', address: '1297 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '908', address: '1297 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1301 Old Newport Hwy — units 101–108
  { unitNumber: '101', address: '1301 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '102', address: '1301 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '103', address: '1301 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '104', address: '1301 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '105', address: '1301 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '106', address: '1301 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '107', address: '1301 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '108', address: '1301 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1305 Old Newport Hwy — units 201–208
  { unitNumber: '201', address: '1305 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '202', address: '1305 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '203', address: '1305 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '204', address: '1305 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '205', address: '1305 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '206', address: '1305 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '207', address: '1305 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '208', address: '1305 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1309 Old Newport Hwy — units 301–308
  { unitNumber: '301', address: '1309 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '302', address: '1309 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '303', address: '1309 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '304', address: '1309 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '305', address: '1309 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '306', address: '1309 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '307', address: '1309 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '308', address: '1309 Old Newport Hwy', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1292 Walter Webb Dr — units 1501–1508
  { unitNumber: '1501', address: '1292 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1502', address: '1292 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1503', address: '1292 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1504', address: '1292 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1505', address: '1292 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1506', address: '1292 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1507', address: '1292 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1508', address: '1292 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1294 Walter Webb Dr — units 1301–1308
  { unitNumber: '1301', address: '1294 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1302', address: '1294 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1303', address: '1294 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1304', address: '1294 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1305', address: '1294 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1306', address: '1294 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1307', address: '1294 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1308', address: '1294 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1295 Walter Webb Dr — units 1401–1408
  { unitNumber: '1401', address: '1295 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1402', address: '1295 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1403', address: '1295 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1404', address: '1295 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1405', address: '1295 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1406', address: '1295 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1407', address: '1295 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1408', address: '1295 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1298 Walter Webb Dr — units 1001–1008
  { unitNumber: '1001', address: '1298 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1002', address: '1298 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1003', address: '1298 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1004', address: '1298 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1005', address: '1298 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1006', address: '1298 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1007', address: '1298 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1008', address: '1298 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1299 Walter Webb Dr — units 1101–1108
  { unitNumber: '1101', address: '1299 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1102', address: '1299 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1103', address: '1299 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1104', address: '1299 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1105', address: '1299 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1106', address: '1299 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1107', address: '1299 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1108', address: '1299 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1302 Walter Webb Dr — units 401–408
  { unitNumber: '401', address: '1302 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '402', address: '1302 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '403', address: '1302 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '404', address: '1302 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '405', address: '1302 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '406', address: '1302 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '407', address: '1302 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '408', address: '1302 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1303 Walter Webb Dr — units 701–708
  { unitNumber: '701', address: '1303 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '702', address: '1303 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '703', address: '1303 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '704', address: '1303 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '705', address: '1303 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '706', address: '1303 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '707', address: '1303 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '708', address: '1303 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1306 Walter Webb Dr — units 501–508
  { unitNumber: '501', address: '1306 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '502', address: '1306 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '503', address: '1306 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '504', address: '1306 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '505', address: '1306 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '506', address: '1306 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '507', address: '1306 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '508', address: '1306 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1307 Walter Webb Dr — units 801–808
  { unitNumber: '801', address: '1307 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '802', address: '1307 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '803', address: '1307 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '804', address: '1307 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '805', address: '1307 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '806', address: '1307 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '807', address: '1307 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '808', address: '1307 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1309 Walter Webb Dr — units 1601–1608
  { unitNumber: '1601', address: '1309 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1602', address: '1309 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1603', address: '1309 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1604', address: '1309 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1605', address: '1309 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1606', address: '1309 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1607', address: '1309 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '1608', address: '1309 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },

  // 1310 Walter Webb Dr — units 601–608
  { unitNumber: '601', address: '1310 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '602', address: '1310 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '603', address: '1310 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '604', address: '1310 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '605', address: '1310 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '606', address: '1310 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '607', address: '1310 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
  { unitNumber: '608', address: '1310 Walter Webb Dr', city: 'Sevierville', state: 'TN', zip: '37862' },
];

/** Returns floor 1 for unit numbers ending in 1–4, floor 2 for 5–8. */
function getFloor(unitNumber: string): number {
  const lastDigit = parseInt(unitNumber.slice(-1), 10);
  return lastDigit <= 4 ? 1 : 2;
}

async function main() {
  // ── Find the property ──────────────────────────────────────────────────────
  const property = await prisma.property.findFirstOrThrow({
    where: { address: '1291 Walter Webb Dr' },
  });
  console.log(`Found property: "${property.name}" (${property.id})`);

  // ── Phase 1: Delete all existing units and their dependent data ───────────
  const existingUnits = await prisma.unit.findMany({
    where: { propertyId: property.id },
    include: {
      leases: {
        include: {
          payments: true,
          participants: true,
          renewals: true,
        },
      },
    },
  });

  if (existingUnits.length > 0) {
    console.log(`Removing ${existingUnits.length} existing unit(s)...`);

    for (const unit of existingUnits) {
      for (const lease of unit.leases) {
        // Clear self-referential renewal pointers on any child leases
        if (lease.renewals.length > 0) {
          await prisma.lease.updateMany({
            where: { renewalOfLeaseId: lease.id },
            data: { renewalOfLeaseId: null },
          });
        }

        // Delete ledger entries tied to this lease's payments
        const paymentIds = lease.payments.map((p) => p.id);
        if (paymentIds.length > 0) {
          await prisma.ledgerEntry.deleteMany({ where: { paymentId: { in: paymentIds } } });
        }

        await prisma.payment.deleteMany({ where: { leaseId: lease.id } });
        await prisma.leaseParticipant.deleteMany({ where: { leaseId: lease.id } });
        await prisma.lease.delete({ where: { id: lease.id } });
      }

      await prisma.workOrder.deleteMany({ where: { unitId: unit.id } });
      // Nullify optional message references rather than deleting messages
      await prisma.message.updateMany({ where: { unitId: unit.id }, data: { unitId: null } });
      await prisma.unit.delete({ where: { id: unit.id } });
      console.log(`  Deleted unit ${unit.unitNumber}`);
    }

    await prisma.property.update({
      where: { id: property.id },
      data: { unitCount: 0 },
    });
    console.log('Existing units removed.');
  } else {
    console.log('No existing units found — skipping deletion phase.');
  }

  // ── Phase 2: Bulk-insert all 128 units ────────────────────────────────────
  console.log(`Inserting ${UNITS_DATA.length} units...`);

  const result = await prisma.unit.createMany({
    data: UNITS_DATA.map((u) => ({
      propertyId:    property.id,
      unitNumber:    u.unitNumber,
      floor:         getFloor(u.unitNumber),
      type:          'two_bed',
      bedrooms:      2,
      bathrooms:     1,
      sqFt:          850,
      marketRent:    1250,
      rentAmount:    1050,
      depositAmount: 800,
      status:        'vacant',
      parkingSpaces: [],
      address:       u.address,
      city:          u.city,
      state:         u.state,
      zip:           u.zip,
    })),
    skipDuplicates: true,
  });

  await prisma.property.update({
    where: { id: property.id },
    data: { unitCount: result.count },
  });

  console.log(`Done! ${result.count} units created for "${property.name}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
