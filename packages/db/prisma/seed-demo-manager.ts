/**
 * Creates a Supabase auth account for the seeded demo manager (Alex Rivera)
 * and links it to the existing DB User record so you can log in to the web app.
 *
 * Usage (from project root):
 *   npm run seed:demo-manager --workspace=@propflow/db
 *
 * Credentials created:
 *   Email:    manager@demo.propflow.com
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

const MANAGER_EMAIL = 'manager@demo.propflow.com';
const MANAGER_PASSWORD = 'PropFlow123!';

async function main() {
  console.log(`Setting up demo manager: ${MANAGER_EMAIL}`);

  const manager = await prisma.user.findFirst({
    where: { email: MANAGER_EMAIL },
    select: { id: true, email: true, name: true, supabaseUserId: true, organizationId: true },
  });

  if (!manager) {
    console.error('Manager not found in DB. Run the main seed first:');
    console.error('  npm run db:seed');
    process.exit(1);
  }

  // Remove existing Supabase auth user if present (idempotent re-runs)
  if (manager.supabaseUserId) {
    console.log('Removing existing Supabase auth user...');
    await supabaseAdmin.auth.admin.deleteUser(manager.supabaseUserId);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: MANAGER_EMAIL,
    password: MANAGER_PASSWORD,
    email_confirm: true,
    user_metadata: { name: manager.name, organizationId: manager.organizationId },
  });

  if (error || !data.user) {
    console.error('Failed to create Supabase user:', error?.message);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: manager.id },
    data: { supabaseUserId: data.user.id },
  });

  console.log('');
  console.log('Done! Web app login credentials:');
  console.log(`  Email:    ${MANAGER_EMAIL}`);
  console.log(`  Password: ${MANAGER_PASSWORD}`);
  console.log('');
  console.log('After logging in you will see all 8 seeded demo tenants.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
