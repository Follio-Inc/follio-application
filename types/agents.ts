/**
 * Follio Agent Platform — shared contracts
 *
 * Product agents (portfolio, resume parse, snap view, …) all run through
 * the same runtime. Keep domain logic in services/agents/*; keep the
 * execution model here and in lib/agents.
 */

import type { z } from 'zod';

/**
 * Stable IDs for product agents. Extend as new agents ship.
 *
 * Deliberately closed: adding an id here is how a new agent gets registered
 * for telemetry, so `AgentRun` rows can never be grouped under a typo or
 * merged with another agent's history.
 */
export type AgentId =
  | 'portfolio-generation'
  | 'resume-parse'
  | 'snap-view'
  | 'content-transform'
  | 'resume-agent'
  // Phase 2B multi-agent resume assistant. The orchestrator delegates to the
  // two specialists; each is an independently runnable agent with its own
  // tools, output schema and budget, and its own AgentRun rows.
  | 'resume-orchestrator'
  | 'resume-evaluation'
  | 'resume-jd-match';

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

  // ── Delegation (set by `agentAsTool`, not by domain callers) ──

  /** Run id of the parent that delegated to this run. Absent at the root. */
  parentRunId?: string;
  /** Run id of the whole execution. Equals this run's own id at the root. */
  rootRunId?: string;
  /**
   * Blackboard shared by every agent in one execution. Namespaced per agent
   * and scoped to the pinned resume — see `AgentSharedState`.
   */
  shared?: AgentSharedState;
  /** The raw blackboard. Used by `agentAsTool`; domain code wants `shared`. */
  sharedStore?: SharedStateStoreApi;
  /**
   * Depth and cumulative spend across the whole execution tree. Shared by
   * reference, so every run in the tree sees the same counters.
   */
  delegation?: DelegationState;
}

// ============================================================================
// SHARED STATE
// ============================================================================

/** One value on the blackboard, with the provenance needed to police reads. */
export interface SharedStateEntry {
  value: unknown;
  /** Which agent wrote it. */
  agentId: string;
  /** Which run wrote it. */
  runId: string;
  /**
   * The resume this value describes, taken from the writer's pinned resume.
   * A reader pinned to a different resume cannot see it.
   */
  resumeId?: string;
  /** ISO timestamp of the write. */
  at: string;
}

/**
 * Backing store for the blackboard, implemented by lib/agents/shared-state.
 *
 * Declared here as an interface so `AgentContext` can carry the store without
 * types/ importing from lib/. Domain code should use `AgentSharedState`, which
 * is the namespaced view; this raw handle exists so `agentAsTool` can file a
 * child's output under the child's own namespace.
 */
export interface SharedStateStoreApi {
  write(entry: SharedStateEntry, key: string): void;
  read(agentId: string, key: string): SharedStateEntry | undefined;
  all(): Array<[string, SharedStateEntry]>;
}

/**
 * A per-agent view of the execution-wide blackboard.
 *
 * Writes always land in the calling agent's own namespace — an agent cannot
 * write into another agent's namespace, so no agent can forge a finding and
 * attribute it to a different one. Reads of another namespace are explicit
 * (`getFrom`), and any entry written while a different resume was pinned is
 * invisible, so one user's resume data cannot reach a run analysing another.
 */
export interface AgentSharedState {
  /** Write under the calling agent's namespace. */
  set(key: string, value: unknown): void;
  /** Read from the calling agent's own namespace. */
  get<T = unknown>(key: string): T | undefined;
  /** Read from another agent's namespace, subject to the resume scope. */
  getFrom<T = unknown>(agentId: string, key: string): T | undefined;
  /** Everything this caller may see, keyed "agentId:key". For audit/debug. */
  entries(): Record<string, SharedStateEntry>;
}

// ============================================================================
// DELEGATION LIMITS
// ============================================================================

/** Hard limits on one multi-agent execution. Enforced in code, not in prompts. */
export interface DelegationLimits {
  /** How deep delegation may nest. Depth 0 is the root agent. */
  maxDepth: number;
  /** Total child runs allowed across the whole execution. */
  maxChildRuns: number;
  /** Times any single delegation tool may be invoked within one parent run. */
  maxCallsPerTool: number;
  /** Cumulative token ceiling across every run in the tree. */
  maxTotalTokens?: number;
  /** Wall-clock ceiling for the whole tree. */
  maxTotalDurationMs?: number;
}

/**
 * Mutable counters for one execution.
 *
 * Held in its own object so it can be shared **by reference** down the tree: a
 * child's spend has to be visible to its parent and to its siblings, which a
 * spread copy of plain number fields would silently break.
 */
export interface DelegationCounters {
  /** Child runs started so far, across the whole tree. */
  childRuns: number;
  /** Invocations per delegation tool, keyed "parentRunId:toolName". */
  callsPerTool: Map<string, number>;
  /** Tokens spent by every run in the tree. */
  tokensUsed: AgentTokenUsage;
  /** Epoch ms when the root run started. */
  startedAtMs: number;
}

/**
 * One run's view of the execution: the shared ceilings and counters, plus the
 * depth of this particular run, which is the only per-run part.
 */
export interface DelegationState {
  limits: DelegationLimits;
  /** Depth of the run holding this context. 0 at the root. */
  depth: number;
  /** Shared by reference with every other run in the tree. */
  counters: DelegationCounters;
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
  /** Set when this run was delegated to by another run. */
  parentRunId?: string;
  /** The root of this execution tree. Equals `id` for a top-level run. */
  rootRunId?: string;
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
  /** The agent whose run this tool is executing in. */
  agentId: AgentId;
  /** Private to this run. Never shared with a parent or a child. */
  memory: AgentMemory;
  /**
   * Shared with the rest of the execution, namespaced per agent. Present only
   * when the run was started with a blackboard — a plain single-agent run has
   * none, which is why it is optional.
   */
  shared?: AgentSharedState;
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
