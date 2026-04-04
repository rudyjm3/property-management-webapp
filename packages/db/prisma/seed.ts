import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Stable IDs — matches the real org so Supabase auth links are preserved after reset
const ORG_ID      = '006b3fc1-6cfa-422a-8563-df9fe72623bd';
const PROPERTY_ID = '1b389569-cf78-4017-9903-8523f57b7419';

async function main() {
  console.log('Seeding database...');

  // Clear existing data in dependency order
  await prisma.notification.deleteMany();
  await prisma.document.deleteMany();
  await prisma.message.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.leaseParticipant.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.property.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // ─── Organization ────────────────────────────────────────────────────────────

  const org = await prisma.organization.create({
    data: {
      id: ORG_ID,
      name: 'PropFlow Demo',
      slug: 'propflow-demo-xna67',
      email: 'rudyjm3@gmail.com',
      phone: '(240) 3467896',
      timezone: 'America/New_York',
      planTier: 'starter',
      subscriptionStatus: 'trialing',
      stripeAccountId: 'acct_1TGWXXAh5KW4KUAc',
      stripeAccountStatus: 'active',
      stripeAccountDetailsSubmitted: true,
      lateFeeAmount: 50,
      gracePeriodDays: 5,
      rentDueDay: 1,
    },
  });

  // ─── Staff ───────────────────────────────────────────────────────────────────

  await prisma.user.createMany({
    data: [
      {
        organizationId: org.id,
        supabaseUserId: '8097f094-f9cd-4082-88e7-a30aa7e10041',
        email: 'rudyjm3@gmail.com',
        name: 'Rudolph Mims',
        role: 'owner',
        status: 'active',
      },
      {
        organizationId: org.id,
        supabaseUserId: '5e75753c-6850-4540-98e6-9a2674965269',
        email: 'rudyjm3@yahoo.com',
        name: 'John Smith',
        role: 'maintenance',
        status: 'active',
      },
    ],
  });

  // ─── Property ────────────────────────────────────────────────────────────────

  const property = await prisma.property.create({
    data: {
      id: PROPERTY_ID,
      organizationId: org.id,
      name: 'PropFlow Demo Property',
      type: 'multifamily',
      address: '1291 Walter Webb Dr',
      city: 'Sevierville',
      state: 'TN',
      zip: '37862',
      country: 'US',
      unitCount: 128,
      amenities: [],
    },
  });

  // ─── Units ───────────────────────────────────────────────────────────────────
  //
  // 16 buildings × 8 units = 128 units.
  // Buildings 1–9  → unit numbers  1xx (101–108)
  // Buildings 10–16 → unit numbers 10xx–16xx (1001–1608)
  // Within each building: units xx01–xx04 = floor 1, units xx05–xx08 = floor 2
  //
  const buildings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

  const unitRows = buildings.flatMap((b) =>
    [1, 2, 3, 4, 5, 6, 7, 8].map((u) => ({
      propertyId: property.id,
      unitNumber: `${b}0${u}`,
      floor: u <= 4 ? 1 : 2,
      type: 'two_bed' as const,
      bedrooms: 2,
      bathrooms: 1,
      sqFt: 850,
      marketRent: 1250,
      rentAmount: 1050,
      depositAmount: 800,
      status: 'vacant' as const,
      parkingSpaces: [],
      address: '1298 Walter Webb Dr',
      city: 'Sevierville',
      state: 'TN',
      zip: '37862',
    }))
  );

  await prisma.unit.createMany({ data: unitRows });

  // Fetch units in a stable order so we can assign tenants to the first 8
  const units = await prisma.unit.findMany({
    where: { propertyId: property.id },
    orderBy: { unitNumber: 'asc' },
  });

  // ─── Demo Tenants ─────────────────────────────────────────────────────────────

  const tenantData = [
    { name: 'Jordan Chen',   email: 'jordan.chen@demo.propflow.com',   phone: '512-555-0101', fullLegalName: 'Jordan Chen'   },
    { name: 'Sam Patel',     email: 'sam.patel@demo.propflow.com',     phone: '512-555-0102', fullLegalName: 'Samantha Patel' },
    { name: 'Maria Garcia',  email: 'maria.garcia@demo.propflow.com',  phone: '512-555-0103', fullLegalName: 'Maria Garcia'  },
    { name: 'David Kim',     email: 'david.kim@demo.propflow.com',     phone: '512-555-0104', fullLegalName: 'David Kim'     },
    { name: 'Lisa Thompson', email: 'lisa.thompson@demo.propflow.com', phone: '512-555-0105', fullLegalName: 'Lisa Thompson' },
    { name: 'James Wilson',  email: 'james.wilson@demo.propflow.com',  phone: '512-555-0106', fullLegalName: 'James Wilson'  },
    { name: 'Ashley Brown',  email: 'ashley.brown@demo.propflow.com',  phone: '512-555-0107', fullLegalName: 'Ashley Brown'  },
    { name: 'Michael Davis', email: 'michael.davis@demo.propflow.com', phone: '512-555-0108', fullLegalName: 'Michael Davis' },
  ];

  const tenants = await Promise.all(
    tenantData.map((t) =>
      prisma.tenant.create({
        data: {
          organizationId: org.id,
          ...t,
          portalStatus: 'never_logged_in',
        },
      })
    )
  );

  // ─── Leases (8 tenants → first 8 units) ──────────────────────────────────────

  const leases = await Promise.all(
    tenants.map((tenant, i) =>
      prisma.lease.create({
        data: {
          unitId: units[i].id,
          type: 'fixed_term',
          status: 'active',
          rentAmount: units[i].rentAmount,
          depositAmount: units[i].depositAmount,
          startDate: new Date('2025-09-01'),
          endDate: new Date('2026-08-31'),
          moveInDate: new Date('2025-09-01'),
          noticePeriodDays: 30,
          rentDueDay: 1,
          lateFeeAmount: 50,
          lateFeeGraceDays: 5,
          securityDepositStatus: 'held',
          esignatureStatus: 'completed',
          occupantCount: 1,
          utilitiesIncluded: [],
          occupantNames: [],
          participants: {
            create: { tenantId: tenant.id, isPrimary: true },
          },
        },
      })
    )
  );

  // Mark the 8 occupied units
  await prisma.unit.updateMany({
    where: { id: { in: units.slice(0, 8).map((u) => u.id) } },
    data: { status: 'occupied' },
  });

  console.log('Seed complete:');
  console.log(`  Organization: ${org.name} (${org.id})`);
  console.log(`  Property: ${property.name} — ${units.length} units`);
  console.log(`  Tenants: ${tenants.length} demo tenants`);
  console.log(`  Leases:  ${leases.length} active leases`);
  console.log('');
  console.log('  Login: rudyjm3@gmail.com (Supabase session preserved)');
  console.log('  Mobile test tenant: jordan.chen@demo.propflow.com — run npm run seed:test-tenant');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
