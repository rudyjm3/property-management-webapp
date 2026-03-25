import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Stable IDs — never change these so .env.local never needs updating
const SEED_ORG_ID = 'a1b2c3d4-0000-4000-8000-seed00000001';

async function main() {
  console.log('Seeding database...');

  // Clear existing seed data in dependency order
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

  // Create demo organization
  const org = await prisma.organization.create({
    data: {
      id: SEED_ORG_ID,
      name: 'Sunset Property Management',
      slug: 'sunset-pm',
      email: 'manager@sunset-pm.com',
      phone: '512-555-0100',
      timezone: 'America/Chicago',
      planTier: 'starter',
      subscriptionStatus: 'trialing',
      lateFeeAmount: 50,
      gracePeriodDays: 5,
      rentDueDay: 1,
    },
  });

  // Create demo manager user
  const manager = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'manager@demo.propflow.com',
      name: 'Alex Rivera',
      role: 'owner',
      status: 'active',
    },
  });

  // Create a property
  const property = await prisma.property.create({
    data: {
      organizationId: org.id,
      name: 'Sunset Gardens',
      type: 'multifamily',
      address: '1200 Sunset Blvd',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country: 'US',
      yearBuilt: 2018,
      unitCount: 10,
    },
  });

  // Create 10 units — 8 occupied (with tenants), 2 vacant
  const unitConfigs = [
    { unitNumber: '101', floor: 1, type: 'one_bed',  bedrooms: 1, bathrooms: 1,   sqFt: 650,  rentAmount: 1200, depositAmount: 1200 },
    { unitNumber: '102', floor: 1, type: 'one_bed',  bedrooms: 1, bathrooms: 1,   sqFt: 650,  rentAmount: 1200, depositAmount: 1200 },
    { unitNumber: '103', floor: 1, type: 'one_bed',  bedrooms: 1, bathrooms: 1,   sqFt: 650,  rentAmount: 1200, depositAmount: 1200 },
    { unitNumber: '104', floor: 1, type: 'one_bed',  bedrooms: 1, bathrooms: 1,   sqFt: 650,  rentAmount: 1200, depositAmount: 1200 },
    { unitNumber: '201', floor: 2, type: 'two_bed',  bedrooms: 2, bathrooms: 2,   sqFt: 900,  rentAmount: 1600, depositAmount: 1600 },
    { unitNumber: '202', floor: 2, type: 'two_bed',  bedrooms: 2, bathrooms: 2,   sqFt: 900,  rentAmount: 1600, depositAmount: 1600 },
    { unitNumber: '203', floor: 2, type: 'two_bed',  bedrooms: 2, bathrooms: 2,   sqFt: 900,  rentAmount: 1600, depositAmount: 1600 },
    { unitNumber: '204', floor: 2, type: 'two_bed',  bedrooms: 2, bathrooms: 2,   sqFt: 900,  rentAmount: 1600, depositAmount: 1600 },
    { unitNumber: '301', floor: 3, type: 'three_bed', bedrooms: 3, bathrooms: 2,  sqFt: 1200, rentAmount: 2100, depositAmount: 2100 },
    { unitNumber: '302', floor: 3, type: 'three_bed', bedrooms: 3, bathrooms: 2,  sqFt: 1200, rentAmount: 2100, depositAmount: 2100 },
  ] as const;

  const units = await Promise.all(
    unitConfigs.map((cfg, i) =>
      prisma.unit.create({
        data: {
          propertyId: property.id,
          unitNumber: cfg.unitNumber,
          floor: cfg.floor,
          type: cfg.type,
          bedrooms: cfg.bedrooms,
          bathrooms: cfg.bathrooms,
          sqFt: cfg.sqFt,
          marketRent: cfg.rentAmount,
          rentAmount: cfg.rentAmount,
          depositAmount: cfg.depositAmount,
          status: i < 8 ? 'occupied' : 'vacant',
        },
      })
    )
  );

  // Demo tenants — one for each occupied unit
  const tenantData = [
    { name: 'Jordan Chen',    email: 'jordan.chen@demo.propflow.com',    phone: '512-555-0101', fullLegalName: 'Jordan Chen',    currentAddress: '1200 Sunset Blvd #101, Austin TX 78701' },
    { name: 'Sam Patel',      email: 'sam.patel@demo.propflow.com',      phone: '512-555-0102', fullLegalName: 'Samantha Patel',  currentAddress: '1200 Sunset Blvd #102, Austin TX 78701' },
    { name: 'Maria Garcia',   email: 'maria.garcia@demo.propflow.com',   phone: '512-555-0103', fullLegalName: 'Maria Garcia',   currentAddress: '1200 Sunset Blvd #103, Austin TX 78701' },
    { name: 'David Kim',      email: 'david.kim@demo.propflow.com',      phone: '512-555-0104', fullLegalName: 'David Kim',      currentAddress: '1200 Sunset Blvd #104, Austin TX 78701' },
    { name: 'Lisa Thompson',  email: 'lisa.thompson@demo.propflow.com',  phone: '512-555-0105', fullLegalName: 'Lisa Thompson',  currentAddress: '1200 Sunset Blvd #201, Austin TX 78701' },
    { name: 'James Wilson',   email: 'james.wilson@demo.propflow.com',   phone: '512-555-0106', fullLegalName: 'James Wilson',   currentAddress: '1200 Sunset Blvd #202, Austin TX 78701' },
    { name: 'Ashley Brown',   email: 'ashley.brown@demo.propflow.com',   phone: '512-555-0107', fullLegalName: 'Ashley Brown',   currentAddress: '1200 Sunset Blvd #203, Austin TX 78701' },
    { name: 'Michael Davis',  email: 'michael.davis@demo.propflow.com',  phone: '512-555-0108', fullLegalName: 'Michael Davis',  currentAddress: '1200 Sunset Blvd #204, Austin TX 78701' },
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

  // Create a lease for each occupied unit (first 8 units)
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
          participants: {
            create: { tenantId: tenant.id, isPrimary: true },
          },
        },
      })
    )
  );

  console.log('Seed complete:');
  console.log(`  Organization: ${org.name} (${org.id})`);
  console.log(`  Manager: ${manager.name}`);
  console.log(`  Property: ${property.name} — ${units.length} units`);
  console.log(`  Tenants: ${tenants.length} tenants created`);
  console.log(`  Leases: ${leases.length} active leases created`);
  console.log('');
  console.log(`  ORG_ID (stable): ${org.id}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
