/**
 * Execution-wide blackboard for multi-agent runs.
 *
 * One store is created for the root run and handed down to every delegated
 * child, so an orchestrator can read what its specialists found without the
 * findings having to survive a round trip through a model.
 *
 * Three rules are enforced here rather than in a prompt:
 *
 *   1. **Namespacing.** `set` always writes under the calling agent's own id.
 *      An agent cannot write into another agent's namespace, so no agent can
 *      plant a finding and have it attributed to a different one.
 *   2. **Resume scoping.** Every entry records the resume that was pinned when
 *      it was written. A reader pinned to a different resume cannot see it, so
 *      one resume's analysis can never be read back during another's — the
 *      property the Resume Agent's pin already gives a single run, extended
 *      across a tree.
 *   3. **Explicit cross-agent reads.** Reading another agent's namespace needs
 *      `getFrom(agentId, key)`. Nothing is picked up by accident.
 *
 * Private per-run memory (lib/agents/memory.ts) is untouched and is still not
 * shared with anyone: a child cannot see its parent's working notes, only what
 * the parent deliberately published here.
 */

import type { AgentSharedState, SharedStateEntry, SharedStateStoreApi } from '@/types/agents';

/**
 * Meta key holding the resume an execution is pinned to.
 *
 * Must stay equal to `SELECTED_RESUME_META_KEY` in
 * services/agents/resume/tools.ts, which is where the Resume Agent sets it.
 * It is duplicated rather than imported because lib/ must not depend on
 * services/; a test asserts the two stay in step.
 */
export const PINNED_RESUME_META_KEY = 'selectedResumeId';

/** Key under which an entry is filed. Namespacing is structural, not textual. */
function entryKey(agentId: string, key: string): string {
  return `${agentId}:${key}`;
}

/**
 * The backing store for one execution. Created once at the root and passed by
 * reference, so every scope sees the same data.
 */
export class SharedStateStore implements SharedStateStoreApi {
  private readonly entries = new Map<string, SharedStateEntry>();

  write(entry: SharedStateEntry, key: string): void {
    this.entries.set(entryKey(entry.agentId, key), entry);
  }

  read(agentId: string, key: string): SharedStateEntry | undefined {
    return this.entries.get(entryKey(agentId, key));
  }

  all(): Array<[string, SharedStateEntry]> {
    return [...this.entries.entries()];
  }

  /** Total entries, for tests and audit. */
  get size(): number {
    return this.entries.size;
  }
}

/** What a scope is allowed to do, fixed by the runtime when the run starts. */
export interface SharedStateScope {
  /** The agent this view belongs to. Writes are filed under it. */
  agentId: string;
  /** The run this view belongs to, recorded on every write. */
  runId: string;
  /** The resume pinned for this run, or undefined when none is. */
  resumeId?: string;
}

/**
 * An entry is visible when it is not resume-scoped, or when it was written
 * under the same resume the reader is pinned to.
 *
 * A reader with no pinned resume deliberately cannot see resume-scoped
 * entries: "no pin" is the weaker position, and it must not act as a wildcard
 * that reads everything.
 */
function isVisibleTo(entry: SharedStateEntry, scope: SharedStateScope): boolean {
  if (entry.resumeId === undefined) return true;
  return entry.resumeId === scope.resumeId;
}

/**
 * Build the per-agent view handed to one run's tools.
 *
 * The scope is captured here, from trusted context — nothing a tool or a model
 * passes can widen it.
 */
export function createSharedState(
  store: SharedStateStoreApi,
  scope: SharedStateScope
): AgentSharedState {
  return {
    set(key: string, value: unknown): void {
      store.write(
        {
          value,
          agentId: scope.agentId,
          runId: scope.runId,
          resumeId: scope.resumeId,
          at: new Date().toISOString(),
        },
        key
      );
    },

    get<T = unknown>(key: string): T | undefined {
      const entry = store.read(scope.agentId, key);
      if (!entry || !isVisibleTo(entry, scope)) return undefined;
      return entry.value as T;
    },

    getFrom<T = unknown>(agentId: string, key: string): T | undefined {
      const entry = store.read(agentId, key);
      if (!entry || !isVisibleTo(entry, scope)) return undefined;
      return entry.value as T;
    },

    entries(): Record<string, SharedStateEntry> {
      const visible: Record<string, SharedStateEntry> = {};
      for (const [key, entry] of store.all()) {
        if (isVisibleTo(entry, scope)) visible[key] = entry;
      }
      return visible;
    },
  };
}
