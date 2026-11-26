/**
 * Limits on one multi-agent execution.
 *
 * Every rule here is enforced in code. A prompt telling a model "do not
 * delegate more than twice" is a request; this is the thing that actually
 * stops it, which matters because the failure mode — an agent delegating to
 * itself, or two agents handing work back and forth — spends real money and
 * does not terminate on its own.
 *
 * Four separate ceilings, because they fail in different ways:
 *   - depth stops recursion;
 *   - child-run count stops a wide fan-out;
 *   - per-tool call count stops one parent hammering one specialist;
 *   - cumulative tokens and wall-clock stop a tree that is making progress
 *     but costing more than the whole request is worth.
 *
 * The per-run `AgentBudget` is unchanged and still applies to each run on its
 * own. These are the tree-wide ceilings that no single run can see.
 */

import { AgentError } from '@/lib/agents/errors';

import type {
  AgentContext,
  AgentId,
  AgentTokenUsage,
  DelegationLimits,
  DelegationState,
} from '@/types/agents';

/**
 * Defaults sized for the architecture we are building toward: an orchestrator
 * that delegates to specialists, which do the work themselves rather than
 * delegating further. Depth 2 allows orchestrator → specialist and leaves one
 * level of head-room; it does not allow a specialist chain to keep nesting.
 */
export const DEFAULT_DELEGATION_LIMITS: DelegationLimits = {
  maxDepth: 2,
  maxChildRuns: 8,
  maxCallsPerTool: 3,
  maxTotalTokens: 200_000,
  maxTotalDurationMs: 240_000,
};

export class AgentDelegationError extends AgentError {
  constructor(agentId: AgentId, detail: string) {
    super(agentId, 'DELEGATION_REFUSED', detail);
    this.name = 'AgentDelegationError';
  }
}

/** Start tracking a new execution tree. Called for the root run only. */
export function createDelegationState(overrides: Partial<DelegationLimits> = {}): DelegationState {
  return {
    limits: { ...DEFAULT_DELEGATION_LIMITS, ...overrides },
    depth: 0,
    counters: {
      childRuns: 0,
      callsPerTool: new Map<string, number>(),
      tokensUsed: { input: 0, output: 0 },
      startedAtMs: Date.now(),
    },
  };
}

/**
 * The state a child run inherits.
 *
 * `limits` and `counters` are passed by reference on purpose — spend anywhere
 * in the tree has to be visible everywhere in it. Only `depth` is per-run, so
 * it is the only field that changes.
 */
export function childDelegationState(parent: DelegationState): DelegationState {
  return { limits: parent.limits, counters: parent.counters, depth: parent.depth + 1 };
}

/** Add one run's usage to the tree total. Safe to call with no delegation. */
export function recordTreeTokens(ctx: AgentContext, delta?: AgentTokenUsage): void {
  if (!ctx.delegation || !delta) return;
  ctx.delegation.counters.tokensUsed.input += delta.input;
  ctx.delegation.counters.tokensUsed.output += delta.output;
}

/**
 * Decide whether `parent` may start one more child run through `toolName`.
 *
 * Throws rather than returning false: a refused delegation is a failure of the
 * parent's plan, and the runtime's tool wrapper turns the throw into a result
 * the model can read and adapt to. Counters are only advanced once every check
 * has passed, so a refused attempt does not consume quota.
 */
export function assertCanDelegate(options: {
  state: DelegationState;
  parentAgentId: AgentId;
  childAgentId: AgentId;
  toolName: string;
  parentRunId: string;
}): void {
  const { state, parentAgentId, childAgentId, toolName, parentRunId } = options;
  const { limits } = state;

  const childDepth = state.depth + 1;
  if (childDepth > limits.maxDepth) {
    throw new AgentDelegationError(
      parentAgentId,
      `Delegation to "${childAgentId}" refused: depth ${childDepth} exceeds maxDepth ` +
        `(${limits.maxDepth}). Finish the work with the tools you already have.`
    );
  }

  if (state.counters.childRuns >= limits.maxChildRuns) {
    throw new AgentDelegationError(
      parentAgentId,
      `Delegation to "${childAgentId}" refused: this request has already run ` +
        `${state.counters.childRuns} agents (limit ${limits.maxChildRuns}).`
    );
  }

  // Keyed by parent run as well as tool, so two different parents each get
  // their own allowance rather than sharing one counter.
  const callKey = `${parentRunId}:${toolName}`;
  const calls = state.counters.callsPerTool.get(callKey) ?? 0;
  if (calls >= limits.maxCallsPerTool) {
    throw new AgentDelegationError(
      parentAgentId,
      `Delegation refused: "${toolName}" has already been called ${calls} times in this run ` +
        `(limit ${limits.maxCallsPerTool}). Use what it returned instead of calling it again.`
    );
  }

  assertTreeBudget(state, parentAgentId);

  state.counters.childRuns += 1;
  state.counters.callsPerTool.set(callKey, calls + 1);
}

/**
 * The cumulative token ceiling.
 *
 * Checked at delegation boundaries only, so reaching it **refuses new work**
 * rather than killing work already in flight. The run that is mid-flight is
 * still bounded by its own `AgentBudget`, so the worst overrun is the ceiling
 * plus one run's budget — bounded and predictable — and in exchange the
 * parent gets to finish and return a degraded but real answer instead of the
 * whole request failing and losing everything the tree already paid for.
 */
export function assertTreeTokens(state: DelegationState, agentId: AgentId): void {
  const { limits } = state;
  const { tokensUsed } = state.counters;
  if (limits.maxTotalTokens === undefined) return;

  const spent = tokensUsed.input + tokensUsed.output;
  if (spent >= limits.maxTotalTokens) {
    throw new AgentDelegationError(
      agentId,
      `This request has spent ${spent} tokens across all agents, reaching the limit of ` +
        `${limits.maxTotalTokens}. Finish with what you already have.`
    );
  }
}

/**
 * The cumulative wall-clock ceiling.
 *
 * Unlike tokens, this is a hard stop checked by the runtime between every
 * turn, anywhere in the tree. Time is what the user is actually waiting on,
 * and the serverless function has its own deadline regardless of what the
 * agents would like to do next — so there is nothing to be gained by letting
 * an over-time tree keep going.
 */
export function assertTreeDuration(state: DelegationState, agentId: AgentId): void {
  const { limits } = state;
  if (limits.maxTotalDurationMs === undefined) return;

  const elapsed = Date.now() - state.counters.startedAtMs;
  if (elapsed > limits.maxTotalDurationMs) {
    throw new AgentDelegationError(
      agentId,
      `This request has run for ${elapsed}ms across all agents, past the limit of ` +
        `${limits.maxTotalDurationMs}ms.`
    );
  }
}

/** Both cumulative ceilings. Used at delegation boundaries. */
export function assertTreeBudget(state: DelegationState, agentId: AgentId): void {
  assertTreeTokens(state, agentId);
  assertTreeDuration(state, agentId);
}
