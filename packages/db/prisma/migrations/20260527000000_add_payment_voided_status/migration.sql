-- Add voided status to PaymentStatus enum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'voided';

-- Add void tracking fields to payments
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "void_reason" VARCHAR(500);
