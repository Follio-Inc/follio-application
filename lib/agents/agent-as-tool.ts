/**
 * `agentAsTool` — run one agent as a tool of another.
 *
 * This is the whole of agent-to-agent delegation. A parent agent registers the
 * returned `AgentTool` like any other tool; when the model calls it, a real
 * child run starts on the same runtime, with its own instructions, its own
 * tools, its own validated input and output schemas, its own per-run budget
 * and its own `AgentRun` row. The parent gets the child's **validated** output
 * back as a tool result and decides what to do with it.
 *
 * What the parent model controls: the task arguments, validated against
 * `inputSchema`, and whether to call the tool at all.
 *
 * What it cannot control, because this module takes these from the parent's
 * own context rather than from anything the model wrote:
 *
 *   - the authenticated `userId`;
 *   - `meta`, which carries the pinned resume id — so a child inherits the
 *     same pin and the existing `pinnedToSelectedResume` guard keeps working
 *     unchanged inside it;
 *   - the cancellation signal;
 *   - the delegation counters, so a child's spend lands on the same ledger.
 *
 * A child therefore cannot widen its own authority: the worst a parent model
 * can do is ask for a task it is already allowed to ask for.
 */

import { runAgent } from '@/lib/agents/runtime';
import {
  assertCanDelegate,
  AgentDelegationError,
  childDelegationState,
} from '@/lib/agents/delegation';
import { createSharedState, PINNED_RESUME_META_KEY } from '@/lib/agents/shared-state';
import { logger } from '@/lib/logger';

import type {
  AgentBudget,
  AgentContext,
  AgentDefinition,
  AgentRunRecord,
  AgentSharedState,
  AgentTool,
  AgentToolContext,
} from '@/types/agents';
import type { z } from 'zod';

const delegationLogger = logger.child({ source: 'agent-delegation' });

/**
 * Run facts a delegating tool may rely on. All of them come from the parent's
 * context, never from the model.
 */
export interface TrustedDelegationFacts {
  /** The authenticated Follio user id for the whole execution. */
  userId?: string;
  /** The resume pinned for this execution, when there is one. */
  resumeId?: string;
  /** The parent's meta bag, read-only. */
  meta: Readonly<Record<string, unknown>>;
  /** The blackboard, as the parent sees it. */
  shared?: AgentSharedState;
}

export interface AgentAsToolOptions<TSchema extends z.ZodType, TChildInput, TChildOutput> {
  /** The child to run. Any agent the runtime can run. */
  agent: AgentDefinition<TChildInput, TChildOutput>;
  /** Tool name shown to the parent model. */
  name: string;
  /** Tool description shown to the parent model. */
  description: string;
  /** What the parent model may supply. Validated by the runtime before this runs. */
  inputSchema: TSchema;
  /**
   * Build the child's input from the validated model arguments plus trusted
   * run facts. Put pinned values in from `trusted`, not from `args`, so the
   * model cannot redirect the child at another resume or another user.
   */
  buildInput: (args: z.infer<TSchema>, trusted: TrustedDelegationFacts) => TChildInput;
  /** Per-run budget for the child. The tree-wide ceilings still apply on top. */
  budget?: AgentBudget;
  /**
   * Shape the tool result the parent sees. Defaults to the child's output
   * plus its run id, so a parent can cite which run produced a finding.
   */
  summarize?: (output: TChildOutput, run: AgentRunRecord) => unknown;
  /**
   * Publish the child's output on the blackboard under the child's own
   * namespace and this key, so a later agent can read the finding without it
   * passing through a model.
   */
  publishAs?: string;
}

/** The pinned resume for a run, or undefined when none was pinned. */
function pinnedResumeId(ctx: AgentContext): string | undefined {
  const value = ctx.meta?.[PINNED_RESUME_META_KEY];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Wrap an agent as a tool its parent can call.
 *
 * Delegation refusals (depth, fan-out, repeat calls, tree budget) are thrown
 * as `AgentDelegationError`. The runtime catches a throwing tool and hands the
 * message back to the model as a tool result, so a parent that over-delegates
 * is told why and can finish with what it already has — the loop is closed by
 * the counters, not by the model's willingness to stop.
 */
export function agentAsTool<TSchema extends z.ZodType, TChildInput, TChildOutput>(
  options: AgentAsToolOptions<TSchema, TChildInput, TChildOutput>
): AgentTool {
  const { agent, name, description, inputSchema, buildInput, budget, summarize, publishAs } =
    options;

  return {
    name,
    description,
    inputSchema,
    execute: async (args: unknown, ctx: AgentToolContext): Promise<unknown> => {
      const delegation = ctx.delegation;
      if (!delegation) {
        // A delegating tool on a run that was never started with delegation
        // state would have no depth and no ledger — unbounded by construction.
        throw new AgentDelegationError(
          agent.id,
          `Tool "${name}" delegates to another agent, but this run was not started with ` +
            'delegation enabled. Start the parent with runAgent({ delegation: … }).'
        );
      }

      // Throws when a ceiling is reached; advances the counters otherwise.
      assertCanDelegate({
        state: delegation,
        parentAgentId: ctx.agentId,
        childAgentId: agent.id,
        toolName: name,
        parentRunId: ctx.runId,
      });

      const resumeId = pinnedResumeId(ctx);

      const trusted: TrustedDelegationFacts = {
        userId: ctx.userId,
        resumeId,
        meta: ctx.meta ?? {},
        shared: ctx.shared,
      };

      // `args` was already validated against `inputSchema` by the runtime.
      const childInput = buildInput(args as z.infer<TSchema>, trusted);

      delegationLogger.info('Delegating to child agent', {
        parentRunId: ctx.runId,
        childAgentId: agent.id,
        tool: name,
        depth: delegation.depth + 1,
      });

      // Identity, pins and cancellation are copied from the parent's context.
      // Nothing from `args` reaches this object.
      const childCtx: AgentContext = {
        requestId: ctx.requestId,
        userId: ctx.userId,
        profileId: ctx.profileId,
        signal: ctx.signal,
        onProgress: ctx.onProgress,
        meta: ctx.meta,
        budget,
        parentRunId: ctx.runId,
        rootRunId: ctx.rootRunId,
        // The store, not the parent's view: the runtime builds the child its
        // own view, scoped to the child's agent id, so the child cannot write
        // into its parent's namespace.
        sharedStore: ctx.sharedStore,
        // Same limits and counters, one level deeper.
        delegation: childDelegationState(delegation),
      };

      const { output, run } = await runAgent(agent, childInput, childCtx);

      if (publishAs && ctx.sharedStore) {
        // Filed under the child's namespace: the agent that produced the
        // finding is the one it is attributed to.
        createSharedState(ctx.sharedStore, {
          agentId: agent.id,
          runId: run.id,
          resumeId,
        }).set(publishAs, output);
      }

      return summarize
        ? summarize(output, run)
        : {
            ...(output as object),
            _agent: agent.id,
            _runId: run.id,
          };
    },
  };
}
