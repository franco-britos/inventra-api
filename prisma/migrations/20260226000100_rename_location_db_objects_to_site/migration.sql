-- Rename physical DB objects from location* to site*
-- while preserving data and existing relationships.

-- 1) Enum: LocationType -> SiteType
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'LocationType'
  ) THEN
    ALTER TYPE "LocationType" RENAME TO "SiteType";
  END IF;
END $$;

-- 2) Table: location -> site
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'location'
  ) THEN
    EXECUTE 'ALTER TABLE "location" RENAME TO "site"';
  END IF;
END $$;

-- 3) Columns: location_* -> site_*
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'site'
      AND column_name = 'location_type'
  ) THEN
    EXECUTE 'ALTER TABLE "site" RENAME COLUMN "location_type" TO "site_type"';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employee'
      AND column_name = 'location_id'
  ) THEN
    EXECUTE 'ALTER TABLE "employee" RENAME COLUMN "location_id" TO "site_id"';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory'
      AND column_name = 'location_id'
  ) THEN
    EXECUTE 'ALTER TABLE "inventory" RENAME COLUMN "location_id" TO "site_id"';
  END IF;
END $$;

-- 4) Indexes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'location_company_id_idx'
  ) THEN
    EXECUTE 'ALTER INDEX "location_company_id_idx" RENAME TO "site_company_id_idx"';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'employee_location_id_idx'
  ) THEN
    EXECUTE 'ALTER INDEX "employee_location_id_idx" RENAME TO "employee_site_id_idx"';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'inventory_product_id_location_id_key'
  ) THEN
    EXECUTE 'ALTER INDEX "inventory_product_id_location_id_key" RENAME TO "inventory_product_id_site_id_key"';
  END IF;
END $$;

-- 5) Constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_pkey'
  ) THEN
    EXECUTE 'ALTER TABLE "site" RENAME CONSTRAINT "location_pkey" TO "site_pkey"';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_company_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "site" RENAME CONSTRAINT "location_company_id_fkey" TO "site_company_id_fkey"';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_location_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "employee" RENAME CONSTRAINT "employee_location_id_fkey" TO "employee_site_id_fkey"';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_location_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "inventory" RENAME CONSTRAINT "inventory_location_id_fkey" TO "inventory_site_id_fkey"';
  END IF;
END $$;
