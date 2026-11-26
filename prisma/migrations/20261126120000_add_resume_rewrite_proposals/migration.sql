-- Persistent rewrite proposals and their human approval state (Phase 3B.1).
--
-- Additive only: two new tables and four new enums. Nothing existing is
-- altered, so this migration cannot change how any current feature behaves,
-- and rolling it back is a pair of DROP TABLEs.
--
-- Written by hand rather than generated from the datasource, for the same
-- reason as 20261124090000_add_agent_run_tracing: a
-- `prisma migrate diff --from-schema-datasource` in this repository also picks
-- up pre-existing drift unrelated to this change (a `ResumeEditSession` table
-- and two `Profile` columns that exist in the database, in no migration and in
-- no code). Removing those is a separate decision and not this migration's to
-- make.
--
-- Why two tables rather than reusing `AiEditDraft`: that model is the AI
-- connector's whole-draft record — one status for a JSON blob of append-style
-- operations, with no stable target address, no per-item state, no
-- verification verdict and no original text to detect staleness against.
-- Reshaping it would change the MCP connector's contract.
--
-- `rootRunId` and `agentRunId` are plain TEXT, not foreign keys to AgentRun,
-- matching the convention that AgentRun is telemetry allowed to lose rows: a
-- real FK would either block pruning run history or cascade a user's reviewed
-- proposals away with it.

-- CreateEnum
CREATE TYPE "ProposalVerificationStatus" AS ENUM ('APPROVED', 'REVISION_REQUIRED', 'REJECTED', 'NEEDS_USER_INPUT', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "ProposalDecision" AS ENUM ('NONE', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProposalState" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED', 'STALE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ProposalBatchStatus" AS ENUM ('COMPLETE', 'INCOMPLETE', 'UNVERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "ResumeProposalBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "ProposalBatchStatus" NOT NULL,
    "rootRunId" TEXT,
    "idempotencyKey" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "openQuestions" TEXT[],
    "limitations" TEXT[],
    "revisionAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeProposalBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeEditProposal" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "agentProposalId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "targetRef" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "targetRecordId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "arrayIndex" INTEGER,
    "originalText" TEXT NOT NULL,
    "proposedText" TEXT NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "sourceEvidence" TEXT[],
    "keywordsAddressed" TEXT[],
    "uncertainties" TEXT[],
    "verificationStatus" "ProposalVerificationStatus" NOT NULL,
    "verificationReason" TEXT NOT NULL DEFAULT '',
    "deterministicIssues" JSONB NOT NULL DEFAULT '[]',
    "revisionRound" INTEGER NOT NULL DEFAULT 0,
    "decision" "ProposalDecision" NOT NULL DEFAULT 'NONE',
    "state" "ProposalState" NOT NULL,
    "stateReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ResumeEditProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- The unique index is the database restating the deterministic
-- duplicate-target guard: one proposal per resume element per batch, so two
-- conflicting rewrites of the same bullet cannot both be approved.
CREATE UNIQUE INDEX "ResumeProposalBatch_profileId_idempotencyKey_key" ON "ResumeProposalBatch"("profileId", "idempotencyKey");
CREATE INDEX "ResumeProposalBatch_userId_createdAt_idx" ON "ResumeProposalBatch"("userId", "createdAt");
CREATE INDEX "ResumeProposalBatch_profileId_createdAt_idx" ON "ResumeProposalBatch"("profileId", "createdAt");

CREATE UNIQUE INDEX "ResumeEditProposal_batchId_targetRef_key" ON "ResumeEditProposal"("batchId", "targetRef");
CREATE INDEX "ResumeEditProposal_userId_state_idx" ON "ResumeEditProposal"("userId", "state");
CREATE INDEX "ResumeEditProposal_profileId_state_idx" ON "ResumeEditProposal"("profileId", "state");
CREATE INDEX "ResumeEditProposal_batchId_idx" ON "ResumeEditProposal"("batchId");

-- AddForeignKey
ALTER TABLE "ResumeProposalBatch" ADD CONSTRAINT "ResumeProposalBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResumeProposalBatch" ADD CONSTRAINT "ResumeProposalBatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeEditProposal" ADD CONSTRAINT "ResumeEditProposal_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ResumeProposalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResumeEditProposal" ADD CONSTRAINT "ResumeEditProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResumeEditProposal" ADD CONSTRAINT "ResumeEditProposal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
