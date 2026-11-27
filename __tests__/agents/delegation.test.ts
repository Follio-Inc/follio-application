/**
 * Phase 2A — agent-to-agent delegation.
 *
 * Nothing about the agent machinery is mocked here. Two real agent
 * definitions run on the real runtime, through the real `agentAsTool`, with
 * real tools, real Zod validation and the real delegation ledger. Only the LLM
 * turn and the database are replaced, because those are the two things that
 * cost money and state.
 *
 * That matters for the claim being made: these tests can distinguish a child
 * agent that actually ran — its own run row, its own tools executing, its own
 * output schema validated — from a parent that merely emitted text shaped like
 * a delegation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type OpenAI from 'openai';

// ── LLM seam ────────────────────────────────────────────────────────────────

interface ScriptedTurn {
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
}

/** Scripts keyed by a marker string placed in each agent's instructions. */
let scripts: Record<string, ScriptedTurn[]> = {};
/** Every (agent marker, messages) pair the runtime sent, in order. */
let turnLog: Array<{ agent: string; messages: OpenAI.Chat.ChatCompletionMessageParam[] }> = [];
/** Token usage returned for each LLM turn; raised in the budget tests. */
let tokensPerTurn = { input: 100, output: 40 };
/** Optional hook fired as each turn is requested, used by the cancellation test. */
let onTurn: ((marker: string) => void) | undefined;

const PARENT_MARKER = 'TEST_PARENT_AGENT';
const CHILD_MARKER = 'TEST_CHILD_AGENT';
const GRANDCHILD_MARKER = 'TEST_GRANDCHILD_AGENT';

function markerOf(messages: OpenAI.Chat.ChatCompletionMessageParam[]): string {
  const system = String(messages[0]?.content ?? '');
  for (const marker of [PARENT_MARKER, CHILD_MARKER, GRANDCHILD_MARKER]) {
    if (system.includes(marker)) return marker;
  }
  return 'UNKNOWN';
}

const executeChatCompletionMock = vi.fn(
  async (options: { messages: OpenAI.Chat.ChatCompletionMessageParam[] }) => {
    const marker = markerOf(options.messages);
    turnLog.push({ agent: marker, messages: structuredClone(options.messages) });
    onTurn?.(marker);

    const turn = scripts[marker]?.shift();
    if (!turn) throw new Error(`Scripted LLM ran out of turns for ${marker}`);

    return {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: turn.toolCalls.length > 0 ? turn.toolCalls : undefined,
      } as OpenAI.Chat.ChatCompletionMessage,
      meta: {
        model: 'gpt-4o',
        tokensUsed: { ...tokensPerTurn },
        durationMs: 1,
        timestamp: new Date().toISOString(),
      },
    };
  }
);

vi.mock('@/lib/ai-client', () => ({
  executeChatCompletion: (options: never) => executeChatCompletionMock(options),
  isAIAvailable: () => true,
}));

// ── Database seam ───────────────────────────────────────────────────────────

const agentRunUpsert = vi.fn();

vi.mock('@/lib/db', () => ({
  db: { agentRun: { upsert: (...args: unknown[]) => agentRunUpsert(...args) } },
}));

import { agentAsTool } from '@/lib/agents/agent-as-tool';
import { createDelegationState, DEFAULT_DELEGATION_LIMITS } from '@/lib/agents/delegation';
import { defineTool } from '@/lib/agents/define-tool';
import { runAgent } from '@/lib/agents/runtime';
import {
  createSharedState,
  PINNED_RESUME_META_KEY,
  SharedStateStore,
} from '@/lib/agents/shared-state';
import { SELECTED_RESUME_META_KEY } from '@/services/agents/resume/tools';

import type { AgentToolContext, DelegationLimits, ToolAgentDefinition } from '@/types/agents';

const RESUME_ID = 'resume_abc123';
const USER_ID = 'user_internal_1';

// ── A real child agent ──────────────────────────────────────────────────────

/** Records what the child's tool actually saw when it ran. */
let childToolSaw: Array<{ userId?: string; resumeId?: unknown; agentId: string }> = [];
/** Blackboard keys visible to the parent when it finished. */
let sharedKeysSeenByParent: string[] = [];

