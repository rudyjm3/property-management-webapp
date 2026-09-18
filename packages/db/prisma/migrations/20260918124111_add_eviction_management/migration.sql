-- CreateEnum
CREATE TYPE "EvictionNoticeType" AS ENUM ('pay_or_quit', 'cure_or_quit', 'unconditional_quit');

-- CreateEnum
CREATE TYPE "EvictionDeliveryMethod" AS ENUM ('certified_mail', 'personal_service', 'posting');

-- CreateEnum
CREATE TYPE "EvictionStatus" AS ENUM ('notice_served', 'cured', 'paid', 'expired', 'filed', 'court_date_set', 'judgment', 'writ_issued', 'completed', 'dismissed');

-- CreateEnum
CREATE TYPE "EvictionJudgmentOutcome" AS ENUM ('possession_landlord', 'possession_tenant', 'dismissed', 'settled');

-- CreateTable
CREATE TABLE "evictions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lease_id" TEXT NOT NULL,
    "notice_type" "EvictionNoticeType" NOT NULL,
    "notice_date" DATE NOT NULL,
    "state_rule_id" TEXT,
    "notice_period_days" INTEGER NOT NULL,
    "deadline_date" DATE NOT NULL,
    "override_reason" TEXT,
    "delivery_method" "EvictionDeliveryMethod" NOT NULL,
    "delivery_date" DATE,
    "served_by_user_id" TEXT,
    "served_by_name" VARCHAR(200),
    "status" "EvictionStatus" NOT NULL DEFAULT 'notice_served',
    "resolved_at" TIMESTAMP(3),
    "court_case_number" VARCHAR(100),
    "court_name" VARCHAR(200),
    "filed_at" TIMESTAMP(3),
    "court_date" TIMESTAMP(3),
    "judgment_outcome" "EvictionJudgmentOutcome",
    "judgment_at" TIMESTAMP(3),
    "writ_issued_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "dismissed_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_eviction_rules" (
    "id" TEXT NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "notice_type" "EvictionNoticeType" NOT NULL,
    "notice_period_days" INTEGER NOT NULL,
    "allowed_delivery_methods" "EvictionDeliveryMethod"[],
    "notes" TEXT,
    "source" VARCHAR(500) NOT NULL,
    "last_verified_at" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_eviction_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evictions_organization_id_idx" ON "evictions"("organization_id");

-- CreateIndex
CREATE INDEX "evictions_lease_id_idx" ON "evictions"("lease_id");

-- CreateIndex
CREATE INDEX "evictions_status_idx" ON "evictions"("status");

-- CreateIndex
CREATE INDEX "evictions_deadline_date_idx" ON "evictions"("deadline_date");

-- CreateIndex
CREATE INDEX "evictions_court_date_idx" ON "evictions"("court_date");

-- CreateIndex
CREATE INDEX "state_eviction_rules_state_idx" ON "state_eviction_rules"("state");

-- CreateIndex
CREATE UNIQUE INDEX "state_eviction_rules_state_notice_type_key" ON "state_eviction_rules"("state", "notice_type");

-- AddForeignKey
ALTER TABLE "evictions" ADD CONSTRAINT "evictions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evictions" ADD CONSTRAINT "evictions_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evictions" ADD CONSTRAINT "evictions_state_rule_id_fkey" FOREIGN KEY ("state_rule_id") REFERENCES "state_eviction_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evictions" ADD CONSTRAINT "evictions_served_by_user_id_fkey" FOREIGN KEY ("served_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
