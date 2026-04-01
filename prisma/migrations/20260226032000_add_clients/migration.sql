DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'PaymentMethod'
  ) THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'money_order');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "client" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "business_name" VARCHAR NOT NULL,
  "business_store_id" VARCHAR NOT NULL,
  "address" VARCHAR NOT NULL,
  "point_of_contact_name" VARCHAR NOT NULL,
  "phone_number" VARCHAR NOT NULL,
  "email" VARCHAR NOT NULL,
  "preferred_payment_method" "PaymentMethod" NOT NULL,
  "payment_preference" VARCHAR NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "client_company_id_idx" ON "client"("company_id");
CREATE INDEX IF NOT EXISTS "client_business_store_id_idx" ON "client"("business_store_id");
CREATE UNIQUE INDEX IF NOT EXISTS "client_company_id_business_store_id_key"
  ON "client"("company_id", "business_store_id");

ALTER TABLE "inventory_transaction"
ADD COLUMN IF NOT EXISTS "client_id" UUID;

CREATE INDEX IF NOT EXISTS "inventory_transaction_client_id_idx"
  ON "inventory_transaction"("client_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_company_id_fkey'
  ) THEN
    ALTER TABLE "client"
    ADD CONSTRAINT "client_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_transaction_client_id_fkey'
  ) THEN
    ALTER TABLE "inventory_transaction"
    ADD CONSTRAINT "inventory_transaction_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "client"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
