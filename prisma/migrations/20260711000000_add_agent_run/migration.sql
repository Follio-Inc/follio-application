-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stepMetas" JSONB NOT NULL DEFAULT '[]',
    "totalTokensUsed" JSONB NOT NULL DEFAULT '{"input":0,"output":0}',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "requestId" TEXT,
    "userId" TEXT,
    "profileId" TEXT,
    "generatedPortfolioId" TEXT,
    "meta" JSONB,
    "inputSummary" JSONB,
    "outputSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_agentId_status_idx" ON "AgentRun"("agentId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_profileId_idx" ON "AgentRun"("profileId");

-- CreateIndex
CREATE INDEX "AgentRun_userId_idx" ON "AgentRun"("userId");

-- CreateIndex
CREATE INDEX "AgentRun_startedAt_idx" ON "AgentRun"("startedAt");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
