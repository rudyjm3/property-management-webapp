/**
 * Syncs a PropFlow DB user record with their Supabase auth account.
 * Use this when a user can log in to Supabase but gets redirected to /onboarding
 * because the supabaseUserId in the DB doesn't match their actual Supabase UUID.
 *
 * Usage (from project root):
 *   npx tsx packages/db/prisma/sync-user-auth.ts rudyjm3@gmail.com
 *
 * What it does:
 *   1. Looks up the Supabase auth user by email
 *   2. Updates the PropFlow DB user record's supabaseUserId to match
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

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx packages/db/prisma/sync-user-auth.ts <email>');
    process.exit(1);
  }

  console.log(`\nSyncing auth for: ${email}`);

  // 1. Find the PropFlow DB user
  const dbUser = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, name: true, supabaseUserId: true, organizationId: true },
  });

  if (!dbUser) {
    console.error(`No PropFlow DB user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`  DB user found: ${dbUser.id}`);
  console.log(`  Current supabaseUserId: ${dbUser.supabaseUserId ?? '(none)'}`);

  // 2. List Supabase auth users and find by email
  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error('Failed to list Supabase users:', error.message);
    process.exit(1);
  }

  const supabaseUser = users.find((u) => u.email === email);

  if (!supabaseUser) {
    console.error(`No Supabase auth user found with email: ${email}`);
    console.error('The user needs to sign up first at http://localhost:3000/signup');
    process.exit(1);
  }

  console.log(`  Supabase auth user found: ${supabaseUser.id}`);

  if (dbUser.supabaseUserId === supabaseUser.id) {
    console.log('\n✓ Already in sync — IDs match. No update needed.');
    console.log('  The 401 may be caused by something else (check API logs for details).');
    process.exit(0);
  }

  // 3. Update the DB record to match
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { supabaseUserId: supabaseUser.id },
  });

  console.log(`\n✓ Updated supabaseUserId:`);
  console.log(`    Old: ${dbUser.supabaseUserId ?? '(none)'}`);
  console.log(`    New: ${supabaseUser.id}`);
  console.log(`\nYou can now log in at http://localhost:3000/login with ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
