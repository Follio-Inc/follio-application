/**
 * Resume Agent — agent/tool integration.
 *
 * Unlike the route tests, these do NOT mock the agent. The real runtime loop,
 * the real tool registry, the real pinning wrapper and the real deterministic
 * matchers all run; only the LLM turn and the database are replaced.
 *
 * That makes these the tests that can tell a tool-driven agent apart from a
 * prompt: they script what the model asks for and then assert what the system
 * actually did — which tools it was offered, which ones really executed, what
 * the tools returned, and which of those values survived into the output.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type OpenAI from 'openai';

// ── LLM seam ────────────────────────────────────────────────────────────────

interface ScriptedTurn {
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
  content?: string | null;
}

let script: ScriptedTurn[] = [];
/** Every `tools` array the runtime offered the model, one entry per turn. */
let offeredToolNames: string[][] = [];
/** Every `messages` array the runtime sent, one entry per turn. */
let sentMessages: OpenAI.Chat.ChatCompletionMessageParam[][] = [];

const executeChatCompletionMock = vi.fn(
  async (options: {
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    tools?: OpenAI.Chat.ChatCompletionTool[];
  }) => {
    offeredToolNames.push(
      (options.tools ?? []).map((tool) => (tool as { function: { name: string } }).function.name)
    );
    sentMessages.push(structuredClone(options.messages));

    const turn = script.shift();
    if (!turn) throw new Error('Scripted LLM ran out of turns');

    return {
      message: {
        role: 'assistant',
        content: turn.content ?? null,
        tool_calls: turn.toolCalls.length > 0 ? turn.toolCalls : undefined,
      } as OpenAI.Chat.ChatCompletionMessage,
      meta: {
        model: 'gpt-4o',
        tokensUsed: { input: 100, output: 40 },
        durationMs: 5,
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

const profileFindFirst = vi.fn();
const agentRunUpsert = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    profile: { findFirst: (...args: unknown[]) => profileFindFirst(...args) },
    agentRun: { upsert: (...args: unknown[]) => agentRunUpsert(...args) },
  },
}));

import { runResumeAgent } from '@/services/agents/resume/resume.agent';

const RESUME_ID = 'resume_abc123';
const USER_ID = 'user_internal_1';

const BACKEND_JD = `Senior Backend Engineer
We need an engineer fluent in TypeScript who has run services on Kubernetes and
Docker in production. Terraform and GraphQL experience is required. You will
design APIs and own reliability for a large distributed platform.`;

/** The Prisma row `get_resume` reads, shaped as its include clause expects. */
function dbProfile() {
  return {
    id: RESUME_ID,
    handle: 'ada-lovelace',
    resumeTitle: 'Backend Engineer',
    firstName: 'Ada',
    middleName: null,
    lastName: 'Lovelace',
    headline: 'Senior Backend Engineer',
    summary: 'Builds APIs and data platforms.',
    location: 'San Francisco, CA',
    contactInfo: { email: 'ada@example.com', phone: null, website: null },
    workExperiences: [
      {
        id: 'exp1',
        company: 'Acme',
        role: 'Senior Backend Engineer',
        location: 'Remote',
        startDate: new Date('2021-01-01'),
        endDate: null,
        isCurrent: true,
        bullets: ['Designed REST APIs', 'Migrated services onto Kubernetes'],
        isVisible: true,
      },
    ],
    educations: [
      {
        id: 'edu1',
        institution: 'MIT',
        degree: 'BS',
        fieldOfStudy: 'Computer Science',
        startDate: new Date('2015-09-01'),
        endDate: new Date('2019-06-01'),
        isCurrent: false,
        isVisible: true,
      },
    ],
    skills: [
      { id: 's1', name: 'TypeScript', isVisible: true },
      { id: 's2', name: 'PostgreSQL', isVisible: true },
    ],
    skillGroups: [],
    projects: [
      {
        id: 'proj1',
        title: 'Ops Platform',
        description: 'Internal deploy tooling built with Docker.',
        url: null,
        techStack: ['TypeScript'],
        highlights: ['Cut deploy time in half'],
        isVisible: true,
      },
    ],
  };
}

