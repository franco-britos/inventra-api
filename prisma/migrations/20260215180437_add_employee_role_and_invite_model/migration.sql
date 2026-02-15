-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('owner', 'manager', 'staff');

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "role" "EmployeeRole" NOT NULL DEFAULT 'staff';

-- CreateTable
CREATE TABLE "invite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "email" VARCHAR NOT NULL,
    "role" "EmployeeRole" NOT NULL,
    "first_name" VARCHAR NOT NULL,
    "last_name" VARCHAR NOT NULL,
    "token" VARCHAR NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invite_token_key" ON "invite"("token");

-- CreateIndex
CREATE INDEX "invite_company_id_idx" ON "invite"("company_id");

-- CreateIndex
CREATE INDEX "invite_email_idx" ON "invite"("email");

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
