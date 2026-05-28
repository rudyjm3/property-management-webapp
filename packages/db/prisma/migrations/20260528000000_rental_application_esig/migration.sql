-- CreateEnum
CREATE TYPE "RentalApplicationStatus" AS ENUM ('pending', 'under_review', 'approved', 'denied', 'withdrawn');

-- AlterTable: add e-signature signing fields to leases
ALTER TABLE "leases"
  ADD COLUMN "signing_token" VARCHAR(36) UNIQUE,
  ADD COLUMN "tenant_signature_name" VARCHAR(200),
  ADD COLUMN "manager_signature_name" VARCHAR(200),
  ADD COLUMN "tenant_signature_ip" VARCHAR(45),
  ADD COLUMN "manager_signature_ip" VARCHAR(45);

-- CreateTable: rental_applications
CREATE TABLE "rental_applications" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "unit_id" TEXT NOT NULL,
  "token" VARCHAR(36) NOT NULL,
  "status" "RentalApplicationStatus" NOT NULL DEFAULT 'pending',
  "applicant_name" VARCHAR(200) NOT NULL,
  "applicant_email" VARCHAR(320) NOT NULL,
  "applicant_phone" VARCHAR(20),
  "date_of_birth" DATE,
  "current_address" VARCHAR(500),
  "previous_address" VARCHAR(500),
  "employer_name" VARCHAR(200),
  "employer_phone" VARCHAR(20),
  "monthly_gross_income" DECIMAL(10,2),
  "income_source" "IncomeSource",
  "occupant_count" INTEGER NOT NULL DEFAULT 1,
  "pets" JSONB,
  "vehicles" JSONB,
  "emergency_contact_name" VARCHAR(200),
  "emergency_contact_phone" VARCHAR(20),
  "consent_given" BOOLEAN NOT NULL DEFAULT false,
  "consent_ip" VARCHAR(45),
  "consent_at" TIMESTAMP(3),
  "review_notes" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by_user_id" TEXT,
  "created_tenant_id" TEXT,
  "submitted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rental_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_applications_token_key" ON "rental_applications"("token");

-- CreateIndex
CREATE INDEX "rental_applications_organization_id_idx" ON "rental_applications"("organization_id");

-- CreateIndex
CREATE INDEX "rental_applications_unit_id_idx" ON "rental_applications"("unit_id");

-- CreateIndex
CREATE INDEX "rental_applications_token_idx" ON "rental_applications"("token");

-- AddForeignKey
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
