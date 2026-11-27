-- AI resume edits: one row per request from the builder, with its proposed changes.
CREATE TABLE "ResumeEditSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "brief" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "droppedCount" INTEGER NOT NULL DEFAULT 0,
    "failedSections" TEXT[],
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeEditSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResumeEditSession_userId_createdAt_idx" ON "ResumeEditSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResumeEditSession_profileId_createdAt_idx" ON "ResumeEditSession"("profileId", "createdAt");

-- AddForeignKey
ALTER TABLE "ResumeEditSession" ADD CONSTRAINT "ResumeEditSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeEditSession" ADD CONSTRAINT "ResumeEditSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
