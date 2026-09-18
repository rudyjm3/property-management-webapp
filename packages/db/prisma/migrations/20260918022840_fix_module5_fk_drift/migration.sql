-- DropForeignKey
ALTER TABLE "inspections" DROP CONSTRAINT "inspections_unit_id_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_unit_id_fkey";

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Postgres treats every NULL in a unique index as distinct, so the existing
-- @@unique([organizationId, propertyId, category]) index does NOT prevent
-- duplicate org-wide (property_id IS NULL) preferred-vendor assignments for
-- the same organization+category. Prisma's schema DSL can't express a
-- partial index, so it's added here as raw SQL — see the comment above
-- PreferredVendorAssignment in schema.prisma.
CREATE UNIQUE INDEX "PreferredVendorAssignment_org_category_orgwide_unique"
  ON "preferred_vendor_assignments" ("organization_id", "category")
  WHERE "property_id" IS NULL;
