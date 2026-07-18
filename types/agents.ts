/**
 * Follio Agent Platform — shared contracts
 *
 * Product agents (portfolio, resume parse, snap view, …) all run through
 * the same runtime. Keep domain logic in services/agents/*; keep the
 * execution model here and in lib/agents.
 */

import type { z } from 'zod';

/** Stable IDs for product agents. Extend as new agents ship. */
export type AgentId = 'portfolio-generation' | 'resume-parse' | 'snap-view' | 'content-transform';

export type AgentRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type AgentStepStatus = 'running' | 'complete' | 'failed' | 'skipped';

export interface AgentBudget {
  /** Soft cap on LLM + tool iterations (tool-calling agents). */
  maxSteps?: number;
  /** Soft cap on total tokens for the run. */
  maxTokens?: number;
  /** Wall-clock limit. */
  maxDurationMs?: number;
}

export interface AgentContext {
  /** Correlation / request id for logs. */
  requestId?: string;
  userId?: string;
  profileId?: string;
  signal?: AbortSignal;
  budget?: AgentBudget;
  onProgress?: (progress: AgentProgressEvent) => void;
  /** Arbitrary bag for domain callers (templateId, skipAI, …). */
  meta?: Record<string, unknown>;
}

export interface AgentProgressEvent {
  agentId: AgentId;
  runId: string;
  stepId: string;
  status: AgentStepStatus;
  message: string;
  stepsCompleted: number;
  /** Estimated or known total; may be -1 when unknown (open tool loop). */
  totalSteps: number;
  error?: string;
}

export interface AgentTokenUsage {
  input: number;
  output: number;
}

export interface AgentStepMeta {
  stepId: string;
  kind: 'llm' | 'tool' | 'workflow' | 'system';
  model?: string;
  tokensUsed?: AgentTokenUsage;
  durationMs: number;
  timestamp: string;
  detail?: string;
}

export interface AgentRunRecord {
  id: string;
  agentId: AgentId;
  version: string;
  status: AgentRunStatus;
  stepMetas: AgentStepMeta[];
  totalTokensUsed: AgentTokenUsage;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface AgentRunResult<TOutput> {
  output: TOutput;
  run: AgentRunRecord;
}

/** Tool definition used by tool-calling agents. */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (input: unknown, ctx: AgentToolContext) => Promise<unknown>;
}

export interface AgentToolContext extends AgentContext {
  runId: string;
  memory: AgentMemory;
}

export interface AgentMemory {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  entries(): Record<string, unknown>;
}

/**
 * Workflow agent: deterministic ordered steps (snap-view, simple transforms).
 * Prefer this when the path is fixed and tools would add noise.
 */
export interface WorkflowAgentDefinition<TInput, TOutput> {
  kind: 'workflow';
  id: AgentId;
  version: string;
  steps: WorkflowStep[];
  /** Assemble final output from memory after steps complete. */
  finalize: (memory: AgentMemory, input: TInput, ctx: AgentContext) => Promise<TOutput> | TOutput;
  /** Optional deterministic fallback when AI is unavailable or the run fails. */
  fallback?: (input: TInput, ctx: AgentContext) => Promise<TOutput> | TOutput;
}

export interface WorkflowStep {
  id: string;
  description?: string;
  run: (memory: AgentMemory, ctx: AgentContext) => Promise<void>;
}

/**
 * Tool-calling agent: model decides which tools to invoke within a budget.
 * Prefer this when behavior should adapt to attached data (portfolio, etc.).
 */
export interface ToolAgentDefinition<TInput, TOutput> {
  kind: 'tool';
  id: AgentId;
  version: string;
  /** System instructions for the agent. */
  instructions: string | ((input: TInput, ctx: AgentContext) => string);
  /** Build the first user message from input. */
  buildUserMessage: (input: TInput, ctx: AgentContext) => string;
  tools: AgentTool[];
  /**
   * Name of the tool the agent must call to finish.
   * That tool's return value becomes the run output (validated by outputSchema).
   */
  resultToolName: string;
  outputSchema: z.ZodType<TOutput>;
  taskType?: 'extraction' | 'strategy' | 'creative';
  fallback?: (input: TInput, ctx: AgentContext) => Promise<TOutput> | TOutput;
}

export type AgentDefinition<TInput, TOutput> =
  | WorkflowAgentDefinition<TInput, TOutput>
  | ToolAgentDefinition<TInput, TOutput>;