const childOutputSchema = z.object({
  finding: z.string(),
  resumeIdSeen: z.string(),
  evidenceCount: z.number(),
});

type ChildOutput = z.infer<typeof childOutputSchema>;
interface ChildInput {
  task: string;
  resumeId: string;
}

/** A genuine data tool: reads trusted context and publishes to the blackboard. */
const inspectResumeTool = defineTool({
  name: 'inspect_resume',
  description: 'Read the pinned resume and report what is there.',
  inputSchema: z.object({ resumeId: z.string().min(1) }),
  execute: async ({ resumeId }, ctx: AgentToolContext) => {
    childToolSaw.push({
      userId: ctx.userId,
      resumeId: ctx.meta?.[PINNED_RESUME_META_KEY],
      agentId: ctx.agentId,
    });

    if (!ctx.userId) throw new Error('No authenticated user in child tool context');

    const evidence = ['bullet-1', 'bullet-2'];
    ctx.shared?.set('evidence', evidence);
    ctx.memory.set('evidence', evidence);

    return { resumeId, evidence };
  },
});

const childResultTool = defineTool({
  name: 'submit_child_result',
  description: 'Finish the child run.',
  inputSchema: z.object({ finding: z.string().min(1) }),
  execute: async ({ finding }, ctx: AgentToolContext) => {
    const evidence = ctx.memory.get<string[]>('evidence');
    if (!evidence) return { error: 'Call inspect_resume before submitting.' };

    const pinned = ctx.meta?.[PINNED_RESUME_META_KEY];
    return {
      finding,
      resumeIdSeen: typeof pinned === 'string' ? pinned : '',
      evidenceCount: evidence.length,
    };
  },
});

const childAgent: ToolAgentDefinition<ChildInput, ChildOutput> = {
  kind: 'tool',
  id: 'content-transform',
  version: 'test-child-v1',
  instructions: `${CHILD_MARKER}: inspect the resume and report one finding.`,
  buildUserMessage: (input) => `Task: ${input.task} on ${input.resumeId}`,
  tools: [inspectResumeTool, childResultTool],
  resultToolName: 'submit_child_result',
  outputSchema: childOutputSchema,
};

// ── A grandchild, used only to prove depth is capped ─────────────────────────

const grandchildAgent: ToolAgentDefinition<{ task: string }, { ok: boolean }> = {
  kind: 'tool',
  id: 'snap-view',
  version: 'test-grandchild-v1',
  instructions: `${GRANDCHILD_MARKER}: do nothing of consequence.`,
  buildUserMessage: () => 'go',
  tools: [
    defineTool({
      name: 'submit_grandchild_result',
      description: 'Finish.',
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    }),
  ],
  resultToolName: 'submit_grandchild_result',
  outputSchema: z.object({ ok: z.boolean() }),
};

// ── The parent ──────────────────────────────────────────────────────────────

const parentOutputSchema = z.object({
  summary: z.string(),
  childFinding: z.string().optional(),
  childEvidenceCount: z.number().optional(),
});

/**
 * The delegation tool. Its schema deliberately accepts `userId` and `resumeId`
 * from the model so the tests can prove both are ignored in favour of trusted
 * context.
 */
function buildDelegateTool(options: { childBudget?: Record<string, number> } = {}) {
  return agentAsTool({
    agent: childAgent,
    name: 'delegate_to_child',
    description: 'Hand a task to the child agent.',
    inputSchema: z.object({
      task: z.string().min(1),
      resumeId: z.string().optional(),
      userId: z.string().optional(),
    }),
    buildInput: (args, trusted) => ({
      task: args.task,
      // Trusted pin, never args.resumeId.
      resumeId: trusted.resumeId ?? '',
    }),
    budget: options.childBudget ?? { maxSteps: 6, maxTokens: 50_000, maxDurationMs: 30_000 },
    publishAs: 'childResult',
  });
}

