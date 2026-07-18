/**
 * Persist AgentRunRecord rows for cost tracking and debugging.
 * Failures are logged but never fail the agent run itself.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

import type { AgentContext, AgentRunRecord } from '@/types/agents';

const persistLogger = logger.child({ source: 'agent-run-persist' });

export interface PersistAgentRunOptions {
  ctx?: AgentContext;
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  generatedPortfolioId?: string;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function persistAgentRun(
  run: AgentRunRecord,
  options: PersistAgentRunOptions = {}
): Promise<void> {
  const { ctx, inputSummary, outputSummary, generatedPortfolioId } = options;

  try {
    await db.agentRun.upsert({
      where: { id: run.id },
      create: {
        id: run.id,
        agentId: run.agentId,
        version: run.version,
        status: run.status,
        stepMetas: asJson(run.stepMetas),
        totalTokensUsed: asJson(run.totalTokensUsed),
        startedAt: new Date(run.startedAt),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
        error: run.error ?? null,
        requestId: ctx?.requestId ?? null,
        userId: ctx?.userId ?? null,
        profileId: ctx?.profileId ?? null,
        generatedPortfolioId: generatedPortfolioId ?? null,
        meta: ctx?.meta ? asJson(ctx.meta) : undefined,
        inputSummary: inputSummary ? asJson(inputSummary) : undefined,
        outputSummary: outputSummary ? asJson(outputSummary) : undefined,
      },
      update: {
        status: run.status,
        stepMetas: asJson(run.stepMetas),
        totalTokensUsed: asJson(run.totalTokensUsed),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
        error: run.error ?? null,
        generatedPortfolioId: generatedPortfolioId ?? undefined,
        outputSummary: outputSummary ? asJson(outputSummary) : undefined,
      },
    });
  } catch (error) {
    persistLogger.warn('Failed to persist agent run (non-fatal)', {
      runId: run.id,
      agentId: run.agentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
