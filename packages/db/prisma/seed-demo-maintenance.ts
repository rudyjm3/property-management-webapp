/**
 * Creates a Supabase auth account for the seeded demo maintenance user (John Smith)
 * and links it to the existing DB User record so you can log in to the web app.
 *
 * Usage (from project root):
 *   npm run seed:demo-maintenance --workspace=@propflow/db
 *
 * Credentials created:
 *   Email:    rudyjm3@yahoo.com
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

const MAINTENANCE_EMAIL = 'rudyjm3@yahoo.com';
const MAINTENANCE_PASSWORD = 'PropFlow123!';

async function main() {
  console.log(`Setting up demo maintenance user: ${MAINTENANCE_EMAIL}`);

  const user = await prisma.user.findFirst({
    where: { email: MAINTENANCE_EMAIL },
    select: { id: true, email: true, name: true, supabaseUserId: true, organizationId: true },
  });

  if (!user) {
    console.error('Maintenance user not found in DB. Run the main seed first:');
    console.error('  npm run db:seed');
    process.exit(1);
  }

  // Remove existing Supabase auth user if present (idempotent re-runs)
  if (user.supabaseUserId) {
    console.log('Removing existing Supabase auth user...');
    await supabaseAdmin.auth.admin.deleteUser(user.supabaseUserId);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: MAINTENANCE_EMAIL,
    password: MAINTENANCE_PASSWORD,
    email_confirm: true,
    user_metadata: { name: user.name, organizationId: user.organizationId },
  });

  if (error || !data.user) {
    console.error('Failed to create Supabase user:', error?.message);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { supabaseUserId: data.user.id },
  });

  console.log('');
  console.log('Done! Web app login credentials:');
  console.log(`  Email:    ${MAINTENANCE_EMAIL}`);
  console.log(`  Password: ${MAINTENANCE_PASSWORD}`);
  console.log('  Role:     maintenance (John Smith)');
  console.log('');
  console.log('Note: maintenance users cannot access /settings — they will be redirected to /dashboard.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