const parentResultTool = defineTool({
  name: 'submit_parent_result',
  description: 'Finish the parent run.',
  inputSchema: z.object({ summary: z.string().min(1) }),
  execute: async ({ summary }, ctx: AgentToolContext) => {
    sharedKeysSeenByParent = Object.keys(ctx.shared?.entries() ?? {});
    // Read the child's published output from the blackboard rather than from
    // anything the model retyped.
    const published = ctx.shared?.getFrom<ChildOutput>('content-transform', 'childResult');
    return {
      summary,
      ...(published
        ? { childFinding: published.finding, childEvidenceCount: published.evidenceCount }
        : {}),
    };
  },
});

function buildParentAgent(extraTools: ReturnType<typeof buildDelegateTool>[] = []) {
  const agent: ToolAgentDefinition<{ goal: string }, z.infer<typeof parentOutputSchema>> = {
    kind: 'tool',
    id: 'resume-agent',
    version: 'test-parent-v1',
    instructions: `${PARENT_MARKER}: delegate when useful, then finish.`,
    buildUserMessage: (input) => `Goal: ${input.goal}`,
    tools: [...(extraTools.length ? extraTools : [buildDelegateTool()]), parentResultTool],
    resultToolName: 'submit_parent_result',
    outputSchema: parentOutputSchema,
  };
  return agent;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

let callCounter = 0;
function call(
  name: string,
  args: Record<string, unknown> = {}
): OpenAI.Chat.ChatCompletionMessageToolCall {
  callCounter += 1;
  return {
    id: `call_${callCounter}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  } as OpenAI.Chat.ChatCompletionMessageToolCall;
}

function runParent(
  agent: ReturnType<typeof buildParentAgent>,
  overrides: {
    limits?: Partial<DelegationLimits>;
    signal?: AbortSignal;
    meta?: Record<string, unknown>;
  } = {}
) {
  return runAgent(
    agent,
    { goal: 'evaluate this resume' },
    {
      userId: USER_ID,
      signal: overrides.signal,
      meta: overrides.meta ?? { [SELECTED_RESUME_META_KEY]: RESUME_ID },
      budget: { maxSteps: 10, maxTokens: 500_000, maxDurationMs: 60_000 },
      delegation: createDelegationState(overrides.limits),
    }
  );
}

/** All persisted run rows, in write order. */
function persistedRuns(): Array<Record<string, unknown>> {
  return agentRunUpsert.mock.calls
    .map((args) => (args[0] as { create?: Record<string, unknown> }).create)
    .filter((create): create is Record<string, unknown> => Boolean(create));
}

/** The tool results handed back to a given agent, as raw JSON text. */
function toolResultsFor(marker: string): string {
  return JSON.stringify(
    turnLog
      .filter((t) => t.agent === marker)
      .flatMap((t) => t.messages.filter((m) => m.role === 'tool'))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  scripts = {};
  turnLog = [];
  childToolSaw = [];
  sharedKeysSeenByParent = [];
  callCounter = 0;
  tokensPerTurn = { input: 100, output: 40 };
  onTurn = undefined;
});

// ============================================================================

describe('a parent delegating to a real child agent', () => {
  beforeEach(() => {
    scripts = {
      [PARENT_MARKER]: [
        { toolCalls: [call('delegate_to_child', { task: 'assess clarity' })] },
        { toolCalls: [call('submit_parent_result', { summary: 'Done.' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'Bullets are concrete.' })] },
      ],
    };
  });

  it('runs the child as its own run, with its own tools', async () => {
    const { output, run } = await runParent(buildParentAgent());

    expect(run.status).toBe('succeeded');

    // The child's LLM turns really happened, separately from the parent's.
    expect(turnLog.filter((t) => t.agent === CHILD_MARKER)).toHaveLength(2);
    // The child's data tool really executed.
    expect(childToolSaw).toHaveLength(1);

    // And the parent received the child's validated output, not prose.
    expect(output.childFinding).toBe('Bullets are concrete.');
    expect(output.childEvidenceCount).toBe(2);
  });

  it('returns the child output to the parent as a structured tool result', async () => {
    await runParent(buildParentAgent());

    const parentSaw = toolResultsFor(PARENT_MARKER);
    expect(parentSaw).toContain('Bullets are concrete.');
    // Tagged with which agent and which run produced it.
    expect(parentSaw).toContain('content-transform');
    expect(parentSaw).toMatch(/_runId/);
  });

  it('validates the child output against the child schema', async () => {
    // A child that finishes without its data tool fails its own result tool,
    // so the parent never sees a half-formed finding.
    scripts[CHILD_MARKER] = [
      { toolCalls: [call('submit_child_result', { finding: 'guessed' })] },
      { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_child_result', { finding: 'grounded' })] },
    ];

    const { output } = await runParent(buildParentAgent());

    expect(output.childFinding).toBe('grounded');
    expect(output.childEvidenceCount).toBe(2);
  });

  it('records parent/child correlation on the persisted runs', async () => {
    const { run } = await runParent(buildParentAgent());

    const runs = persistedRuns();
    const parentRow = runs.find((r) => r.agentId === 'resume-agent');
    const childRow = runs.find((r) => r.agentId === 'content-transform');

    expect(parentRow).toBeDefined();
    expect(childRow).toBeDefined();

    // Parent is the root of its own tree.
    expect(parentRow!.parentRunId).toBeNull();
    expect(parentRow!.rootRunId).toBe(run.id);

    // Child points at the parent, and shares the root.
    expect(childRow!.parentRunId).toBe(run.id);
    expect(childRow!.rootRunId).toBe(run.id);
  });
});

describe('trusted context propagation', () => {
  beforeEach(() => {
    scripts = {
      [PARENT_MARKER]: [
        {
          toolCalls: [
            // The model tries to redirect the child at another user's resume.
            call('delegate_to_child', {
              task: 'assess',
              resumeId: 'someone_elses_resume',
              userId: 'attacker',
            }),
          ],
        },
        { toolCalls: [call('submit_parent_result', { summary: 'Done.' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'ok' })] },
      ],
    };
  });

  it('gives the child the authenticated user, never the model-supplied one', async () => {
    await runParent(buildParentAgent());

    expect(childToolSaw[0].userId).toBe(USER_ID);
    expect(childToolSaw[0].userId).not.toBe('attacker');
  });

  it('gives the child the pinned resume, never the model-supplied one', async () => {
    const { output } = await runParent(buildParentAgent());

    expect(childToolSaw[0].resumeId).toBe(RESUME_ID);
    // The child's own result reports the pin it actually ran under.
    expect(output.childFinding).toBe('ok');

    const childMessages = JSON.stringify(turnLog.filter((t) => t.agent === CHILD_MARKER));
    expect(childMessages).toContain(RESUME_ID);
    expect(childMessages).not.toContain('someone_elses_resume');
  });

  it('runs the child under its own agent id, not the parent’s', async () => {
    await runParent(buildParentAgent());

    expect(childToolSaw[0].agentId).toBe('content-transform');
  });

  it('refuses to delegate at all when the run has no delegation state', async () => {
    scripts[PARENT_MARKER] = [
      { toolCalls: [call('delegate_to_child', { task: 'assess' })] },
      { toolCalls: [call('submit_parent_result', { summary: 'Could not delegate.' })] },
    ];

    // No `delegation` in context — an unbounded tree by construction.
    const { output } = await runAgent(
      buildParentAgent(),
      { goal: 'x' },
      {
        userId: USER_ID,
        meta: { [SELECTED_RESUME_META_KEY]: RESUME_ID },
        budget: { maxSteps: 6 },
      }
    );

    expect(turnLog.filter((t) => t.agent === CHILD_MARKER)).toHaveLength(0);
    expect(toolResultsFor(PARENT_MARKER)).toMatch(/not started with delegation enabled/i);
    expect(output.summary).toBe('Could not delegate.');
  });
});

describe('cancellation', () => {
  it('refuses to start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    scripts = {
      [PARENT_MARKER]: [{ toolCalls: [call('submit_parent_result', { summary: 'x' })] }],
    };

    await expect(runParent(buildParentAgent(), { signal: controller.signal })).rejects.toThrow(
      /cancelled/i
    );

    expect(turnLog).toHaveLength(0);
  });

  it('propagates an abort from the parent into the child', async () => {
    const controller = new AbortController();

    scripts = {
      [PARENT_MARKER]: [
        { toolCalls: [call('delegate_to_child', { task: 'assess' })] },
        { toolCalls: [call('submit_parent_result', { summary: 'never reached' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'never reached' })] },
      ],
    };

    // Abort while the parent is mid-turn, before it delegates.
    onTurn = (marker) => {
      if (marker === PARENT_MARKER) controller.abort();
    };

    await expect(runParent(buildParentAgent(), { signal: controller.signal })).rejects.toThrow(
      /cancelled/i
    );

    // The child inherited the same signal, so its run refused to start and its
    // tools never executed — cancellation crossed the agent boundary.
    expect(turnLog.filter((t) => t.agent === CHILD_MARKER)).toHaveLength(0);
    expect(childToolSaw).toHaveLength(0);
  });
});

describe('delegation limits', () => {
  it('caps how many times one delegation tool may be called', async () => {
    const limit = 2;
    scripts = {
      [PARENT_MARKER]: [
        { toolCalls: [call('delegate_to_child', { task: 'a' })] },
        { toolCalls: [call('delegate_to_child', { task: 'b' })] },
        { toolCalls: [call('delegate_to_child', { task: 'c' })] },
        { toolCalls: [call('submit_parent_result', { summary: 'Stopped.' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'one' })] },
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'two' })] },
      ],
    };

    const { run } = await runParent(buildParentAgent(), {
      limits: { maxCallsPerTool: limit },
    });

    expect(run.status).toBe('succeeded');
    // Exactly two child runs happened; the third was refused.
    expect(childToolSaw).toHaveLength(limit);
    expect(toolResultsFor(PARENT_MARKER)).toMatch(/already been called 2 times/i);
  });

  it('caps the total number of child runs in one execution', async () => {
    scripts = {
      [PARENT_MARKER]: [
        { toolCalls: [call('delegate_to_child', { task: 'a' })] },
        { toolCalls: [call('delegate_to_child', { task: 'b' })] },
        { toolCalls: [call('submit_parent_result', { summary: 'Stopped.' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'one' })] },
      ],
    };

    await runParent(buildParentAgent(), {
      limits: { maxChildRuns: 1, maxCallsPerTool: 5 },
    });

    expect(childToolSaw).toHaveLength(1);
    expect(toolResultsFor(PARENT_MARKER)).toMatch(/already run 1 agents/i);
  });

  it('stops a child from delegating past the depth limit', async () => {
    // Give the child its own delegation tool, so it can try to go deeper.
    const childWithDelegation: ToolAgentDefinition<ChildInput, ChildOutput> = {
      ...childAgent,
      tools: [
        inspectResumeTool,
        agentAsTool({
          agent: grandchildAgent,
          name: 'delegate_to_grandchild',
          description: 'Go one level deeper.',
          inputSchema: z.object({ task: z.string() }),
          buildInput: (args) => ({ task: args.task }),
        }),
        childResultTool,
      ],
    };

    const parent: ReturnType<typeof buildParentAgent> = {
      ...buildParentAgent(),
      tools: [
        agentAsTool({
          agent: childWithDelegation,
          name: 'delegate_to_child',
          description: 'Hand a task to the child agent.',
          inputSchema: z.object({ task: z.string() }),
          buildInput: (args, trusted) => ({ task: args.task, resumeId: trusted.resumeId ?? '' }),
          publishAs: 'childResult',
        }),
        parentResultTool,
      ],
    };

    scripts = {
      [PARENT_MARKER]: [
        { toolCalls: [call('delegate_to_child', { task: 'a' })] },
        { toolCalls: [call('submit_parent_result', { summary: 'Done.' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('delegate_to_grandchild', { task: 'deeper' })] },
        { toolCalls: [call('submit_child_result', { finding: 'stopped at depth' })] },
      ],
      [GRANDCHILD_MARKER]: [{ toolCalls: [call('submit_grandchild_result', {})] }],
    };

    const { output, run } = await runParent(parent, { limits: { maxDepth: 1 } });

    expect(run.status).toBe('succeeded');
    // The grandchild never ran.
    expect(turnLog.filter((t) => t.agent === GRANDCHILD_MARKER)).toHaveLength(0);
    expect(toolResultsFor(CHILD_MARKER)).toMatch(/exceeds maxDepth/i);
    expect(output.childFinding).toBe('stopped at depth');
  });

  it('stops the tree when the cumulative token ceiling is reached', async () => {
    // Each turn reports a large spend, so the ceiling is hit mid-tree.
    tokensPerTurn = { input: 4_000, output: 1_000 };

    scripts = {
      [PARENT_MARKER]: [
        { toolCalls: [call('delegate_to_child', { task: 'a' })] },
        { toolCalls: [call('delegate_to_child', { task: 'b' })] },
        { toolCalls: [call('submit_parent_result', { summary: 'Stopped on budget.' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'one' })] },
      ],
    };

    const { run } = await runParent(buildParentAgent(), {
      limits: { maxTotalTokens: 20_000, maxCallsPerTool: 5 },
    });

    expect(run.status).toBe('succeeded');
    expect(childToolSaw).toHaveLength(1);
    expect(toolResultsFor(PARENT_MARKER)).toMatch(/tokens across all agents/i);
  });

  it('counts a child’s tokens against the shared ledger', async () => {
    scripts = {
      [PARENT_MARKER]: [
        { toolCalls: [call('delegate_to_child', { task: 'a' })] },
        { toolCalls: [call('submit_parent_result', { summary: 'Done.' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'one' })] },
      ],
    };

    const delegation = createDelegationState();
    await runAgent(
      buildParentAgent(),
      { goal: 'x' },
      {
        userId: USER_ID,
        meta: { [SELECTED_RESUME_META_KEY]: RESUME_ID },
        budget: { maxSteps: 10 },
        delegation,
      }
    );

    // Four LLM turns in total: two parent, two child.
    const spent = delegation.counters.tokensUsed.input + delegation.counters.tokensUsed.output;
    expect(spent).toBe(4 * (100 + 40));
    expect(delegation.counters.childRuns).toBe(1);
  });

  it('ships defaults that bound depth, fan-out and repeats', () => {
    expect(DEFAULT_DELEGATION_LIMITS.maxDepth).toBeGreaterThan(0);
    expect(DEFAULT_DELEGATION_LIMITS.maxDepth).toBeLessThanOrEqual(3);
    expect(DEFAULT_DELEGATION_LIMITS.maxChildRuns).toBeGreaterThan(0);
    expect(DEFAULT_DELEGATION_LIMITS.maxCallsPerTool).toBeGreaterThan(0);
    expect(DEFAULT_DELEGATION_LIMITS.maxTotalTokens).toBeGreaterThan(0);
  });
});

describe('shared state', () => {
  beforeEach(() => {
    scripts = {
      [PARENT_MARKER]: [
        { toolCalls: [call('delegate_to_child', { task: 'assess' })] },
        { toolCalls: [call('submit_parent_result', { summary: 'Done.' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'ok' })] },
      ],
    };
  });

  it('lets the parent read a child’s published finding without a model round trip', async () => {
    const { output } = await runParent(buildParentAgent());

    // parentResultTool read this via shared.getFrom('content-transform', …).
    expect(output.childEvidenceCount).toBe(2);
  });

  it('keeps the pin key in step with the Resume Agent', () => {
    // lib/ cannot import services/, so the constant is duplicated. If one side
    // is renamed without the other, resume scoping silently stops matching.
    expect(PINNED_RESUME_META_KEY).toBe(SELECTED_RESUME_META_KEY);
  });

  it('gives a single-agent run no blackboard at all', async () => {
    let sawShared: unknown = 'unset';

    const soloTool = defineTool({
      name: 'submit_solo',
      description: 'Finish.',
      inputSchema: z.object({}),
      execute: async (_args, ctx: AgentToolContext) => {
        sawShared = ctx.shared;
        return { ok: true };
      },
    });

    scripts[PARENT_MARKER] = [{ toolCalls: [call('submit_solo', {})] }];

    const solo: ToolAgentDefinition<{ goal: string }, { ok: boolean }> = {
      kind: 'tool',
      id: 'resume-agent',
      version: 'test-solo-v1',
      instructions: `${PARENT_MARKER}: finish immediately.`,
      buildUserMessage: () => 'go',
      tools: [soloTool],
      resultToolName: 'submit_solo',
      outputSchema: z.object({ ok: z.boolean() }),
    };

    await runAgent(solo, { goal: 'x' }, { userId: USER_ID, budget: { maxSteps: 3 } });

    // No delegation requested, so no store and no view — existing agents are
    // byte-for-byte unaffected by Phase 2A.
    expect(sawShared).toBeUndefined();
  });
});

describe('shared-state isolation', () => {
  const RESUME_A = 'resume_a';
  const RESUME_B = 'resume_b';

  function scopeFor(agentId: string, resumeId?: string) {
    return { agentId, runId: `run_${agentId}`, resumeId };
  }

  it('files every write under the writing agent’s own namespace', () => {
    const store = new SharedStateStore();
    const evaluator = createSharedState(store, scopeFor('content-transform', RESUME_A));

    evaluator.set('finding', 'thin bullets');

    // Visible to the writer under its own namespace…
    expect(evaluator.get('finding')).toBe('thin bullets');

    // …and attributed to it, so a reader knows who said it.
    const entries = evaluator.entries();
    expect(entries['content-transform:finding'].agentId).toBe('content-transform');
  });

  it('does not let one agent write into another agent’s namespace', () => {
    const store = new SharedStateStore();
    const impostor = createSharedState(store, scopeFor('snap-view', RESUME_A));
    const victim = createSharedState(store, scopeFor('content-transform', RESUME_A));

    // The only write API files under the caller's own id, so this lands under
    // 'snap-view' no matter what the key is called.
    impostor.set('finding', 'forged');

    expect(victim.get('finding')).toBeUndefined();
    expect(victim.getFrom('snap-view', 'finding')).toBe('forged');
    expect(victim.getFrom('content-transform', 'finding')).toBeUndefined();
  });

  it('lets a parent read a child’s namespace explicitly', () => {
    const store = new SharedStateStore();
    const child = createSharedState(store, scopeFor('content-transform', RESUME_A));
    const parent = createSharedState(store, scopeFor('resume-agent', RESUME_A));

    child.set('evidence', ['a', 'b']);

    expect(parent.getFrom<string[]>('content-transform', 'evidence')).toEqual(['a', 'b']);
    // Nothing is picked up implicitly.
    expect(parent.get('evidence')).toBeUndefined();
  });

  it('hides entries written while a different resume was pinned', () => {
    const store = new SharedStateStore();
    const onResumeA = createSharedState(store, scopeFor('content-transform', RESUME_A));
    const onResumeB = createSharedState(store, scopeFor('resume-agent', RESUME_B));

    onResumeA.set('finding', 'about resume A');

    // The pin that protects a single run now protects the whole tree.
    expect(onResumeB.getFrom('content-transform', 'finding')).toBeUndefined();
    expect(onResumeB.entries()).toEqual({});
  });

  it('treats "no pin" as the weaker position, not a wildcard', () => {
    const store = new SharedStateStore();
    const pinned = createSharedState(store, scopeFor('content-transform', RESUME_A));
    const unpinned = createSharedState(store, scopeFor('resume-agent', undefined));

    pinned.set('finding', 'about resume A');
    unpinned.set('note', 'not about any resume');

    // An unpinned reader cannot see resume-scoped data…
    expect(unpinned.getFrom('content-transform', 'finding')).toBeUndefined();
    // …but unscoped data stays readable by anyone in the execution.
    expect(pinned.getFrom('resume-agent', 'note')).toBe('not about any resume');
  });

  it('keeps private per-run memory out of the blackboard', async () => {
    scripts = {
      [PARENT_MARKER]: [
        { toolCalls: [call('delegate_to_child', { task: 'assess' })] },
        { toolCalls: [call('submit_parent_result', { summary: 'Done.' })] },
      ],
      [CHILD_MARKER]: [
        { toolCalls: [call('inspect_resume', { resumeId: RESUME_ID })] },
        { toolCalls: [call('submit_child_result', { finding: 'ok' })] },
      ],
    };

    await runParent(buildParentAgent());

    // inspect_resume wrote 'evidence' to BOTH its private memory and the
    // blackboard. Only the blackboard copy crossed the agent boundary; the
    // child's `__input` never did.
    const published = sharedKeysSeenByParent;
    expect(published).toContain('content-transform:evidence');
    expect(published.some((key) => key.includes('__input'))).toBe(false);
  });
});
