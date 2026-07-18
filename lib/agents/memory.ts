import type { AgentMemory } from '@/types/agents';

/**
 * Simple in-run key/value memory shared across tools and workflow steps.
 * Not persisted — callers that need durability should write to their domain DB.
 */
export function createAgentMemory(initial?: Record<string, unknown>): AgentMemory {
  const store = new Map<string, unknown>(Object.entries(initial ?? {}));

  return {
    get<T = unknown>(key: string): T | undefined {
      return store.get(key) as T | undefined;
    },
    set(key: string, value: unknown): void {
      store.set(key, value);
    },
    entries(): Record<string, unknown> {
      return Object.fromEntries(store.entries());
    },
  };
}
