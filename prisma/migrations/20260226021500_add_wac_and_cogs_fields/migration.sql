ALTER TABLE "inventory"
ADD COLUMN IF NOT EXISTS "average_unit_cost" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "inventory_transaction"
ADD COLUMN IF NOT EXISTS "cost_basis_unit_cost" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "cogs_amount" DECIMAL(10,2);
