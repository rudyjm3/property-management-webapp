-- Remove deprecated columns that were removed from schema.prisma in weeks 13-16 refactoring
-- but never had their own migration. Separated from feature migrations to avoid bundling
-- destructive drops with unrelated functionality.

-- AlterTable
ALTER TABLE "leases" ALTER COLUMN "utilities_included" DROP DEFAULT,
ALTER COLUMN "occupant_names" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "plan";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN IF EXISTS "ledger_entries";

-- AlterTable
ALTER TABLE "properties" ALTER COLUMN "type" SET DEFAULT 'multifamily',
ALTER COLUMN "amenities" DROP DEFAULT;

-- AlterTable
ALTER TABLE "units" ALTER COLUMN "parking_spaces" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vendors" ALTER COLUMN "specialties" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "cost",
ALTER COLUMN "priority" SET DEFAULT 'routine',
ALTER COLUMN "photos_before" DROP DEFAULT,
ALTER COLUMN "photos_after" DROP DEFAULT;
