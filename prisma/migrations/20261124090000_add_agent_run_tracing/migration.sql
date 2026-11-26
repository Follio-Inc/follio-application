-- Parent/child run correlation for multi-agent executions (Phase 2A).
--
-- Additive and nullable only. Written by hand rather than generated from the
-- datasource for the same reason as 20261014120000_add_platform_role: a
-- `prisma migrate diff --from-schema-datasource` here also picks up
-- pre-existing drift this migration has nothing to do with (a
-- `ResumeEditSession` table and two `Profile` columns that exist in the
-- database, in no migration and in no code). Dropping those is a separate
-- decision and not this migration's to make.
--
-- No backfill and no NOT NULL: every AgentRun row written before this
-- migration was a single-agent run, so a null `parentRunId` is already the
-- truthful value for it. `rootRunId` is left null on those rows rather than
-- backfilled to `id` because a backfill would rewrite the entire table to
-- state something the application can infer, and the reader already treats
-- "null rootRunId" as "this run is its own root".
--
-- Deliberately not foreign keys. Both columns hold ids of rows in this same
-- table, and AgentRun is telemetry that is allowed to lose rows: a real FK
-- would either block deleting a parent or cascade into deleting a child's
-- history, and neither is wanted here.

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN "parentRunId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "rootRunId" TEXT;

-- CreateIndex
--
-- parentRunId: fetch one run's direct children.
-- rootRunId:   fetch every run in one execution in a single query.
CREATE INDEX "AgentRun_parentRunId_idx" ON "AgentRun"("parentRunId");
CREATE INDEX "AgentRun_rootRunId_idx" ON "AgentRun"("rootRunId");
