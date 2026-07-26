-- AlterTable
ALTER TABLE "CoverLetter" ADD COLUMN "visibility" "ContentVisibility" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "CoverLetter" ADD COLUMN "unlistedKey" TEXT;

-- Backfill unlisted keys for existing rows (cuid-like hex)
UPDATE "CoverLetter"
SET "unlistedKey" = md5(random()::text || id || clock_timestamp()::text)
WHERE "unlistedKey" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CoverLetter_unlistedKey_key" ON "CoverLetter"("unlistedKey");

-- CreateIndex
CREATE INDEX "CoverLetter_visibility_idx" ON "CoverLetter"("visibility");
