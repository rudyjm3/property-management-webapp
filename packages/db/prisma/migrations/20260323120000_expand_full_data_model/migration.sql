-- ─── New enum types ───────────────────────────────────────────────────────────

CREATE TYPE "PlanTier" AS ENUM ('starter', 'pro', 'enterprise');
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'trialing', 'past_due', 'canceled');
CREATE TYPE "UserStatus" AS ENUM ('active', 'invited', 'deactivated');
CREATE TYPE "UnitType" AS ENUM ('studio', 'one_bed', 'two_bed', 'three_bed', 'four_plus_bed', 'commercial');
CREATE TYPE "LeaseType" AS ENUM ('fixed_term', 'month_to_month');
CREATE TYPE "SecurityDepositStatus" AS ENUM ('held', 'partial_return', 'full_return', 'applied_to_balance');
CREATE TYPE "EsignatureStatus" AS ENUM ('pending', 'partially_signed', 'completed');
CREATE TYPE "PaymentMethod" AS ENUM ('ach', 'card', 'check', 'cash', 'money_order', 'other');
CREATE TYPE "PortalStatus" AS ENUM ('invited', 'active', 'never_logged_in');
CREATE TYPE "PreferredContact" AS ENUM ('email', 'sms', 'call');
CREATE TYPE "GovernmentIdType" AS ENUM ('drivers_license', 'state_id', 'passport');
CREATE TYPE "IncomeSource" AS ENUM ('employment', 'self_employed', 'benefits', 'other');
CREATE TYPE "VendorStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "DocumentCategory" AS ENUM ('lease', 'inspection', 'insurance', 'id', 'photo', 'other');

-- ─── New values on existing enums ────────────────────────────────────────────
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction in older PG.
-- Prisma wraps migrations in transactions; if this fails, split into separate migrations.

ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'multifamily';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'single_family';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'commercial';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'mixed_use';

ALTER TYPE "UnitStatus" ADD VALUE IF NOT EXISTS 'unlisted';

ALTER TYPE "LeaseStatus" ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE "LeaseStatus" ADD VALUE IF NOT EXISTS 'terminated';

ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'pet_deposit';
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'parking';
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'other';

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'refunded';

ALTER TYPE "WorkOrderCategory" ADD VALUE IF NOT EXISTS 'pest';
ALTER TYPE "WorkOrderCategory" ADD VALUE IF NOT EXISTS 'structural';
ALTER TYPE "WorkOrderCategory" ADD VALUE IF NOT EXISTS 'cosmetic';
ALTER TYPE "WorkOrderCategory" ADD VALUE IF NOT EXISTS 'grounds';

ALTER TYPE "WorkOrderPriority" ADD VALUE IF NOT EXISTS 'routine';

ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'closed';

ALTER TYPE "DocumentEntityType" ADD VALUE IF NOT EXISTS 'vendor';

-- ─── Organization ─────────────────────────────────────────────────────────────

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "email"               VARCHAR(320),
  ADD COLUMN IF NOT EXISTS "phone"               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "timezone"            VARCHAR(100) NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS "date_format"         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "plan_tier"           "PlanTier" NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS "trial_ends_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "late_fee_amount"     DECIMAL(10,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "grace_period_days"   INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "rent_due_day"        INTEGER NOT NULL DEFAULT 1;

-- ─── User ─────────────────────────────────────────────────────────────────────

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "phone"               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "status"              "UserStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "invited_at"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notif_rent_overdue"  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "notif_work_order"    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "notif_lease_expiry"  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "notif_new_message"   VARCHAR(20);

-- ─── Property ─────────────────────────────────────────────────────────────────

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "country"                  VARCHAR(2) NOT NULL DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS "jurisdiction_notes"       TEXT,
  ADD COLUMN IF NOT EXISTS "amenities"                TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "tax_parcel_id"            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "insurance_policy_number"  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "insurance_expires_at"     DATE;

-- ─── Unit ─────────────────────────────────────────────────────────────────────

ALTER TABLE "units"
  ADD COLUMN IF NOT EXISTS "type"                     "UnitType",
  ADD COLUMN IF NOT EXISTS "market_rent"              DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "available_date"           DATE,
  ADD COLUMN IF NOT EXISTS "parking_spaces"           TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "storage_unit"             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "utility_meter_electric"   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "utility_meter_gas"        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "utility_meter_water"      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "last_inspection_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_renovation_at"       DATE,
  ADD COLUMN IF NOT EXISTS "appliance_count"          INTEGER;

