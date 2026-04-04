/**
 * Creates a Supabase auth account for the first demo tenant (Jordan Chen)
 * and links it to the existing DB record so you can log in to the mobile app.
 *
 * Usage:
 *   npm run seed:test-tenant --workspace=@propflow/db
 *
 * Credentials created:
 *   Email:    jordan.chen@demo.propflow.com
 *   Password: PropFlow123!
 */

import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const prisma = new PrismaClient();

const TEST_EMAIL = 'jordan.chen@demo.propflow.com';
const TEST_PASSWORD = 'PropFlow123!';

async function main() {
  console.log(`Setting up test tenant: ${TEST_EMAIL}`);

  // Find the tenant DB record
  const tenant = await prisma.tenant.findFirst({
    where: { email: TEST_EMAIL },
  });

  if (!tenant) {
    console.error('Tenant not found in DB. Run the main seed first: npm run db:seed');
    process.exit(1);
  }

  // Delete existing Supabase auth user if one exists (idempotent re-runs).
  // Also handles the case where the DB was reset but the Supabase user survived.
  if (tenant.supabaseUserId) {
    console.log('Removing existing Supabase auth user (by ID)...');
    await supabaseAdmin.auth.admin.deleteUser(tenant.supabaseUserId);
  } else {
    // No supabaseUserId in DB — check Supabase directly by email
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email === TEST_EMAIL);
    if (existing) {
      console.log('Removing orphaned Supabase auth user (by email)...');
      await supabaseAdmin.auth.admin.deleteUser(existing.id);
    }
  }

  // Create a fresh Supabase auth user with a known password
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true, // skip email verification
    user_metadata: { name: tenant.name, tenantId: tenant.id },
  });

  if (error || !data.user) {
    console.error('Failed to create Supabase user:', error?.message);
    process.exit(1);
  }

  // Link the Supabase user ID to the Tenant record
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      supabaseUserId: data.user.id,
      portalStatus: 'active',
    },
  });

  console.log('');
  console.log('Done! Mobile app login credentials:');
  console.log(`  Email:    ${TEST_EMAIL}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
