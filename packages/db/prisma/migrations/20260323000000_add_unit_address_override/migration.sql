-- AlterTable
ALTER TABLE "units" ADD COLUMN "address" VARCHAR(500),
                    ADD COLUMN "city" VARCHAR(100),
                    ADD COLUMN "state" CHAR(2),
                    ADD COLUMN "zip" VARCHAR(10);
