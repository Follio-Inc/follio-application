-- AlterTable (idempotent)
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "resumeDesign" JSONB;
