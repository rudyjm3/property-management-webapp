-- Advanced Payments & Accounting (Module 4): card payments reuse the existing
-- PaymentMethod.card enum value (no schema change needed there). This
-- migration adds: a configurable org-wide management-fee default, partial
-- payment carry-forward linkage on Payment, a SecurityDepositDisposition
-- record, and a Disbursement record tied to OwnerStatement.

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('pending', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "default_management_fee_pct" DECIMAL(5,2) NOT NULL DEFAULT 10.00;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "carried_from_payment_id" TEXT,
ADD COLUMN     "original_amount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "security_deposit_dispositions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lease_id" TEXT NOT NULL,
    "deposit_amount" DECIMAL(10,2) NOT NULL,
    "total_deductions" DECIMAL(10,2) NOT NULL,
    "return_amount" DECIMAL(10,2) NOT NULL,
    "status" "SecurityDepositStatus" NOT NULL,
    "deductions" JSONB NOT NULL,
    "move_in_condition_notes" TEXT,
    "move_out_condition_notes" TEXT,
    "reconciled_by_user_id" TEXT NOT NULL,
    "reconciled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_deposit_dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "owner_statement_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "management_fee_pct" DECIMAL(5,2) NOT NULL,
    "management_fee_amount" DECIMAL(12,2) NOT NULL,
    "net_disbursement_amount" DECIMAL(12,2) NOT NULL,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'pending',
    "reference_note" VARCHAR(500),
    "disbursed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "security_deposit_dispositions_lease_id_key" ON "security_deposit_dispositions"("lease_id");

-- CreateIndex
CREATE INDEX "security_deposit_dispositions_organization_id_idx" ON "security_deposit_dispositions"("organization_id");

-- CreateIndex
CREATE INDEX "disbursements_organization_id_idx" ON "disbursements"("organization_id");

-- CreateIndex
CREATE INDEX "disbursements_owner_statement_id_idx" ON "disbursements"("owner_statement_id");

-- CreateIndex
CREATE INDEX "disbursements_owner_id_idx" ON "disbursements"("owner_id");

-- AddForeignKey
ALTER TABLE "security_deposit_dispositions" ADD CONSTRAINT "security_deposit_dispositions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_dispositions" ADD CONSTRAINT "security_deposit_dispositions_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_carried_from_payment_id_fkey" FOREIGN KEY ("carried_from_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_owner_statement_id_fkey" FOREIGN KEY ("owner_statement_id") REFERENCES "owner_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
