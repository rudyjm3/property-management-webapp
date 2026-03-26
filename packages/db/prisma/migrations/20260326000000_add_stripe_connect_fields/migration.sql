-- CreateEnum
CREATE TYPE "ConnectAccountStatus" AS ENUM ('not_connected', 'pending', 'active', 'restricted');

-- AlterTable
ALTER TABLE "organizations"
  ADD COLUMN "stripe_account_id" TEXT,
  ADD COLUMN "stripe_account_status" "ConnectAccountStatus" NOT NULL DEFAULT 'not_connected',
  ADD COLUMN "stripe_account_details_submitted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripe_account_id_key" ON "organizations"("stripe_account_id");
