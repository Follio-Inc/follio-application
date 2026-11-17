import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAgentMemory } from '@/lib/agents/memory';
import { buildEditFacts, type EditSourceProfile } from '@/services/ai/resume-edit/facts';
import {
  buildResumeAgent,
  resumeAgent,
  resumeAgentResultSchema,
  resumeProposeAgent,
  runResumeAgent,
  type ResumeAgentOutput,
} from '@/services/agents/resume/resume.agent';

const {
  executeChatCompletion,
  executeAICall,
  requireOwnedResume,
  getEditableResume,
  getConnectorProfile,
  agentRunUpsert,
  profileFindUnique,
  profileFindFirst,
  userFindUnique,
  sessionFindMany,
  sessionCreate,
  mutations,
} = vi.hoisted(() => ({
  executeChatCompletion: vi.fn(),
  executeAICall: vi.fn(),
  requireOwnedResume: vi.fn(),
  getEditableResume: vi.fn(),
  getConnectorProfile: vi.fn(),
  agentRunUpsert: vi.fn(),
  profileFindUnique: vi.fn(),
  profileFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionCreate: vi.fn(),
  mutations: {
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/ai-client', () => ({
  executeChatCompletion,
  executeAICall,
  isAIAvailable: () => true,
}));

vi.mock('@/lib/ai-connector/resume-target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai-connector/resume-target')>()),
  requireOwnedResume,
}));

// `createAssistantResumeEditSession` stays real so propose mode runs the
// actual grounding; only the facts loader is stubbed.
vi.mock('@/services/resume-edit-session.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/resume-edit-session.service')>()),
  getEditableResume,
}));
vi.mock('@/services/ai-connector.service', () => ({ getConnectorProfile }));

