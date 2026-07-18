/**
 * Follio Agent Runtime
 *
 * Runs product agents defined as either:
 * - workflow: deterministic ordered steps
 * - tool: model-driven tool-calling loop (bounded by budget)
 *
 * Domain agents live in services/agents/* and call `runAgent`.
 */

import { randomUUID } from 'crypto';

import { executeChatCompletion } from '@/lib/ai-client';
import { logger } from '@/lib/logger';
import { zodToOpenAIParameters } from '@/lib/agents/define-tool';
import { AgentBudgetExceededError, AgentCancelledError, AgentError } from '@/lib/agents/errors';
import { createAgentMemory } from '@/lib/agents/memory';
import { persistAgentRun } from '@/lib/agents/persist-run';

import type {
  AgentContext,
  AgentDefinition,
  AgentProgressEvent,
  AgentRunRecord,
  AgentRunResult,
  AgentStepMeta,
  AgentTokenUsage,
  AgentTool,
  AgentToolContext,
  ToolAgentDefinition,
  WorkflowAgentDefinition,
} from '@/types/agents';
import type OpenAI from 'openai';

const runtimeLogger = logger.child({ source: 'agent-runtime' });

const DEFAULT_MAX_STEPS = 12;
const DEFAULT_MAX_DURATION_MS = 120_000;

export async function runAgent<TInput, TOutput>(
  agent: AgentDefinition<TInput, TOutput>,
  input: TInput,
  ctx: AgentContext = {}
): Promise<AgentRunResult<TOutput>> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const stepMetas: AgentStepMeta[] = [];
  const totalTokens: AgentTokenUsage = { input: 0, output: 0 };

  const run: AgentRunRecord = {
    id: runId,
    agentId: agent.id,
    version: agent.version,
    status: 'running',
    stepMetas,
    totalTokensUsed: totalTokens,
    startedAt,
  };

  runtimeLogger.info('Agent run started', {
    runId,
    agentId: agent.id,
    version: agent.version,
    kind: agent.kind,
  });

  const finish = async (
    result: AgentRunResult<TOutput> | null,
    errorToThrow?: unknown
  ): Promise<AgentRunResult<TOutput>> => {
    await persistAgentRun(run, {
      ctx,
      inputSummary: summarizeInput(agent.id, input),
      outputSummary: result ? summarizeOutput(agent.id, result.output) : undefined,
      generatedPortfolioId:
        typeof ctx.meta?.generatedPortfolioId === 'string'
          ? ctx.meta.generatedPortfolioId
          : undefined,
    });
    if (errorToThrow) throw errorToThrow;
    return result!;
  };

  try {
    assertNotCancelled(ctx, agent.id);

    const output =
      agent.kind === 'workflow'
        ? await runWorkflowAgent(agent, input, ctx, run)
        : await runToolAgent(agent, input, ctx, run);

    run.status = 'succeeded';
    run.finishedAt = new Date().toISOString();

    runtimeLogger.info('Agent run succeeded', {
      runId,
      agentId: agent.id,
      steps: stepMetas.length,
      tokensIn: totalTokens.input,
      tokensOut: totalTokens.output,
    });

    return finish({ output, run });
  } catch (error) {
    if (agent.fallback) {
      runtimeLogger.warn('Agent run failed; using fallback', {
        runId,
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        const output = await agent.fallback(input, ctx);
        run.status = 'succeeded';
        run.finishedAt = new Date().toISOString();
        run.error = error instanceof Error ? error.message : String(error);
        stepMetas.push({
          stepId: 'fallback',
          kind: 'system',
          durationMs: 0,
          timestamp: new Date().toISOString(),
          detail: 'Used deterministic/AI fallback after primary run failed',
        });
        return finish({ output, run });
      } catch (fallbackError) {
        run.status = 'failed';
        run.finishedAt = new Date().toISOString();
        run.error = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return finish(null, fallbackError);
      }
    }

    run.status =
      error instanceof AgentCancelledError
        ? 'cancelled'
        : error instanceof AgentBudgetExceededError
          ? 'failed'
          : 'failed';
    run.finishedAt = new Date().toISOString();
    run.error = error instanceof Error ? error.message : String(error);

    runtimeLogger.error('Agent run failed', error, { runId, agentId: agent.id });
    return finish(null, error);
  }
}

function summarizeInput(agentId: string, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return { type: typeof input };
  const obj = input as Record<string, unknown>;
  if (agentId === 'resume-parse') {
    return {
      textLength: typeof obj.text === 'string' ? obj.text.length : undefined,
      saveToProfile: obj.saveToProfile ?? false,
      hasUserId: !!obj.userId,
    };
  }
  if (agentId === 'portfolio-generation') {
    return { profileId: obj.profileId, hasFocusNotes: !!obj.focusNotes };
  }
  if (agentId === 'snap-view') {
    return { profileId: obj.id, handle: obj.handle };
  }
  return { keys: Object.keys(obj).slice(0, 12) };
}

