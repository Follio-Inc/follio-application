import type { AgentId } from '@/types/agents';

export class AgentError extends Error {
  readonly agentId: AgentId;
  readonly code: string;

  constructor(agentId: AgentId, code: string, message: string, cause?: unknown) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = 'AgentError';
    this.agentId = agentId;
    this.code = code;
  }
}

export class AgentBudgetExceededError extends AgentError {
  constructor(agentId: AgentId, detail: string) {
    super(agentId, 'BUDGET_EXCEEDED', detail);
    this.name = 'AgentBudgetExceededError';
  }
}

export class AgentCancelledError extends AgentError {
  constructor(agentId: AgentId) {
    super(agentId, 'CANCELLED', `Agent "${agentId}" was cancelled`);
    this.name = 'AgentCancelledError';
  }
}
