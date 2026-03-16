-- CreateEnum
CREATE TYPE "ImportSessionStatus" AS ENUM ('PENDING_REVIEW', 'APPLIED', 'DISCARDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ImportSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "status" "ImportSessionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "parsedData" JSONB NOT NULL,
    "previewData" JSONB,
    "selections" JSONB,
    "edits" JSONB,
    "sourceLabel" TEXT,
    "proposedCount" INTEGER NOT NULL DEFAULT 0,
    "appliedCount" INTEGER,
    "appliedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportSession_userId_idx" ON "ImportSession"("userId");

-- CreateIndex
CREATE INDEX "ImportSession_status_idx" ON "ImportSession"("status");

-- CreateIndex
CREATE INDEX "ImportSession_expiresAt_idx" ON "ImportSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