vi.mock('@/lib/db', () => ({
  db: {
    // AgentRun telemetry is the one write the agent is allowed to cause.
    agentRun: { upsert: agentRunUpsert },
    profile: {
      ...mutations,
      findUnique: profileFindUnique,
      findMany: vi.fn(),
      findFirst: profileFindFirst,
    },
    user: { ...mutations, findUnique: userFindUnique, findMany: vi.fn() },
    // `create` is its own spy: a pending review row is the only resume-side
    // write a proposal may cause, so it must not trip the mutation guard.
    resumeEditSession: {
      ...mutations,
      findFirst: vi.fn(),
      findMany: sessionFindMany,
      create: sessionCreate,
    },
    ...mutations,
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH = { userId: 'user-1', clerkId: 'clerk_1' };
const RESUME_ID = 'p1';

/** readJobRequirements caches per posting at module scope, so vary the text. */
function posting(marker: string): string {
  return `Senior Backend Engineer at ${marker}

Requirements
Build backend services in Python. Work with PostgreSQL databases daily.
Kubernetes experience is required for this role.

Benefits
Medical, dental, vision. Flexible PTO and a wellness stipend.`;
}

function modelRequirements() {
  return {
    data: {
      requirements: [
        { term: 'Python', kind: 'tool', importance: 'required', aliases: [], broader: [] },
        {
          term: 'PostgreSQL',
          kind: 'tool',
          importance: 'required',
          aliases: ['Postgres'],
          broader: [],
        },
        { term: 'Kubernetes', kind: 'tool', importance: 'required', aliases: ['k8s'], broader: [] },
      ],
    },
  };
}

/** Shows Python and PostgreSQL. Never mentions Kubernetes. */
const resumeProfile: EditSourceProfile = {
  headline: 'Backend Engineer',
  summary: 'Engineer building payment systems in Python.',
  workExperiences: [
    {
      id: 'exp-acme',
      company: 'Acme',
      role: 'Backend Engineer',
      startDate: new Date('2020-01-01'),
      endDate: null,
      isCurrent: true,
      bullets: [
        'Built Python services that cut checkout latency 30%',
        'Tuned PostgreSQL queries to handle 2x traffic',
      ],
      bulletsHtml: null,
      isVisible: true,
    },
  ],
  skills: [{ name: 'Python' }, { name: 'PostgreSQL' }],
  educations: [{ institution: 'State University', degree: 'BS', fieldOfStudy: 'Computer Science' }],
  certifications: [],
  projects: [],
};

// ---------------------------------------------------------------------------
// Mocked model turns
// ---------------------------------------------------------------------------

type Call = { id: string; type: 'function'; function: { name: string; arguments: string } };

function call(name: string, args: Record<string, unknown>, id = `call-${name}`): Call {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

/** A raw-string argument payload, for testing malformed tool calls. */
function rawCall(name: string, args: string, id = `call-${name}`): Call {
  return { id, type: 'function', function: { name, arguments: args } };
}

function turn(...calls: Call[]) {
  return {
    message: { role: 'assistant' as const, content: null, tool_calls: calls },
    meta: {
      model: 'gpt-test',
      tokensUsed: { input: 10, output: 5 },
      durationMs: 1,
      timestamp: new Date().toISOString(),
    },
  };
}

/** A turn with no tool calls — the runtime nudges and loops. */
function idleTurn() {
  return {
    message: { role: 'assistant' as const, content: 'thinking', tool_calls: undefined },
    meta: {
      model: 'gpt-test',
      tokensUsed: { input: 1, output: 1 },
      durationMs: 1,
      timestamp: new Date().toISOString(),
    },
  };
}

const SUBMIT_ARGS = {
  summary: 'Strong on Python and PostgreSQL; Kubernetes is not shown anywhere on the resume.',
  recommendations: [
    { requirement: 'Kubernetes', suggestion: 'Only add it if you have actually used it at work.' },
  ],
  limitations: [],
};

/** Every tool message pushed back to the model across the run. */
function toolMessages(): string[] {
  const lastCall = executeChatCompletion.mock.calls.at(-1)?.[0] as
    | { messages: Array<{ role: string; content?: unknown }> }
    | undefined;
  return (lastCall?.messages ?? [])
    .filter((message) => message.role === 'tool')
    .map((message) => String(message.content));
}

function expectNoResumeMutations() {
  for (const [name, spy] of Object.entries(mutations)) {
    expect(spy, `db.${name} must never be called by a read-only agent`).not.toHaveBeenCalled();
  }
}

async function run(jobDescription: string, instruction = 'How does this resume fit?') {
  return runResumeAgent({ resumeId: RESUME_ID, jobDescription, instruction }, AUTH);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwnedResume.mockResolvedValue({
    resumeId: RESUME_ID,
    title: 'Backend',
    handle: 'alex-be',
  });
  getEditableResume.mockResolvedValue(buildEditFacts(resumeProfile));
  getConnectorProfile.mockResolvedValue({ resumeId: RESUME_ID, title: 'Backend', skills: [] });
  executeAICall.mockResolvedValue(modelRequirements());
  agentRunUpsert.mockResolvedValue({});

  // These serve the real createAssistantResumeEditSession in propose mode.
  userFindUnique.mockResolvedValue({ id: 'user-1', profile: { id: RESUME_ID } });
  profileFindFirst.mockResolvedValue({ id: RESUME_ID });
  profileFindUnique.mockResolvedValue(resumeProfile);
  sessionFindMany.mockResolvedValue([]);
  sessionCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'session-1',
      profileId: data.profileId,
      brief: data.brief,
      changes: data.changes,
      droppedCount: data.droppedCount,
      failedSections: data.failedSections,
      createdAt: new Date('2026-11-16T00:00:00.000Z'),
    })
  );
});

// ---------------------------------------------------------------------------

describe('resumeAgent definition', () => {
  it('is a tool agent wired to the terminal result tool', () => {
    expect(resumeAgent.kind).toBe('tool');
    expect(resumeAgent.id).toBe('resume-agent');
    expect(resumeAgent.resultToolName).toBe('submit_resume_result');
    expect(resumeAgent.tools.map((tool) => tool.name)).toEqual([
      'get_resume',
      'analyze_job_description',
      'score_resume_against_jd',
      'submit_resume_result',
    ]);
  });

  it('has no fallback, so a failed run cannot return a plausible analysis', () => {
    expect(resumeAgent.fallback).toBeUndefined();
  });

  it('forbids invention and resume substitution in its instructions', () => {
    const text = String(resumeAgent.instructions).toLowerCase();
    expect(text).toContain('never invent');
    expect(text).toContain('read-only');
    expect(text).toContain('other users');
  });
});

describe('successful run', () => {
  it('drives all three tools and returns a grounded analysis', async () => {
    const jd = posting('happy-path');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('get_resume', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { output, run: record } = await run(jd);

    expect(record.status).toBe('succeeded');
    expect(output.resumeId).toBe(RESUME_ID);
    expect(getConnectorProfile).toHaveBeenCalledWith('user-1', RESUME_ID);
    expect(getEditableResume).toHaveBeenCalledWith('clerk_1', RESUME_ID);

    // Strengths and gaps come from the scored evaluation, not the model.
    expect(output.strengths.map((s) => s.term)).toEqual(
      expect.arrayContaining(['Python', 'PostgreSQL'])
    );
    expect(output.missingRequirements.map((g) => g.term)).toEqual(['Kubernetes']);
    expect(output.scores.requirementMatch).not.toBeNull();
    expect(resumeAgentResultSchema.safeParse(output).success).toBe(true);
  });

  it('stops calling the model once the result tool succeeds', async () => {
    const jd = posting('terminates');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)))
      .mockResolvedValue(turn(call('submit_resume_result', SUBMIT_ARGS)));

    await run(jd);

    expect(executeChatCompletion).toHaveBeenCalledTimes(3);
  });

  it('lets the model choose its own tool order and skip get_resume', async () => {
    const jd = posting('dynamic-order');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { output } = await run(jd);

    expect(getConnectorProfile).not.toHaveBeenCalled();
    expect(output.missingRequirements).toHaveLength(1);
  });

  it('records the run through the existing AgentRun telemetry', async () => {
    const jd = posting('telemetry');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    await run(jd);

    expect(agentRunUpsert).toHaveBeenCalledTimes(1);
    expectNoResumeMutations();
  });
});

