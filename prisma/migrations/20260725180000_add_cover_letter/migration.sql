-- CreateTable
CREATE TABLE "CoverLetter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeForUserId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Untitled Cover Letter',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "content" JSONB,
    "design" JSONB,
    "linkedProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoverLetter_activeForUserId_key" ON "CoverLetter"("activeForUserId");

-- CreateIndex
CREATE INDEX "CoverLetter_userId_idx" ON "CoverLetter"("userId");

-- CreateIndex
CREATE INDEX "CoverLetter_linkedProfileId_idx" ON "CoverLetter"("linkedProfileId");

-- CreateIndex
CREATE INDEX "CoverLetter_updatedAt_idx" ON "CoverLetter"("updatedAt");

-- AddForeignKey
ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_linkedProfileId_fkey" FOREIGN KEY ("linkedProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
