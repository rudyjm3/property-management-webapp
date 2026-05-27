-- Add invite-code activation fields to tenants
ALTER TABLE "tenants"
  ADD COLUMN "invite_code" CHAR(8) UNIQUE,
  ADD COLUMN "invite_code_expires_at" TIMESTAMPTZ;

-- Add autopay fields to tenants
ALTER TABLE "tenants"
  ADD COLUMN "autopay_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stripe_customer_id" VARCHAR(255) UNIQUE,
  ADD COLUMN "stripe_default_payment_method_id" VARCHAR(255);