describe('ordering and recovery', () => {
  it('refuses to score before the posting is analyzed, then recovers', async () => {
    const jd = posting('out-of-order');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { output, run: record } = await run(jd);

    expect(toolMessages()[0]).toMatch(/analyze_job_description first/i);
    expect(record.status).toBe('succeeded');
    expect(output.strengths.length).toBeGreaterThan(0);
  });

  it('reports invalid tool arguments without ending the run', async () => {
    const jd = posting('bad-args');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('get_resume', {})))
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { run: record } = await run(jd);

    expect(toolMessages()[0]).toContain('Invalid tool arguments');
    expect(getConnectorProfile).not.toHaveBeenCalled();
    expect(record.status).toBe('succeeded');
  });

  it('survives malformed tool-call JSON', async () => {
    const jd = posting('malformed-json');
    executeChatCompletion
      .mockResolvedValueOnce(turn(rawCall('get_resume', '{not json')))
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { run: record } = await run(jd);

    expect(toolMessages()[0]).toContain('Invalid tool arguments');
    expect(record.status).toBe('succeeded');
  });
});

describe('resume isolation', () => {
  it('refuses a resumeId other than the one the user selected', async () => {
    const jd = posting('substitution');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('get_resume', { resumeId: 'someone-elses-resume' })))
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { output } = await run(jd);

    expect(toolMessages()[0]).toMatch(/only the resume the user selected/i);
    // The substituted id never reached the retrieval service.
    expect(getConnectorProfile).not.toHaveBeenCalled();
    expect(output.resumeId).toBe(RESUME_ID);
  });

  it('refuses a substituted resumeId on the scoring tool too', async () => {
    const jd = posting('substitution-score');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: 'p9' })))
      .mockResolvedValue(idleTurn());

    await expect(run(jd)).rejects.toThrow(/exceeded maxSteps/i);

    expect(requireOwnedResume).not.toHaveBeenCalled();
    expect(getEditableResume).not.toHaveBeenCalled();
  });
});

