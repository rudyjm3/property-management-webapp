-- Module 9: Owner Portal auth — adds owner login/portal fields (mirrors Tenant).
-- Module 11: Reporting & Analytics — adds vacancy-rate history tracking and
-- report-builder saved configs.

-- AlterTable: owners — add portal auth fields
ALTER TABLE "owners" ADD COLUMN "supabase_user_id" TEXT;
ALTER TABLE "owners" ADD COLUMN "portal_status" "PortalStatus" NOT NULL DEFAULT 'never_logged_in';
ALTER TABLE "owners" ADD COLUMN "portal_invited_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "owners_supabase_user_id_key" ON "owners"("supabase_user_id");

-- CreateTable: vacancy_history
CREATE TABLE "vacancy_history" (
    "id"                       TEXT NOT NULL,
    "organization_id"          TEXT NOT NULL,
    "property_id"              TEXT,
    "snapshot_date"            DATE NOT NULL,
    "total_units"              INTEGER NOT NULL,
    "vacant_units"             INTEGER NOT NULL,
    "vacancy_rate_pct"         DECIMAL(5,2) NOT NULL,
    "market_vacancy_rate_pct"  DECIMAL(5,2),
    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacancy_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vacancy_history_organization_id_property_id_snapshot_date_key"
    ON "vacancy_history"("organization_id", "property_id", "snapshot_date");
CREATE INDEX "vacancy_history_organization_id_snapshot_date_idx"
    ON "vacancy_history"("organization_id", "snapshot_date");

ALTER TABLE "vacancy_history" ADD CONSTRAINT "vacancy_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vacancy_history" ADD CONSTRAINT "vacancy_history_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: saved_reports
CREATE TABLE "saved_reports" (
    "id"                 TEXT NOT NULL,
    "organization_id"    TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "name"               VARCHAR(200) NOT NULL,
    "source"             VARCHAR(50) NOT NULL,
    "columns"            TEXT[] NOT NULL,
    "filters"            JSONB NOT NULL,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_reports_organization_id_idx" ON "saved_reports"("organization_id");

ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