function summarizeOutput(agentId: string, output: unknown): Record<string, unknown> {
  if (!output || typeof output !== 'object') return { type: typeof output };
  const obj = output as Record<string, unknown>;
  if (agentId === 'resume-parse') {
    const data = obj.data as Record<string, unknown> | undefined;
    const profile = data?.profile as Record<string, unknown> | undefined;
    return {
      saved: obj.saved,
      experiences: Array.isArray(data?.experiences) ? data.experiences.length : 0,
      skills: Array.isArray(data?.skills) ? data.skills.length : 0,
      hasName: !!(profile?.firstName || profile?.lastName),
    };
  }
  if (agentId === 'portfolio-generation') {
    const copy = obj.copy as Record<string, unknown> | undefined;
    return {
      stagesRun: obj.stagesRun,
      headline: copy?.heroHeadline,
      tokensUsed: obj.tokensUsed,
    };
  }
  if (agentId === 'snap-view') {
    return {
      isAIGenerated: obj.isAIGenerated,
      hasTagline: !!obj.tagline,
      projects: Array.isArray(obj.keyProjects) ? obj.keyProjects.length : 0,
    };
  }
  return { keys: Object.keys(obj).slice(0, 12) };
}

// ============================================================================
// WORKFLOW
// ============================================================================

async function runWorkflowAgent<TInput, TOutput>(
  agent: WorkflowAgentDefinition<TInput, TOutput>,
  input: TInput,
  ctx: AgentContext,
  run: AgentRunRecord
): Promise<TOutput> {
  const memory = createAgentMemory({ __input: input });
  const totalSteps = agent.steps.length + 1;

  for (let i = 0; i < agent.steps.length; i++) {
    assertNotCancelled(ctx, agent.id);
    assertWithinDuration(ctx, agent.id, run.startedAt);

    const step = agent.steps[i];
    emitProgress(ctx, {
      agentId: agent.id,
      runId: run.id,
      stepId: step.id,
      status: 'running',
      message: step.description || step.id,
      stepsCompleted: i,
      totalSteps,
    });

    const started = Date.now();
    try {
      await step.run(memory, ctx);
      run.stepMetas.push({
        stepId: step.id,
        kind: 'workflow',
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      });
      emitProgress(ctx, {
        agentId: agent.id,
        runId: run.id,
        stepId: step.id,
        status: 'complete',
        message: step.description || step.id,
        stepsCompleted: i + 1,
        totalSteps,
      });
    } catch (error) {
      run.stepMetas.push({
        stepId: step.id,
        kind: 'workflow',
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
        detail: error instanceof Error ? error.message : String(error),
      });
      emitProgress(ctx, {
        agentId: agent.id,
        runId: run.id,
        stepId: step.id,
        status: 'failed',
        message: step.description || step.id,
        stepsCompleted: i,
        totalSteps,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return agent.finalize(memory, input, ctx);
}

// ============================================================================
// TOOL-CALLING AGENT
// ============================================================================

async function runToolAgent<TInput, TOutput>(
  agent: ToolAgentDefinition<TInput, TOutput>,
  input: TInput,
  ctx: AgentContext,
  run: AgentRunRecord
): Promise<TOutput> {
  const memory = createAgentMemory({ __input: input });
  const toolCtx: AgentToolContext = { ...ctx, runId: run.id, memory };
  const toolsByName = new Map(agent.tools.map((t) => [t.name, t]));

  if (!toolsByName.has(agent.resultToolName)) {
    throw new AgentError(
      agent.id,
      'INVALID_AGENT',
      `Result tool "${agent.resultToolName}" is not registered on agent "${agent.id}"`
    );
  }

  const maxSteps = ctx.budget?.maxSteps ?? DEFAULT_MAX_STEPS;
  const instructions =
    typeof agent.instructions === 'function' ? agent.instructions(input, ctx) : agent.instructions;

  const openAITools = agent.tools.map(toOpenAITool);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: instructions },
    { role: 'user', content: agent.buildUserMessage(input, ctx) },
  ];

  let finalOutput: TOutput | undefined;

  for (let step = 0; step < maxSteps; step++) {
    assertNotCancelled(ctx, agent.id);
    assertWithinDuration(ctx, agent.id, run.startedAt);
    assertTokenBudget(ctx, agent.id, run.totalTokensUsed);

    emitProgress(ctx, {
      agentId: agent.id,
      runId: run.id,
      stepId: `turn-${step + 1}`,
      status: 'running',
      message: `Thinking (step ${step + 1})`,
      stepsCompleted: step,
      totalSteps: -1,
    });

    const { message, meta } = await executeChatCompletion({
      stage: 'agentTurn',
      taskType: agent.taskType ?? 'strategy',
      messages,
      tools: openAITools,
      maxTokens: 4096,
    });

    addTokens(run.totalTokensUsed, meta.tokensUsed);
    run.stepMetas.push({
      stepId: `llm-turn-${step + 1}`,
      kind: 'llm',
      model: meta.model,
      tokensUsed: meta.tokensUsed,
      durationMs: meta.durationMs,
      timestamp: meta.timestamp,
    });

    messages.push({
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls,
    });

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Nudge the model to finish via the result tool
      messages.push({
        role: 'user',
        content: `You must finish by calling the "${agent.resultToolName}" tool with the final result. Do not reply with plain text.`,
      });
      continue;
    }

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;

      const tool = toolsByName.get(call.function.name);
      if (!tool) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: `Unknown tool: ${call.function.name}` }),
        });
        continue;
      }

      const toolStarted = Date.now();
      emitProgress(ctx, {
        agentId: agent.id,
        runId: run.id,
        stepId: tool.name,
        status: 'running',
        message: tool.description,
        stepsCompleted: step,
        totalSteps: -1,
      });

      let toolResult: unknown;
      try {
        const rawArgs = safeParseJson(call.function.arguments);
        const parsed = tool.inputSchema.safeParse(rawArgs);
        if (!parsed.success) {
          toolResult = {
            error: 'Invalid tool arguments',
            details: parsed.error.flatten(),
          };
        } else {
          toolResult = await tool.execute(parsed.data, toolCtx);
        }
      } catch (error) {
        toolResult = {
          error: error instanceof Error ? error.message : String(error),
        };
      }

      run.stepMetas.push({
        stepId: `tool:${tool.name}`,
        kind: 'tool',
        durationMs: Date.now() - toolStarted,
        timestamp: new Date().toISOString(),
        detail: tool.name === agent.resultToolName ? 'result' : undefined,
      });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: truncateJson(toolResult),
      });

      emitProgress(ctx, {
        agentId: agent.id,
        runId: run.id,
        stepId: tool.name,
        status: 'complete',
        message: tool.description,
        stepsCompleted: step + 1,
        totalSteps: -1,
      });

      if (tool.name === agent.resultToolName && !(toolResult as { error?: string })?.error) {
        const validated = agent.outputSchema.safeParse(toolResult);
        if (!validated.success) {
          messages.push({
            role: 'user',
            content: `The "${agent.resultToolName}" payload failed validation. Fix and call it again. Errors: ${JSON.stringify(validated.error.flatten())}`,
          });
          continue;
        }
        finalOutput = validated.data;
      }
    }

    if (finalOutput !== undefined) {
      return finalOutput;
    }
  }

  throw new AgentBudgetExceededError(
    agent.id,
    `Agent "${agent.id}" exceeded maxSteps (${maxSteps}) without calling "${agent.resultToolName}"`
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function toOpenAITool(tool: AgentTool): OpenAI.Chat.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToOpenAIParameters(tool.inputSchema),
    },
  };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function truncateJson(value: unknown, maxChars = 24_000): string {
  const json = JSON.stringify(value ?? null);
  if (json.length <= maxChars) return json;
  return JSON.stringify({
    truncated: true,
    preview: json.slice(0, maxChars),
    note: 'Tool result truncated for context window; use a more specific tool if you need detail.',
  });
}