describe('authentication and ownership', () => {
  it('rejects a missing Follio user id before the model is called', async () => {
    await expect(
      runResumeAgent(
        { resumeId: RESUME_ID, jobDescription: posting('no-user') },
        { userId: '', clerkId: 'clerk_1' }
      )
    ).rejects.toThrow(/authenticated user/i);

    expect(executeChatCompletion).not.toHaveBeenCalled();
    expectNoResumeMutations();
  });

  it('rejects a missing Clerk id before the model is called', async () => {
    await expect(
      runResumeAgent(
        { resumeId: RESUME_ID, jobDescription: posting('no-clerk') },
        { userId: 'user-1', clerkId: '  ' }
      )
    ).rejects.toThrow(/authenticated user/i);

    expect(executeChatCompletion).not.toHaveBeenCalled();
  });

  it('rejects an empty resume selection', async () => {
    await expect(
      runResumeAgent({ resumeId: '   ', jobDescription: posting('no-resume') }, AUTH)
    ).rejects.toThrow(/Select a resume/i);

    expect(executeChatCompletion).not.toHaveBeenCalled();
  });

  it('rejects a job description below the shared minimum', async () => {
    await expect(
      runResumeAgent({ resumeId: RESUME_ID, jobDescription: 'Too short.' }, AUTH)
    ).rejects.toThrow(/bit more of the job description/i);

    expect(executeChatCompletion).not.toHaveBeenCalled();
  });

  it('surfaces an ownership failure and never reports a successful analysis', async () => {
    const jd = posting('not-owned');
    requireOwnedResume.mockRejectedValue(new Error('No resume matches p1.'));
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)))
      .mockResolvedValue(idleTurn());

    await expect(run(jd)).rejects.toThrow(/exceeded maxSteps/i);

    const messages = toolMessages();
    expect(messages.some((m) => m.includes('No resume matches'))).toBe(true);
    expect(messages.some((m) => /No scoring in memory/i.test(m))).toBe(true);
    expect(getEditableResume).not.toHaveBeenCalled();
  });
});