let callCounter = 0;
function call(
  name: string,
  args: Record<string, unknown>
): OpenAI.Chat.ChatCompletionMessageToolCall {
  callCounter += 1;
  return {
    id: `call_${callCounter}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  } as OpenAI.Chat.ChatCompletionMessageToolCall;
}

/** The arguments the model supplies to the result tool. */
function submitArgs(overrides: Record<string, unknown> = {}) {
  return {
    summary: 'A backend engineer with one role and one project.',
    highlights: ['Designed REST APIs at Acme'],
    ...overrides,
  };
}

/** Names of the tools that really executed, read off the run's step metadata. */
function executedTools(run: { stepMetas: Array<{ stepId: string; kind: string }> }): string[] {
  return run.stepMetas
    .filter((step) => step.kind === 'tool')
    .map((step) => step.stepId.replace(/^tool:/, ''));
}

beforeEach(() => {
  vi.clearAllMocks();
  script = [];
  offeredToolNames = [];
  sentMessages = [];
  callCounter = 0;
  profileFindFirst.mockResolvedValue(dbProfile());
});

// ============================================================================

describe('Resume Agent — general mode', () => {
  it('runs read → submit and returns the v1 result shape unchanged', async () => {
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    const { output, run } = await runResumeAgent({ resumeId: RESUME_ID }, { userId: USER_ID });

    expect(run.status).toBe('succeeded');
    expect(executedTools(run)).toEqual(['get_resume', 'submit_resume_summary']);

    // Every v1 field is still present and still computed from the database row.
    expect(output).toMatchObject({
      resumeId: RESUME_ID,
      resumeTitle: 'Backend Engineer',
      name: 'Ada Lovelace',
      counts: { experiences: 1, education: 1, skills: 2, projects: 1 },
      missingSections: [],
    });
    expect(output.summary).toBe('A backend engineer with one role and one project.');

    // No evaluation ran, so no evaluation fields appear.
    expect(output.jdMatch).toBeUndefined();
    expect(output.keywords).toBeUndefined();
    expect(output.roleCoverage).toBeUndefined();
  });

  it('reports that a JD tool cannot run, and the model adapts instead of inventing', async () => {
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      // The model reaches for JD scoring on a run that has no JD.
      { toolCalls: [call('score_against_jd', { resumeId: RESUME_ID })] },
      {
        toolCalls: [
          call(
            'submit_resume_summary',
            submitArgs({ limitations: ['No job description was supplied.'] })
          ),
        ],
      },
    ];

    const { output, run } = await runResumeAgent({ resumeId: RESUME_ID }, { userId: USER_ID });

    expect(run.status).toBe('succeeded');
    expect(executedTools(run)).toContain('score_against_jd');

    // The tool ran and refused; no score reached the output.
    expect(output.jdMatch).toBeUndefined();
    expect(output.limitations).toContain('No job description was supplied.');

    // The refusal was handed back to the model as a tool result.
    const toolMessages = sentMessages.at(-1)!.filter((message) => message.role === 'tool');
    expect(JSON.stringify(toolMessages)).toMatch(/no job description was provided/i);
  });
});

describe('Resume Agent — job-description mode', () => {
  it('runs the JD tools and grounds the score in what they computed', async () => {
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('score_against_jd', { resumeId: RESUME_ID })] },
      { toolCalls: [call('find_missing_keywords', { resumeId: RESUME_ID })] },
      {
        toolCalls: [
          call(
            'submit_resume_summary',
            // The model's prose claims a score of 99. It must not win.
            submitArgs({
              summary: 'This resume scores 99 out of 100 against the posting.',
              recommendations: ['Add Terraform to the skills section if you have used it.'],
            })
          ),
        ],
      },
    ];

    const { output, run } = await runResumeAgent(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    expect(run.status).toBe('succeeded');
    expect(executedTools(run)).toEqual([
      'get_resume',
      'score_against_jd',
      'find_missing_keywords',
      'submit_resume_summary',
    ]);

    expect(output.mode).toBe('jd');
    expect(output.jdMatch).toBeDefined();

    // The reported score is the computed one, not the 99 the model wrote.
    expect(output.jdMatch!.score).not.toBe(99);
    expect(output.jdMatch!.score).toBeGreaterThan(0);
    expect(output.jdMatch!.matchedSkills).toContain('TypeScript');

    // The three-way keyword split survived into the output.
    expect(output.keywords!.matchedInSkills).toContain('typescript');
    expect(output.keywords!.presentButNotListedAsSkill).toContain('kubernetes');
    expect(output.keywords!.absentFromResume).toContain('terraform');

    expect(output.recommendations).toEqual([
      'Add Terraform to the skills section if you have used it.',
    ]);
  });

  it('never puts the job description text into the model context', async () => {
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    await runResumeAgent(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    // The model is told a JD exists and how long it is, but never its text —
    // it can only learn about it by calling a tool.
    const everythingSent = JSON.stringify(sentMessages);
    expect(everythingSent).not.toContain('Terraform and GraphQL experience is required');
    expect(everythingSent).toMatch(/A job description was supplied for this run/);
  });

  it('rejects a jd run with no job description before any model call', async () => {
    await expect(
      runResumeAgent({ resumeId: RESUME_ID, mode: 'jd' }, { userId: USER_ID })
    ).rejects.toThrow(/paste a job description/i);

    expect(executeChatCompletionMock).not.toHaveBeenCalled();
  });
});

describe('Resume Agent — target-role mode', () => {
  it('evaluates against the chosen role and reports coverage, not a score', async () => {
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('evaluate_against_role', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    const { output, run } = await runResumeAgent(
      { resumeId: RESUME_ID, mode: 'role', targetRole: 'Technical Program Manager' },
      { userId: USER_ID }
    );

    expect(run.status).toBe('succeeded');
    expect(executedTools(run)).toContain('evaluate_against_role');

    expect(output.mode).toBe('role');
    expect(output.roleCoverage!.roleLabel).toBe('Technical Program Manager');
    expect(output.roleCoverage!.competencies.length).toBeGreaterThan(0);
    expect(['broad', 'partial', 'limited']).toContain(output.roleCoverage!.band);

    // No JD was involved, so no JD figures exist.
    expect(output.jdMatch).toBeUndefined();
  });

  it('rejects an unsupported role before any model call', async () => {
    await expect(
      runResumeAgent(
        { resumeId: RESUME_ID, mode: 'role', targetRole: 'Chief Vibes Officer' },
        { userId: USER_ID }
      )
    ).rejects.toThrow(/supported target role/i);

    expect(executeChatCompletionMock).not.toHaveBeenCalled();
  });

  it('notes in limitations when the role evaluation never ran', async () => {
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    const { output } = await runResumeAgent(
      { resumeId: RESUME_ID, mode: 'role', targetRole: 'product-manager' },
      { userId: USER_ID }
    );

    expect(output.roleCoverage).toBeUndefined();
    expect(output.limitations.join(' ')).toMatch(/target-role evaluation did not run/i);
  });
});

describe('Resume Agent — tool availability and decisions', () => {
  it('offers the same five tools in every mode, so the model is choosing', async () => {
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    await runResumeAgent({ resumeId: RESUME_ID }, { userId: USER_ID });

    expect(offeredToolNames[0]).toEqual([
      'get_resume',
      'score_against_jd',
      'find_missing_keywords',
      'evaluate_against_role',
      'submit_resume_summary',
    ]);
  });

  it('executes a different set of tools for jd mode than for general mode', async () => {
    // Same resume, same scripted intent "do what this run calls for".
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];
    const general = await runResumeAgent({ resumeId: RESUME_ID }, { userId: USER_ID });

    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('score_against_jd', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];
    const jd = await runResumeAgent(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    expect(executedTools(general.run)).not.toEqual(executedTools(jd.run));
    expect(general.output.jdMatch).toBeUndefined();
    expect(jd.output.jdMatch).toBeDefined();
  });

  it('handles two tool calls returned in a single model turn', async () => {
    script = [
      {
        toolCalls: [
          call('get_resume', { resumeId: RESUME_ID }),
          call('score_against_jd', { resumeId: RESUME_ID }),
        ],
      },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    const { output, run } = await runResumeAgent(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    expect(executedTools(run).slice(0, 2)).toEqual(['get_resume', 'score_against_jd']);
    expect(output.jdMatch).toBeDefined();
  });
});

describe('Resume Agent — security and failure handling', () => {
  it('scopes the resume query to the authenticated user', async () => {
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    await runResumeAgent({ resumeId: RESUME_ID }, { userId: USER_ID });

    const [query] = profileFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(query.where).toMatchObject({ id: RESUME_ID, userId: USER_ID, isArchived: false });
  });

  it('refuses a tool call naming a different resume, then recovers', async () => {
    script = [
      // The model tries to read someone else's resume.
      { toolCalls: [call('get_resume', { resumeId: 'someone_elses_resume' })] },
      // Corrected after the refusal comes back.
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    const { output } = await runResumeAgent({ resumeId: RESUME_ID }, { userId: USER_ID });

    // The rejected call never reached the database.
    expect(profileFindFirst).toHaveBeenCalledTimes(1);
    const [query] = profileFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(query.where).toMatchObject({ id: RESUME_ID });
    expect(output.resumeId).toBe(RESUME_ID);
  });

  it('refuses to run without an authenticated user', async () => {
    await expect(runResumeAgent({ resumeId: RESUME_ID }, { userId: '  ' })).rejects.toThrow(
      /authenticated user/i
    );
    expect(executeChatCompletionMock).not.toHaveBeenCalled();
  });

  it('fails rather than returning a summary when the resume cannot be read', async () => {
    profileFindFirst.mockResolvedValue(null);
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      // The model tries to finish anyway, with no resume in memory.
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    // No fallback is registered on purpose, so the run fails loudly.
    await expect(runResumeAgent({ resumeId: RESUME_ID }, { userId: USER_ID })).rejects.toThrow(
      /maxSteps/i
    );
  });

  it('persists the run for telemetry', async () => {
    script = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('submit_resume_summary', submitArgs())] },
    ];

    await runResumeAgent({ resumeId: RESUME_ID }, { userId: USER_ID });

    expect(agentRunUpsert).toHaveBeenCalled();
    const [args] = agentRunUpsert.mock.calls[0] as [{ create: Record<string, unknown> }];
    expect(args.create).toMatchObject({ agentId: 'resume-agent', userId: USER_ID });
  });
});
