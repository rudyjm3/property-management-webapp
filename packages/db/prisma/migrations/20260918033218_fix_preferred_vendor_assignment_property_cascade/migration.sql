-- DropForeignKey
ALTER TABLE "preferred_vendor_assignments" DROP CONSTRAINT "preferred_vendor_assignments_property_id_fkey";

-- AddForeignKey
ALTER TABLE "preferred_vendor_assignments" ADD CONSTRAINT "preferred_vendor_assignments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
