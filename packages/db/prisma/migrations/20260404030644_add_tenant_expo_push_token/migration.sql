/*
  Warnings:

  - You are about to drop the column `plan` on the `organizations` table. All the data in the column will be lost.
  - You are about to drop the column `ledger_entries` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `cost` on the `work_orders` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "leases" ALTER COLUMN "utilities_included" DROP DEFAULT,
ALTER COLUMN "occupant_names" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "plan";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "ledger_entries";

-- AlterTable
ALTER TABLE "properties" ALTER COLUMN "type" SET DEFAULT 'multifamily',
ALTER COLUMN "amenities" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "expo_push_token" VARCHAR(200);

-- AlterTable
ALTER TABLE "units" ALTER COLUMN "parking_spaces" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vendors" ALTER COLUMN "specialties" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "work_orders" DROP COLUMN "cost",
ALTER COLUMN "priority" SET DEFAULT 'routine',
ALTER COLUMN "photos_before" DROP DEFAULT,
ALTER COLUMN "photos_after" DROP DEFAULT;