function addTokens(total: AgentTokenUsage, delta?: AgentTokenUsage): void {
  if (!delta) return;
  total.input += delta.input;
  total.output += delta.output;
}

function emitProgress(ctx: AgentContext, event: AgentProgressEvent): void {
  ctx.onProgress?.(event);
}

function assertNotCancelled(
  ctx: AgentContext,
  agentId: AgentDefinition<unknown, unknown>['id']
): void {
  if (ctx.signal?.aborted) {
    throw new AgentCancelledError(agentId);
  }
}

function assertWithinDuration(
  ctx: AgentContext,
  agentId: AgentDefinition<unknown, unknown>['id'],
  startedAt: string
): void {
  const maxDuration = ctx.budget?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const elapsed = Date.now() - new Date(startedAt).getTime();
  if (elapsed > maxDuration) {
    throw new AgentBudgetExceededError(
      agentId,
      `Agent "${agentId}" exceeded maxDurationMs (${maxDuration})`
    );
  }
}

function assertTokenBudget(
  ctx: AgentContext,
  agentId: AgentDefinition<unknown, unknown>['id'],
  used: AgentTokenUsage
): void {
  const maxTokens = ctx.budget?.maxTokens;
  if (maxTokens == null) return;
  if (used.input + used.output >= maxTokens) {
    throw new AgentBudgetExceededError(
      agentId,
      `Agent "${agentId}" exceeded maxTokens (${maxTokens})`
    );
  }
}
