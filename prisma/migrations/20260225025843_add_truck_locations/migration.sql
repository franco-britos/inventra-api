-- AlterEnum
ALTER TYPE "LocationType" ADD VALUE 'truck';

-- AlterTable
ALTER TABLE "location" ADD COLUMN     "driver_name" VARCHAR,
ADD COLUMN     "license_plate" VARCHAR,
ADD COLUMN     "vin" VARCHAR;
