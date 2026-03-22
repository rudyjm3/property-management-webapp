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

  // Create 10 units
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

  // Create two demo tenants
  const tenant1 = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      email: 'tenant1@demo.propflow.com',
      name: 'Jordan Chen',
      phone: '512-555-0101',
    },
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      email: 'tenant2@demo.propflow.com',
      name: 'Sam Patel',
      phone: '512-555-0102',
    },
  });

  // Create leases for the two tenants
  const lease1 = await prisma.lease.create({
    data: {
      unitId: units[0].id,
      rentAmount: 1200,
      depositAmount: 1200,
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-08-31'),
      status: 'active',
      lateFeeAmount: 50,
      lateFeeGraceDays: 5,
      participants: {
        create: { tenantId: tenant1.id, isPrimary: true },
      },
    },
  });

  const lease2 = await prisma.lease.create({
    data: {
      unitId: units[4].id,
      rentAmount: 1600,
      depositAmount: 1600,
      startDate: new Date('2025-06-01'),
      endDate: new Date('2026-05-31'),
      status: 'active',
      lateFeeAmount: 75,
      lateFeeGraceDays: 5,
      participants: {
        create: { tenantId: tenant2.id, isPrimary: true },
      },
    },
  });

  console.log('Seed complete:');
  console.log(`  Organization: ${org.name} (${org.id})`);
  console.log(`  Manager: ${manager.name}`);
  console.log(`  Property: ${property.name} — ${units.length} units`);
  console.log(`  Tenants: ${tenant1.name}, ${tenant2.name}`);
  console.log(`  Leases: ${lease1.id}, ${lease2.id}`);
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
