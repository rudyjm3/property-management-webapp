-- DropForeignKey
ALTER TABLE "inspections" DROP CONSTRAINT "inspections_unit_id_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_unit_id_fkey";

-- CreateTable
CREATE TABLE "vendor_work_order_ratings" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_work_order_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferred_vendor_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT,
    "category" "WorkOrderCategory" NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferred_vendor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_work_order_ratings_work_order_id_key" ON "vendor_work_order_ratings"("work_order_id");

-- CreateIndex
CREATE INDEX "vendor_work_order_ratings_vendor_id_idx" ON "vendor_work_order_ratings"("vendor_id");

-- CreateIndex
CREATE INDEX "preferred_vendor_assignments_organization_id_idx" ON "preferred_vendor_assignments"("organization_id");

-- CreateIndex
CREATE INDEX "preferred_vendor_assignments_property_id_idx" ON "preferred_vendor_assignments"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "preferred_vendor_assignments_organization_id_property_id_ca_key" ON "preferred_vendor_assignments"("organization_id", "property_id", "category");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_work_order_ratings" ADD CONSTRAINT "vendor_work_order_ratings_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_work_order_ratings" ADD CONSTRAINT "vendor_work_order_ratings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferred_vendor_assignments" ADD CONSTRAINT "preferred_vendor_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferred_vendor_assignments" ADD CONSTRAINT "preferred_vendor_assignments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferred_vendor_assignments" ADD CONSTRAINT "preferred_vendor_assignments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