-- ─── Tenant ───────────────────────────────────────────────────────────────────

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "full_legal_name"              VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "preferred_name"               VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "date_of_birth"                DATE,
  ADD COLUMN IF NOT EXISTS "phone_secondary"              VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "preferred_contact"            "PreferredContact",
  ADD COLUMN IF NOT EXISTS "language_preference"          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "ssn_last4"                    CHAR(4),
  ADD COLUMN IF NOT EXISTS "ssn_full_encrypted"           TEXT,
  ADD COLUMN IF NOT EXISTS "govt_id_type"                 "GovernmentIdType",
  ADD COLUMN IF NOT EXISTS "govt_id_number"               TEXT,
  ADD COLUMN IF NOT EXISTS "screening_consent_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "current_address"              VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "previous_address"             VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "employer_name"                VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "employer_phone"               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "monthly_gross_income"         DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "income_source"                "IncomeSource",
  ADD COLUMN IF NOT EXISTS "emergency_contact_1_relationship" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "emergency_contact_1_email"    VARCHAR(320),
  ADD COLUMN IF NOT EXISTS "emergency_contact_2_name"     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "emergency_contact_2_phone"    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "emergency_contact_2_relationship" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "vehicles"                     JSONB,
  ADD COLUMN IF NOT EXISTS "pets"                         JSONB,
  ADD COLUMN IF NOT EXISTS "portal_status"                "PortalStatus" NOT NULL DEFAULT 'never_logged_in',
  ADD COLUMN IF NOT EXISTS "portal_invited_at"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notif_payment_confirm"        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "notif_work_order_update"      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "notif_message"                VARCHAR(20);

-- ─── Lease ────────────────────────────────────────────────────────────────────

ALTER TABLE "leases"
  ADD COLUMN IF NOT EXISTS "type"                             "LeaseType",
  ADD COLUMN IF NOT EXISTS "move_in_date"                     DATE,
  ADD COLUMN IF NOT EXISTS "move_out_date"                    DATE,
  ADD COLUMN IF NOT EXISTS "notice_period_days"               INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "rent_due_day"                     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "security_deposit_paid_at"         DATE,
  ADD COLUMN IF NOT EXISTS "security_deposit_status"          "SecurityDepositStatus" NOT NULL DEFAULT 'held',
  ADD COLUMN IF NOT EXISTS "security_deposit_returned_at"     DATE,
  ADD COLUMN IF NOT EXISTS "security_deposit_return_amount"   DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "security_deposit_deductions"      JSONB,
  ADD COLUMN IF NOT EXISTS "utilities_included"               TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "has_pet_addendum"                 BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "pet_deposit_amount"               DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "has_parking_addendum"             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "parking_fee"                      DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "occupant_count"                   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "occupant_names"                   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "esignature_status"                "EsignatureStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "tenant_signed_at"                 TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "manager_signed_at"                TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "renewal_of_lease_id"              TEXT REFERENCES "leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Payment ──────────────────────────────────────────────────────────────────

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "method"                "PaymentMethod" NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "check_number"          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "reference_note"        VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "period_start"          DATE,
  ADD COLUMN IF NOT EXISTS "period_end"            DATE,
  ADD COLUMN IF NOT EXISTS "is_late"               BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "late_fee_applied"      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "late_fee_waived"       BOOLEAN,
  ADD COLUMN IF NOT EXISTS "late_fee_waived_reason" VARCHAR(500);

-- ─── Vendor (new table) ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "vendors" (
  "id"                    TEXT NOT NULL,
  "organization_id"       TEXT NOT NULL,
  "company_name"          VARCHAR(200) NOT NULL,
  "contact_name"          VARCHAR(200) NOT NULL,
  "email"                 VARCHAR(320) NOT NULL,
  "phone_primary"         VARCHAR(20) NOT NULL,
  "phone_emergency"       VARCHAR(20),
  "specialties"           TEXT[] NOT NULL DEFAULT '{}',
  "status"                "VendorStatus" NOT NULL DEFAULT 'active',
  "preferred"             BOOLEAN,
  "rating"                DECIMAL(3,1),
  "notes"                 TEXT,
  "license_number"        VARCHAR(200),
  "license_expires_at"    DATE,
  "insurance_on_file"     BOOLEAN NOT NULL DEFAULT FALSE,
  "insurance_expires_at"  DATE,
  "w9_on_file"            BOOLEAN,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendors_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vendors_organization_id_idx" ON "vendors"("organization_id");

-- ─── Work Order — new columns (vendor table must exist first) ─────────────────

ALTER TABLE "work_orders"
  ADD COLUMN IF NOT EXISTS "property_id"              TEXT REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS "submitted_by_user_id"     TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS "vendor_id"                TEXT REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS "title"                    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "sla_deadline_at"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sla_breached"             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "entry_permission_granted" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "preferred_contact_window" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "scheduled_at"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "labor_cost"               DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "parts_cost"               DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "total_cost"               DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "charged_to_tenant"        BOOLEAN,
  ADD COLUMN IF NOT EXISTS "tenant_charge_amount"     DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "photos_before"            TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "photos_after"             TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "video_url"                VARCHAR(1000);

CREATE INDEX IF NOT EXISTS "work_orders_property_id_idx" ON "work_orders"("property_id");

-- ─── Message — add thread support columns ─────────────────────────────────────

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "thread_id"    VARCHAR(36),
  ADD COLUMN IF NOT EXISTS "unit_id"      TEXT REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS "work_order_id" TEXT REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS "subject"      VARCHAR(500);

CREATE INDEX IF NOT EXISTS "messages_thread_id_idx" ON "messages"("thread_id");

-- ─── Document — add category and label ───────────────────────────────────────

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "doc_category" "DocumentCategory",
  ADD COLUMN IF NOT EXISTS "label"        VARCHAR(200);
