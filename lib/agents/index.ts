export { runAgent } from './runtime';
export { createAgentMemory } from './memory';
export { defineTool, zodToOpenAIParameters } from './define-tool';
export { AgentError, AgentBudgetExceededError, AgentCancelledError } from './errors';
export { persistAgentRun } from './persist-run';

// ── Multi-agent delegation (Phase 2A) ──
export { agentAsTool } from './agent-as-tool';
export type { AgentAsToolOptions, TrustedDelegationFacts } from './agent-as-tool';
export {
  AgentDelegationError,
  DEFAULT_DELEGATION_LIMITS,
  assertCanDelegate,
  assertTreeBudget,
  assertTreeDuration,
  assertTreeTokens,
  childDelegationState,
  createDelegationState,
  recordTreeTokens,
} from './delegation';
export { PINNED_RESUME_META_KEY, SharedStateStore, createSharedState } from './shared-state';
export type { SharedStateScope } from './shared-state';

export type {
  AgentId,
  AgentContext,
  AgentDefinition,
  AgentMemory,
  AgentProgressEvent,
  AgentRunRecord,
  AgentRunResult,
  AgentSharedState,
  AgentTool,
  DelegationCounters,
  DelegationLimits,
  DelegationState,
  SharedStateEntry,
  SharedStateStoreApi,
  ToolAgentDefinition,
  WorkflowAgentDefinition,
  WorkflowStep,
} from '@/types/agents';
