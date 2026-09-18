-- CreateEnum
CREATE TYPE "MaintenanceCadence" AS ENUM ('weekly', 'monthly', 'quarterly', 'semi_annual', 'annual');

-- AlterEnum
ALTER TYPE "InspectionType" ADD VALUE 'grounds';

-- DropForeignKey
ALTER TABLE "inspections" DROP CONSTRAINT "inspections_unit_id_fkey";

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "property_id" TEXT,
ALTER COLUMN "unit_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "schedule_id" TEXT;

-- CreateTable
CREATE TABLE "maintenance_schedules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "category" "WorkOrderCategory" NOT NULL DEFAULT 'grounds',
    "location_type" "WorkOrderLocationType",
    "description" TEXT,
    "cadence" "MaintenanceCadence" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "next_due_date" DATE NOT NULL,
    "last_generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_schedules_organization_id_idx" ON "maintenance_schedules"("organization_id");

-- CreateIndex
CREATE INDEX "maintenance_schedules_property_id_idx" ON "maintenance_schedules"("property_id");

-- CreateIndex
CREATE INDEX "maintenance_schedules_next_due_date_idx" ON "maintenance_schedules"("next_due_date");

-- CreateIndex
CREATE INDEX "inspections_property_id_idx" ON "inspections"("property_id");

-- CreateIndex
CREATE INDEX "work_orders_schedule_id_idx" ON "work_orders"("schedule_id");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "maintenance_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
