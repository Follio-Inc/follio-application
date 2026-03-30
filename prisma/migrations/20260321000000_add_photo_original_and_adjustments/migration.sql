-- AlterTable
ALTER TABLE "ProfilePhoto" ADD COLUMN "originalUrl" TEXT;
ALTER TABLE "ProfilePhoto" ADD COLUMN "adjustments" JSONB;
