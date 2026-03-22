import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create demo organization
  const org = await prisma.organization.create({
    data: {
      name: 'Sunset Property Management',
      slug: 'sunset-pm',
      plan: 'base',
    },
  });

  // Create demo manager user
  const manager = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'manager@demo.propflow.com',
      name: 'Alex Rivera',
      role: 'owner',
    },
  });

  // Create a property
  const property = await prisma.property.create({
    data: {
      organizationId: org.id,
      name: 'Sunset Gardens',
      address: '1200 Sunset Blvd',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      type: 'apartment',
      yearBuilt: 2018,
      unitCount: 10,
    },
  });

  // Create 10 units — 8 occupied (with tenants), 2 vacant
  const units = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.unit.create({
        data: {
          propertyId: property.id,
          unitNumber: `${Math.floor(i / 5) + 1}0${(i % 5) + 1}`,
          floor: Math.floor(i / 5) + 1,
          bedrooms: i < 4 ? 1 : i < 8 ? 2 : 3,
          bathrooms: i < 4 ? 1 : 2,
          sqFt: i < 4 ? 650 : i < 8 ? 900 : 1200,
          rentAmount: i < 4 ? 1200 : i < 8 ? 1600 : 2100,
          depositAmount: i < 4 ? 1200 : i < 8 ? 1600 : 2100,
          status: i < 8 ? 'occupied' : 'vacant',
        },
      })
    )
  );

  // Demo tenants — one for each occupied unit
  const tenantData = [
    { name: 'Jordan Chen', email: 'jordan.chen@demo.propflow.com', phone: '512-555-0101' },
    { name: 'Sam Patel', email: 'sam.patel@demo.propflow.com', phone: '512-555-0102' },
    { name: 'Maria Garcia', email: 'maria.garcia@demo.propflow.com', phone: '512-555-0103' },
    { name: 'David Kim', email: 'david.kim@demo.propflow.com', phone: '512-555-0104' },
    { name: 'Lisa Thompson', email: 'lisa.thompson@demo.propflow.com', phone: '512-555-0105' },
    { name: 'James Wilson', email: 'james.wilson@demo.propflow.com', phone: '512-555-0106' },
    { name: 'Ashley Brown', email: 'ashley.brown@demo.propflow.com', phone: '512-555-0107' },
    { name: 'Michael Davis', email: 'michael.davis@demo.propflow.com', phone: '512-555-0108' },
  ];

  const tenants = await Promise.all(
    tenantData.map((t) =>
      prisma.tenant.create({
        data: { organizationId: org.id, ...t },
      })
    )
  );

  // Create a lease for each occupied unit (first 8 units)
  const leases = await Promise.all(
    tenants.map((tenant, i) =>
      prisma.lease.create({
        data: {
          unitId: units[i].id,
          rentAmount: units[i].rentAmount,
          depositAmount: units[i].depositAmount,
          startDate: new Date('2025-09-01'),
          endDate: new Date('2026-08-31'),
          status: 'active',
          lateFeeAmount: 50,
          lateFeeGraceDays: 5,
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
