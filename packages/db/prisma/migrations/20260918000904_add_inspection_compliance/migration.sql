-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('move_in', 'move_out', 'scheduled', 'annual', 'semi_annual');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "InspectionMediaType" AS ENUM ('photo', 'video');

-- DropForeignKey
ALTER TABLE "vacancy_history" DROP CONSTRAINT "vacancy_history_property_id_fkey";

-- DropForeignKey
ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_unit_id_fkey";

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "voided_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "security_deposit_dispositions" ADD COLUMN     "move_in_inspection_id" TEXT,
ADD COLUMN     "move_out_inspection_id" TEXT;

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "invite_code_expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "stripe_customer_id" SET DATA TYPE TEXT,
ALTER COLUMN "stripe_default_payment_method_id" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "inspection_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "checklist_items" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "lease_id" TEXT,
    "type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'scheduled',
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "inspector_user_id" TEXT,
    "template_id" TEXT,
    "checklist_results" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "tenant_signature_name" VARCHAR(200),
    "tenant_signature_at" TIMESTAMP(3),
    "tenant_signature_ip" VARCHAR(45),
    "manager_signature_name" VARCHAR(200),
    "manager_signature_at" TIMESTAMP(3),
    "manager_signature_ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_media" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "media_type" "InspectionMediaType" NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspection_templates_organization_id_idx" ON "inspection_templates"("organization_id");

-- CreateIndex
CREATE INDEX "inspections_organization_id_idx" ON "inspections"("organization_id");

-- CreateIndex
CREATE INDEX "inspections_unit_id_idx" ON "inspections"("unit_id");

-- CreateIndex
CREATE INDEX "inspections_lease_id_idx" ON "inspections"("lease_id");

-- CreateIndex
CREATE INDEX "inspections_status_idx" ON "inspections"("status");

-- CreateIndex
CREATE INDEX "inspection_media_inspection_id_idx" ON "inspection_media"("inspection_id");

-- CreateIndex
CREATE INDEX "security_deposit_dispositions_move_in_inspection_id_idx" ON "security_deposit_dispositions"("move_in_inspection_id");

-- CreateIndex
CREATE INDEX "security_deposit_dispositions_move_out_inspection_id_idx" ON "security_deposit_dispositions"("move_out_inspection_id");

-- AddForeignKey
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_user_id_fkey" FOREIGN KEY ("inspector_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "inspection_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_dispositions" ADD CONSTRAINT "security_deposit_dispositions_move_in_inspection_id_fkey" FOREIGN KEY ("move_in_inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_dispositions" ADD CONSTRAINT "security_deposit_dispositions_move_out_inspection_id_fkey" FOREIGN KEY ("move_out_inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancy_history" ADD CONSTRAINT "vacancy_history_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
