-- Module 1 (Advanced Tenant Onboarding): screening consent capture + full
-- SSN/govt ID capture on RentalApplication, and a ScreeningCheck model to
-- track background/credit check runs. All gated behind
-- `advanced_tenant_onboarding` in Organization.activeModules.
-- ssn_full_encrypted and govt_id_number are ciphertext at rest (application
-- level AES-256-GCM, see apps/api/src/services/encryption.service.ts) —
-- never plaintext, never logged.

-- CreateEnum
CREATE TYPE "ScreeningProvider" AS ENUM ('transunion_smartmove');

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('pending', 'in_progress', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ScreeningDecision" AS ENUM ('recommend', 'caution', 'decline');

-- AlterTable: rental_applications — screening consent + encrypted identity fields
ALTER TABLE "rental_applications" ADD COLUMN "screening_consent_at" TIMESTAMP(3);
ALTER TABLE "rental_applications" ADD COLUMN "screening_consent_ip" VARCHAR(45);
ALTER TABLE "rental_applications" ADD COLUMN "ssn_full_encrypted" TEXT;
ALTER TABLE "rental_applications" ADD COLUMN "govt_id_type" "GovernmentIdType";
ALTER TABLE "rental_applications" ADD COLUMN "govt_id_number" TEXT;

-- CreateTable: screening_checks
CREATE TABLE "screening_checks" (
    "id"                    TEXT NOT NULL,
    "organization_id"       TEXT NOT NULL,
    "rental_application_id" TEXT NOT NULL,
    "provider"              "ScreeningProvider" NOT NULL DEFAULT 'transunion_smartmove',
    "status"                "ScreeningStatus" NOT NULL DEFAULT 'pending',
    "decision"              "ScreeningDecision",
    "provider_reference_id" TEXT,
    "report_url"            TEXT,
    "error_message"         TEXT,
    "requested_by_user_id"  TEXT NOT NULL,
    "requested_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"          TIMESTAMP(3),
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screening_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "screening_checks_organization_id_idx" ON "screening_checks"("organization_id");
CREATE INDEX "screening_checks_rental_application_id_idx" ON "screening_checks"("rental_application_id");

ALTER TABLE "screening_checks" ADD CONSTRAINT "screening_checks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "screening_checks" ADD CONSTRAINT "screening_checks_rental_application_id_fkey"
    FOREIGN KEY ("rental_application_id") REFERENCES "rental_applications"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
