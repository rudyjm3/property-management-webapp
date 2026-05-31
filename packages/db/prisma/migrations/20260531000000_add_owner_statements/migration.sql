-- Module 9: Owner Portal — Financial Reporting & Owner Statements
-- Adds Owner, PropertyOwner, and OwnerStatement models.

-- CreateEnum
CREATE TYPE "OwnerStatementStatus" AS ENUM ('draft', 'sent');

-- CreateTable: owners
CREATE TABLE "owners" (
    "id"              TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name"            VARCHAR(200) NOT NULL,
    "email"           VARCHAR(320) NOT NULL,
    "phone"           VARCHAR(20),
    "address"         VARCHAR(500),
    "tax_id"          VARCHAR(20),
    "notes"           TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable: property_owners
CREATE TABLE "property_owners" (
    "id"            TEXT NOT NULL,
    "property_id"   TEXT NOT NULL,
    "owner_id"      TEXT NOT NULL,
    "ownership_pct" DECIMAL(5,2) NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable: owner_statements
CREATE TABLE "owner_statements" (
    "id"                   TEXT NOT NULL,
    "organization_id"      TEXT NOT NULL,
    "property_id"          TEXT NOT NULL,
    "owner_id"             TEXT NOT NULL,
    "period_start"         DATE NOT NULL,
    "period_end"           DATE NOT NULL,
    "total_income"         DECIMAL(12,2) NOT NULL,
    "total_expenses"       DECIMAL(12,2) NOT NULL,
    "net_operating_income" DECIMAL(12,2) NOT NULL,
    "distribution_amount"  DECIMAL(12,2) NOT NULL,
    "status"               "OwnerStatementStatus" NOT NULL DEFAULT 'draft',
    "notes"                TEXT,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owners_organization_id_email_key" ON "owners"("organization_id", "email");
CREATE INDEX "owners_organization_id_idx" ON "owners"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_owners_property_id_owner_id_key" ON "property_owners"("property_id", "owner_id");

-- CreateIndex
CREATE INDEX "owner_statements_organization_id_idx" ON "owner_statements"("organization_id");
CREATE INDEX "owner_statements_property_id_idx" ON "owner_statements"("property_id");
CREATE INDEX "owner_statements_owner_id_idx" ON "owner_statements"("owner_id");

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "owners"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_statements" ADD CONSTRAINT "owner_statements_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "owner_statements" ADD CONSTRAINT "owner_statements_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "owner_statements" ADD CONSTRAINT "owner_statements_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "owners"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
