-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "mfa_email_code" VARCHAR,
ADD COLUMN     "mfa_email_code_expires_at" TIMESTAMPTZ,
ADD COLUMN     "mfa_email_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_totp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_totp_secret" VARCHAR;
