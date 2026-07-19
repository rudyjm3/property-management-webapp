-- Property-level work orders: allow work orders without a unit (parking lot,
-- siding, building exterior, etc.), anchored to the property instead.

CREATE TYPE "WorkOrderLocationType" AS ENUM
  ('exterior', 'parking', 'roof', 'landscaping', 'common_interior', 'amenity', 'unit_interior');

ALTER TABLE "work_orders"
  ADD COLUMN IF NOT EXISTS "location_type"      "WorkOrderLocationType",
  ADD COLUMN IF NOT EXISTS "is_capital_project" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "work_orders" ALTER COLUMN "unit_id" DROP NOT NULL;

-- Backfill: ensure every unit-scoped order carries its property_id
UPDATE "work_orders" wo SET "property_id" = u."property_id"
FROM "units" u
WHERE wo."unit_id" = u."id" AND wo."property_id" IS NULL;

-- Every work order must be anchored to a unit or a property
ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_scope_check"
  CHECK ("unit_id" IS NOT NULL OR "property_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "work_orders_location_type_idx" ON "work_orders"("location_type");
