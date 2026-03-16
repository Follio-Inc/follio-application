-- AlterTable - Add phoneCountryCode and phoneNumber to ContactInfo
ALTER TABLE "ContactInfo" ADD COLUMN IF NOT EXISTS "phoneCountryCode" TEXT;
ALTER TABLE "ContactInfo" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
