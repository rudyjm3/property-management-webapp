/**
 * Force-resets a tenant's Supabase auth password using the admin API.
 * Bypasses the "password must be different" restriction that affects the
 * normal reset flow.
 *
 * Usage (from project root):
 *   npx tsx packages/db/prisma/reset-tenant-password.ts rudyjm3@msn.com NewPassword123!
 *
 * After running, the tenant can log in to the mobile app with the new password.
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
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: npx tsx packages/db/prisma/reset-tenant-password.ts <email> <newPassword>');
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  console.log(`\nResetting password for tenant: ${email}`);

  // 1. Look up tenant in DB
  const tenant = await prisma.tenant.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, name: true, email: true, supabaseUserId: true },
  });

  if (!tenant) {
    console.error(`No tenant found with email: ${email}`);
    process.exit(1);
  }

  if (!tenant.supabaseUserId) {
    console.error(`Tenant exists in DB but has no Supabase auth account.`);
    console.error(`Use "Invite to Portal" in the web app to create one first.`);
    process.exit(1);
  }

  console.log(`  Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`  Supabase user ID: ${tenant.supabaseUserId}`);

  // 2. Update password via admin API (bypasses same-password restriction)
  const { error } = await supabaseAdmin.auth.admin.updateUserById(tenant.supabaseUserId, {
    password: newPassword,
  });

  if (error) {
    console.error(`Failed to reset password: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n✓ Password reset successfully for ${tenant.name}`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${newPassword}`);
  console.log(`\nThe tenant can now log in to the mobile app with these credentials.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
