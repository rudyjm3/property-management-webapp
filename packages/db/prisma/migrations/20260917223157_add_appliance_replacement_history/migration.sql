-- CreateEnum
CREATE TYPE "ApplianceStatus" AS ENUM ('active', 'removed');

-- AlterTable
ALTER TABLE "appliances" ADD COLUMN     "removed_at" DATE,
ADD COLUMN     "replaces_appliance_id" TEXT,
ADD COLUMN     "status" "ApplianceStatus" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE UNIQUE INDEX "appliances_replaces_appliance_id_key" ON "appliances"("replaces_appliance_id");

-- CreateIndex
CREATE INDEX "appliances_unit_id_status_idx" ON "appliances"("unit_id", "status");

-- AddForeignKey
ALTER TABLE "appliances" ADD CONSTRAINT "appliances_replaces_appliance_id_fkey" FOREIGN KEY ("replaces_appliance_id") REFERENCES "appliances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
