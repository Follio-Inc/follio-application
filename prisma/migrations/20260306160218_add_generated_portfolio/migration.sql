-- CreateEnum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PortfolioStatus') THEN
    CREATE TYPE "PortfolioStatus" AS ENUM ('GENERATING', 'DRAFT', 'PUBLISHED', 'FAILED', 'ARCHIVED');
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "Profile" ALTER COLUMN "resumeVisibility" SET DEFAULT 'PRIVATE';

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "GeneratedPortfolio" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PortfolioStatus" NOT NULL DEFAULT 'DRAFT',
    "plan" JSONB NOT NULL,
    "collectedData" JSONB,
    "pipelineOutput" JSONB,
    "userOverrides" JSONB,
    "generationTimeMs" INTEGER,
    "totalTokensUsed" JSONB,
    "pipelineVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "GeneratedPortfolio_profileId_idx" ON "GeneratedPortfolio"("profileId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "GeneratedPortfolio_status_idx" ON "GeneratedPortfolio"("status");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "GeneratedPortfolio_isActive_idx" ON "GeneratedPortfolio"("isActive");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedPortfolio_profileId_version_key" ON "GeneratedPortfolio"("profileId", "version");

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GeneratedPortfolio_profileId_fkey') THEN
    ALTER TABLE "GeneratedPortfolio" ADD CONSTRAINT "GeneratedPortfolio_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