describe('tool failure and result validation', () => {
  it('treats a failed job-description read as a failure, not an empty posting', async () => {
    const jd = posting('analysis-fails');
    executeAICall.mockRejectedValue(new Error('model offline'));
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)))
      .mockResolvedValue(idleTurn());

    await expect(run(jd)).rejects.toThrow(/exceeded maxSteps/i);

    const messages = toolMessages();
    expect(messages.some((m) => /Could not read this posting/i.test(m))).toBe(true);
  });

  it('refuses to finish before the resume has been scored', async () => {
    const jd = posting('premature-submit');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)))
      .mockResolvedValue(idleTurn());

    await expect(run(jd)).rejects.toThrow(/exceeded maxSteps/i);

    expect(toolMessages()[0]).toMatch(/No scoring in memory/i);
  });

  it('drops a recommendation naming a requirement the posting never listed', async () => {
    const jd = posting('ungrounded-rec');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(
        turn(
          call('submit_resume_result', {
            summary: 'Good fit.',
            recommendations: [
              { requirement: 'Python', suggestion: 'Keep it near the top.' },
              { requirement: 'Blockchain', suggestion: 'Add blockchain experience.' },
            ],
            limitations: [],
          })
        )
      );

    const { output } = await run(jd);

    expect(output.recommendations.map((r) => r.requirement)).toEqual(['Python']);
    expect(output.limitations.join(' ')).toMatch(/Blockchain/);
  });

  it('rejects a malformed final payload at the schema', () => {
    const bad = { resumeId: 'p1', summary: 'ok' };
    expect(resumeAgentResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe('budget', () => {
  it('fails when the model never calls the result tool', async () => {
    const jd = posting('budget');
    executeChatCompletion.mockResolvedValue(idleTurn());

    await expect(run(jd)).rejects.toThrow(/exceeded maxSteps \(10\)/i);

    expect(executeChatCompletion).toHaveBeenCalledTimes(10);
    expectNoResumeMutations();
  });

  it('never mutates resume data across a full successful run', async () => {
    const jd = posting('no-mutation');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('get_resume', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { output } = await run(jd);

    expectNoResumeMutations();
    expect(output.summary.length).toBeGreaterThan(0);
  });
});

describe('result shape', () => {
  it('keeps match and evidence grades the resume actually supports', async () => {
    const jd = posting('grades');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { output }: { output: ResumeAgentOutput } = await run(jd);
    const python = output.strengths.find((s) => s.term === 'Python');

    expect(python?.match).toBe('exact');
    expect(python?.evidence).toBe('shown');
    expect(output.missingRequirements[0]).toMatchObject({
      term: 'Kubernetes',
      importance: 'required',
    });
  });
});

// ---------------------------------------------------------------------------
// Part 5C — execution modes
// ---------------------------------------------------------------------------

const EDIT_TOOL_NAMES = ['read_resume_lines', 'propose_resume_edits'];
const MUTATION_TOOL_NAMES = ['apply_resume_edits', 'revert_resume_edits', 'apply_draft'];

describe('execution modes', () => {
  it('analyze mode registers only the read-only tools', () => {
    expect(resumeAgent.tools.map((tool) => tool.name)).toEqual([
      'get_resume',
      'analyze_job_description',
      'score_resume_against_jd',
      'submit_resume_result',
    ]);
  });

  it('propose mode registers both editing tools as well', () => {
    expect(resumeProposeAgent.tools.map((tool) => tool.name)).toEqual([
      'get_resume',
      'analyze_job_description',
      'score_resume_against_jd',
      'read_resume_lines',
      'propose_resume_edits',
      'submit_resume_result',
    ]);
  });

  it('never exposes an apply, revert or delete tool in either mode', () => {
    for (const agent of [resumeAgent, resumeProposeAgent]) {
      const names = agent.tools.map((tool) => tool.name);
      for (const forbidden of MUTATION_TOOL_NAMES) {
        expect(names).not.toContain(forbidden);
      }
      expect(names.some((name) => /apply|revert|delete|publish/i.test(name))).toBe(false);
    }
  });

  it('keeps editing tools out of analyze mode entirely', () => {
    const names = resumeAgent.tools.map((tool) => tool.name);
    for (const editing of EDIT_TOOL_NAMES) {
      expect(names).not.toContain(editing);
    }
  });

  it('pins every resume-scoped tool in propose mode', async () => {
    const ctx = { runId: 'r', memory: createAgentMemory(), meta: {} };
    for (const name of ['get_resume', 'score_resume_against_jd', ...EDIT_TOOL_NAMES]) {
      const tool = resumeProposeAgent.tools.find((item) => item.name === name);
      // An unpinned tool would fall through to its own auth error instead.
      await expect(tool?.execute({ resumeId: 'another-resume' }, ctx as never)).rejects.toThrow(
        /No resume was selected|only the resume the user selected/i
      );
    }
  });

  it('both modes finish through the same terminal tool and have no fallback', () => {
    for (const agent of [resumeAgent, resumeProposeAgent]) {
      expect(agent.resultToolName).toBe('submit_resume_result');
      expect(agent.fallback).toBeUndefined();
      expect(agent.id).toBe('resume-agent');
    }
  });

  it('tells the propose-mode model it cannot apply anything', () => {
    const text = String(resumeProposeAgent.instructions).toLowerCase();
    expect(text).toContain('cannot apply');
    expect(text).toContain('the user approves it in follio');
    expect(text).toContain('never invent');
  });

  it('builds a mode from buildResumeAgent and labels the run version', () => {
    expect(buildResumeAgent('analyze').version).toBe('resume-agent-v1');
    expect(buildResumeAgent('propose').version).toBe('resume-agent-v1-propose');
  });
});

describe('mode selection', () => {
  it('defaults to analyze when no mode is given', async () => {
    const jd = posting('mode-default');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { run: record } = await run(jd);

    expect(record.version).toBe('resume-agent-v1');
    const sent = executeChatCompletion.mock.calls[0][0] as {
      tools: Array<{ function: { name: string } }>;
    };
    expect(sent.tools.map((tool) => tool.function.name)).not.toContain('propose_resume_edits');
  });

  it('offers the editing tools to the model only in propose mode', async () => {
    const jd = posting('mode-propose-tools');
    executeChatCompletion.mockResolvedValue(idleTurn());

    await expect(
      runResumeAgent({ resumeId: RESUME_ID, jobDescription: jd, mode: 'propose' }, AUTH)
    ).rejects.toThrow(/exceeded maxSteps/i);

    const sent = executeChatCompletion.mock.calls[0][0] as {
      tools: Array<{ function: { name: string } }>;
    };
    expect(sent.tools.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(['read_resume_lines', 'propose_resume_edits'])
    );
  });

  it('rejects an unknown mode before calling the model', async () => {
    await expect(
      runResumeAgent(
        {
          resumeId: RESUME_ID,
          jobDescription: posting('bad-mode'),
          mode: 'delete' as never,
        },
        AUTH
      )
    ).rejects.toThrow(/Unknown resume agent mode/i);

    expect(executeChatCompletion).not.toHaveBeenCalled();
  });
});

describe('analyze mode stays read-only', () => {
  it('returns empty proposal fields and creates no session', async () => {
    const jd = posting('analyze-no-proposal');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { output } = await run(jd);

    expect(output.proposedSessionId).toBeNull();
    expect(output.proposedChanges).toEqual([]);
    expect(output.proposalMessage).toBeNull();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses a propose_resume_edits call even when the model tries it', async () => {
    const jd = posting('analyze-tries-propose');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(
        turn(
          call('propose_resume_edits', {
            resumeId: RESUME_ID,
            request: 'Tailor it',
            changes: [{ ref: 'S', text: 'Something new.' }],
          })
        )
      )
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { output } = await run(jd);

    expect(toolMessages().some((m) => /Unknown tool: propose_resume_edits/.test(m))).toBe(true);
    expect(output.proposedSessionId).toBeNull();
    expect(sessionCreate).not.toHaveBeenCalled();
  });
});

describe('propose mode', () => {
  const SUMMARY_REWRITE = {
    ref: 'S',
    text: 'Backend engineer building payment systems in Python and PostgreSQL.',
  };

  async function runPropose(jd: string) {
    return runResumeAgent({ resumeId: RESUME_ID, jobDescription: jd, mode: 'propose' }, AUTH);
  }

  function proposeTurns(jd: string, changes: Array<Record<string, unknown>>) {
    return [
      turn(call('analyze_job_description', { jobDescription: jd })),
      turn(call('score_resume_against_jd', { resumeId: RESUME_ID })),
      turn(call('read_resume_lines', { resumeId: RESUME_ID })),
      turn(
        call('propose_resume_edits', {
          resumeId: RESUME_ID,
          request: 'Tailor the summary',
          changes,
        })
      ),
      turn(call('submit_resume_result', SUBMIT_ARGS)),
    ];
  }

  it('creates a pending session and reports its real id', async () => {
    const jd = posting('propose-happy');
    for (const t of proposeTurns(jd, [SUMMARY_REWRITE])) {
      executeChatCompletion.mockResolvedValueOnce(t);
    }

    const { output, run: record } = await runPropose(jd);

    expect(record.status).toBe('succeeded');
    expect(output.proposedSessionId).toBe('session-1');
    expect(output.proposedChanges).toHaveLength(1);
    expect(output.proposedChanges[0]).toMatchObject({ status: 'proposed' });
    expect(output.proposalMessage).toMatch(/resume is unchanged/i);
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps the grounded analysis alongside the proposal', async () => {
    const jd = posting('propose-keeps-analysis');
    for (const t of proposeTurns(jd, [SUMMARY_REWRITE])) {
      executeChatCompletion.mockResolvedValueOnce(t);
    }

    const { output } = await runPropose(jd);

    expect(output.missingRequirements.map((gap) => gap.term)).toEqual(['Kubernetes']);
    expect(output.scores.requirementMatch).not.toBeNull();
  });

  it('ignores a session id the model tries to supply', async () => {
    const jd = posting('propose-invented-id');
    for (const t of proposeTurns(jd, [SUMMARY_REWRITE])) {
      executeChatCompletion.mockResolvedValueOnce(t);
    }
    // The terminal tool has no sessionId argument; a model that sends one is
    // rejected by its input schema rather than believed.
    executeChatCompletion.mockReset();
    for (const t of proposeTurns(jd, [SUMMARY_REWRITE]).slice(0, 4)) {
      executeChatCompletion.mockResolvedValueOnce(t);
    }
    executeChatCompletion
      .mockResolvedValueOnce(
        turn(call('submit_resume_result', { ...SUBMIT_ARGS, proposedSessionId: 'session-999' }))
      )
      .mockResolvedValueOnce(turn(call('submit_resume_result', SUBMIT_ARGS)));

    const { output } = await runPropose(jd);

    expect(output.proposedSessionId).toBe('session-1');
  });

  it('reports a no-proposal outcome when grounding drops everything', async () => {
    const jd = posting('propose-all-dropped');
    for (const t of proposeTurns(jd, [
      { ref: 'E1.1', text: 'Built Python services on Kubernetes clusters.' },
    ])) {
      executeChatCompletion.mockResolvedValueOnce(t);
    }

    const { output } = await runPropose(jd);

    expect(output.proposedSessionId).toBeNull();
    expect(output.proposedChanges).toEqual([]);
    expect(output.proposalMessage).toMatch(/No suggestions were saved/i);
    expect(output.limitations.join(' ')).toMatch(/No edit was proposed/i);
    expect(sessionCreate).not.toHaveBeenCalled();
    // The analysis still stands.
    expect(output.missingRequirements).toHaveLength(1);
  });

  it('refuses to propose before the posting is analyzed', async () => {
    const jd = posting('propose-before-analyze');
    executeChatCompletion
      .mockResolvedValueOnce(
        turn(
          call('propose_resume_edits', {
            resumeId: RESUME_ID,
            request: 'Tailor it',
            changes: [SUMMARY_REWRITE],
          })
        )
      )
      .mockResolvedValue(idleTurn());

    await expect(runPropose(jd)).rejects.toThrow(/exceeded maxSteps/i);

    expect(toolMessages()[0]).toMatch(/analyze_job_description first/i);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses to propose before the resume is scored', async () => {
    const jd = posting('propose-before-score');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('read_resume_lines', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(
        turn(
          call('propose_resume_edits', {
            resumeId: RESUME_ID,
            request: 'Tailor it',
            changes: [SUMMARY_REWRITE],
          })
        )
      )
      .mockResolvedValue(idleTurn());

    await expect(runPropose(jd)).rejects.toThrow(/exceeded maxSteps/i);

    expect(toolMessages().some((m) => /score_resume_against_jd first/i.test(m))).toBe(true);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses to propose before the resume lines are read', async () => {
    const jd = posting('propose-before-lines');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(
        turn(
          call('propose_resume_edits', {
            resumeId: RESUME_ID,
            request: 'Tailor it',
            changes: [SUMMARY_REWRITE],
          })
        )
      )
      .mockResolvedValue(idleTurn());

    await expect(runPropose(jd)).rejects.toThrow(/exceeded maxSteps/i);

    expect(toolMessages().some((m) => /read_resume_lines for this resume first/i.test(m))).toBe(
      true
    );
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses a cross-resume proposal through pinning', async () => {
    const jd = posting('propose-cross-resume');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValueOnce(turn(call('score_resume_against_jd', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(turn(call('read_resume_lines', { resumeId: RESUME_ID })))
      .mockResolvedValueOnce(
        turn(
          call('propose_resume_edits', {
            resumeId: 'someone-elses-resume',
            request: 'Tailor it',
            changes: [SUMMARY_REWRITE],
          })
        )
      )
      .mockResolvedValue(idleTurn());

    await expect(runPropose(jd)).rejects.toThrow(/exceeded maxSteps/i);

    expect(toolMessages().some((m) => /only the resume the user selected/i.test(m))).toBe(true);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('never mutates the resume itself', async () => {
    const jd = posting('propose-no-mutation');
    for (const t of proposeTurns(jd, [SUMMARY_REWRITE])) {
      executeChatCompletion.mockResolvedValueOnce(t);
    }

    await runPropose(jd);

    expectNoResumeMutations();
  });

  it('does not report a proposal when the run fails before finishing', async () => {
    const jd = posting('propose-fails');
    executeChatCompletion
      .mockResolvedValueOnce(turn(call('analyze_job_description', { jobDescription: jd })))
      .mockResolvedValue(idleTurn());

    await expect(runPropose(jd)).rejects.toThrow(/exceeded maxSteps/i);

    expect(sessionCreate).not.toHaveBeenCalled();
  });
});
