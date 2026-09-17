-- CreateEnum
CREATE TYPE "ApplianceCategory" AS ENUM ('hvac', 'water_heater', 'refrigerator', 'dishwasher', 'washer', 'dryer', 'oven_range', 'microwave', 'garbage_disposal', 'other');

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "appliance_id" TEXT;

-- CreateTable
CREATE TABLE "appliances" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "category" "ApplianceCategory" NOT NULL DEFAULT 'other',
    "make" VARCHAR(100),
    "model" VARCHAR(100),
    "serial_number" VARCHAR(100),
    "purchase_date" DATE,
    "install_date" DATE,
    "warranty_expires_at" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appliances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appliances_unit_id_idx" ON "appliances"("unit_id");

-- CreateIndex
CREATE INDEX "work_orders_appliance_id_idx" ON "work_orders"("appliance_id");

-- AddForeignKey
ALTER TABLE "appliances" ADD CONSTRAINT "appliances_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_appliance_id_fkey" FOREIGN KEY ("appliance_id") REFERENCES "appliances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
