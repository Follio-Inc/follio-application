import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentBudgetExceededError, AgentError } from '@/lib/agents/errors';
import { Errors } from '@/lib/errors';
import {
  __resetResumeAgentRateLimit,
  RESUME_AGENT_LIMITS,
} from '@/services/agents/resume/rate-limit';
import { POST } from '@/app/api/resumes/[resumeId]/agent/route';

import type { NextRequest } from 'next/server';

const {
  authMock,
  userFindUnique,
  profileFindFirst,
  agentRunCount,
  runResumeAgent,
  isAIAvailable,
  mutations,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  userFindUnique: vi.fn(),
  profileFindFirst: vi.fn(),
  agentRunCount: vi.fn(),
  runResumeAgent: vi.fn(),
  isAIAvailable: vi.fn(),
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

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));
vi.mock('@/lib/ai-client', () => ({ isAIAvailable }));
vi.mock('@/services/agents/resume/resume.agent', () => ({ runResumeAgent }));
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: userFindUnique, findMany: vi.fn(), ...mutations },
    profile: { findFirst: profileFindFirst, findUnique: vi.fn(), findMany: vi.fn(), ...mutations },
    agentRun: { count: agentRunCount },
    ...mutations,
  },
}));

// ---------------------------------------------------------------------------

const CLERK_ID = 'clerk_1';
const USER_ID = 'user-1';
const RESUME_ID = 'p1';

const JOB_DESCRIPTION = `Senior Backend Engineer at Northwind

Requirements
Build backend services in Python. Work with PostgreSQL databases daily.
Kubernetes experience is required for this role.`;

function analysis() {
  return {
    resumeId: RESUME_ID,
    summary: 'Strong on Python; Kubernetes is missing.',
    strengths: [
      {
        term: 'Python',
        importance: 'required',
        match: 'exact',
        evidence: 'shown',
        where: ['experience'],
        via: null,
      },
    ],
    missingRequirements: [{ term: 'Kubernetes', kind: 'tool', importance: 'required' }],
    recommendations: [],
    scores: { requirementMatch: 66, keywordCoverage: 50, writing: 70 },
    limitations: [],
  };
}

function agentRun() {
  return {
    id: 'run-1',
    agentId: 'resume-agent' as const,
    version: 'resume-agent-v1',
    status: 'succeeded' as const,
    stepMetas: [
      { stepId: 'llm-turn-1', kind: 'llm' as const, durationMs: 5, timestamp: 'now' },
      { stepId: 'tool:get_resume', kind: 'tool' as const, durationMs: 2, timestamp: 'now' },
    ],
    totalTokensUsed: { input: 100, output: 40 },
    startedAt: '2026-11-16T00:00:00.000Z',
    finishedAt: '2026-11-16T00:00:05.000Z',
  };
}

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function routeContext(resumeId: string = RESUME_ID) {
  return { params: Promise.resolve({ resumeId }) };
}

async function post(body: unknown, resumeId: string = RESUME_ID) {
  const response = await POST(makeRequest(body), routeContext(resumeId));
  return { response, json: (await response.json()) as Record<string, unknown> };
}

function expectNoResumeMutations() {
  for (const [name, spy] of Object.entries(mutations)) {
    expect(spy, `db.${name} must never be called by a read-only route`).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: CLERK_ID });
  userFindUnique.mockResolvedValue({ id: USER_ID });
  profileFindFirst.mockResolvedValue({ id: RESUME_ID });
  isAIAvailable.mockReturnValue(true);
  agentRunCount.mockResolvedValue(0);
  runResumeAgent.mockResolvedValue({ output: analysis(), run: agentRun() });
  __resetResumeAgentRateLimit();
});

// ---------------------------------------------------------------------------

describe('POST /api/resumes/[resumeId]/agent — success', () => {
  it('returns the analysis and summary run metadata', async () => {
    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.analysis).toEqual(analysis());
    expect(json.run).toEqual({
      id: 'run-1',
      agentId: 'resume-agent',
      version: 'resume-agent-v1',
      status: 'succeeded',
      steps: 2,
      tokensUsed: { input: 100, output: 40 },
      startedAt: '2026-11-16T00:00:00.000Z',
      finishedAt: '2026-11-16T00:00:05.000Z',
    });
  });

  it('does not leak model traces or prompts in the response', async () => {
    const { json } = await post({ jobDescription: JOB_DESCRIPTION });
    const run = json.run as Record<string, unknown>;

    expect(run.stepMetas).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('llm-turn-1');
  });

  it('passes the Follio user id and the Clerk id from the same session', async () => {
    await post({ jobDescription: JOB_DESCRIPTION, instruction: 'Where am I weak?' });

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { clerkId: CLERK_ID },
      select: { id: true },
    });
    expect(runResumeAgent).toHaveBeenCalledWith(
      {
        resumeId: RESUME_ID,
        jobDescription: JOB_DESCRIPTION,
        instruction: 'Where am I weak?',
        mode: 'analyze',
      },
      { userId: USER_ID, clerkId: CLERK_ID }
    );
  });

  it('verifies ownership with the resolved Follio user id', async () => {
    await post({ jobDescription: JOB_DESCRIPTION });

    expect(profileFindFirst).toHaveBeenCalledWith({
      where: { id: RESUME_ID, userId: USER_ID, isArchived: false },
      select: { id: true },
    });
  });

  it('never mutates resume data', async () => {
    await post({ jobDescription: JOB_DESCRIPTION });
    expectNoResumeMutations();
  });
});

describe('authentication and ownership', () => {
  it('rejects an unauthenticated request', async () => {
    authMock.mockResolvedValue({ userId: null });

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
    expect(runResumeAgent).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('404s when the Clerk session has no Follio user', async () => {
    userFindUnique.mockResolvedValue(null);

    const { response } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(404);
    expect(runResumeAgent).not.toHaveBeenCalled();
  });

  it("reports another user's resume as not found, without confirming it exists", async () => {
    profileFindFirst.mockResolvedValue(null);

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION }, 'someone-elses');

    expect(response.status).toBe(404);
    expect(json.error).toBe('Resume not found');
    expect(runResumeAgent).not.toHaveBeenCalled();
    expectNoResumeMutations();
  });

  it('rejects an empty resume id in the path', async () => {
    const { response } = await post({ jobDescription: JOB_DESCRIPTION }, '   ');

    expect(response.status).toBe(404);
    expect(runResumeAgent).not.toHaveBeenCalled();
  });
});

describe('request validation', () => {
  it('rejects a missing job description', async () => {
    const { response, json } = await post({});

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid request body');
    expect(runResumeAgent).not.toHaveBeenCalled();
  });

  it('rejects a job description under 80 characters', async () => {
    const { response } = await post({ jobDescription: 'Backend engineer wanted.' });

    expect(response.status).toBe(400);
    expect(runResumeAgent).not.toHaveBeenCalled();
  });

  it('rejects a job description over 16,000 characters', async () => {
    const { response } = await post({ jobDescription: 'x'.repeat(16_001) });

    expect(response.status).toBe(400);
    expect(runResumeAgent).not.toHaveBeenCalled();
  });

  it('rejects a non-JSON body', async () => {
    const response = await POST(
      { json: async () => Promise.reject(new Error('bad json')) } as unknown as NextRequest,
      routeContext()
    );

    expect(response.status).toBe(400);
    expect(runResumeAgent).not.toHaveBeenCalled();
  });

  it.each([
    ['userId', { userId: 'attacker' }],
    ['clerkId', { clerkId: 'clerk_attacker' }],
    ['budget', { budget: { maxSteps: 9999 } }],
    ['tools', { tools: ['delete_resume'] }],
  ])('rejects a body carrying client-supplied %s', async (_label, extra) => {
    const { response } = await post({ jobDescription: JOB_DESCRIPTION, ...extra });

    expect(response.status).toBe(400);
    expect(runResumeAgent).not.toHaveBeenCalled();
  });
});

describe('rate limiting', () => {
  it('allows a request under the daily limit', async () => {
    agentRunCount.mockResolvedValue(RESUME_AGENT_LIMITS.dailyRuns - 1);

    const { response } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(200);
    expect(runResumeAgent).toHaveBeenCalledTimes(1);
  });

  it('returns 429 once the daily limit is reached, without running the agent', async () => {
    agentRunCount.mockResolvedValue(RESUME_AGENT_LIMITS.dailyRuns);

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(429);
    expect(runResumeAgent).not.toHaveBeenCalled();
    const error = json.error as { code: string; message: string };
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toMatch(/today's resume analyses/i);
  });

  it('checks the limit only after authentication, validation and ownership', async () => {
    authMock.mockResolvedValue({ userId: null });
    await post({ jobDescription: JOB_DESCRIPTION });
    expect(agentRunCount).not.toHaveBeenCalled();

    authMock.mockResolvedValue({ userId: CLERK_ID });
    await post({ jobDescription: 'too short' });
    expect(agentRunCount).not.toHaveBeenCalled();

    profileFindFirst.mockResolvedValue(null);
    await post({ jobDescription: JOB_DESCRIPTION });
    expect(agentRunCount).not.toHaveBeenCalled();
  });

  it('refuses a simultaneous request beyond the concurrency cap', async () => {
    // Hold the first run open so the second arrives while it is in flight.
    let finishFirst: (value: unknown) => void = () => {};
    runResumeAgent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = () => resolve({ output: analysis(), run: agentRun() });
        })
    );

    const inFlight = Array.from({ length: RESUME_AGENT_LIMITS.maxConcurrent }, () =>
      post({ jobDescription: JOB_DESCRIPTION })
    );
    const overflow = await post({ jobDescription: JOB_DESCRIPTION });

    expect(overflow.response.status).toBe(429);
    expect((overflow.json.error as { message: string }).message).toMatch(/already running/i);

    finishFirst(undefined);
    await Promise.all(inFlight);
  });

  it('frees the slot after a run finishes', async () => {
    const first = await post({ jobDescription: JOB_DESCRIPTION });
    const second = await post({ jobDescription: JOB_DESCRIPTION });

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
  });

  it('frees the slot even when the agent throws', async () => {
    runResumeAgent.mockRejectedValueOnce(new AgentError('resume-agent', 'MODEL_ERROR', 'boom'));
    const failed = await post({ jobDescription: JOB_DESCRIPTION });
    expect(failed.response.status).toBe(502);

    const next = await post({ jobDescription: JOB_DESCRIPTION });
    expect(next.response.status).toBe(200);
  });
});

describe('failure handling', () => {
  it('returns 503 when the model is not configured', async () => {
    isAIAvailable.mockReturnValue(false);

    const { response } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(503);
    expect(runResumeAgent).not.toHaveBeenCalled();
  });

  it('maps budget exhaustion to 504 without leaking the internal message', async () => {
    runResumeAgent.mockRejectedValue(
      new AgentBudgetExceededError(
        'resume-agent',
        'Agent "resume-agent" exceeded maxSteps (10) without calling "submit_resume_result"'
      )
    );

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(504);
    expect(String(json.error)).not.toMatch(/maxSteps|submit_resume_result/);
    expect(String(json.error)).toMatch(/did not finish in time/i);
  });

  it('maps an agent failure to 502 without leaking the internal message', async () => {
    runResumeAgent.mockRejectedValue(
      new AgentError('resume-agent', 'MODEL_ERROR', 'openai 500: upstream prompt xyz leaked')
    );

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(502);
    expect(String(json.error)).not.toMatch(/openai|prompt xyz/i);
  });

  it('preserves the status of an AppError raised inside the agent', async () => {
    runResumeAgent.mockRejectedValue(
      Errors.unauthorized('Resume agent requires an authenticated user.')
    );

    const { response } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(401);
  });

  it('does not mutate resume data when the agent fails', async () => {
    runResumeAgent.mockRejectedValue(new AgentError('resume-agent', 'MODEL_ERROR', 'boom'));

    await post({ jobDescription: JOB_DESCRIPTION });

    expectNoResumeMutations();
  });
});

describe('execution mode', () => {
  it('defaults to analyze when the body omits mode', async () => {
    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION });

    expect(response.status).toBe(200);
    expect(json.mode).toBe('analyze');
    expect(runResumeAgent).toHaveBeenCalledWith(expect.objectContaining({ mode: 'analyze' }), {
      userId: USER_ID,
      clerkId: CLERK_ID,
    });
  });

  it('passes propose mode through and echoes it back', async () => {
    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(response.status).toBe(200);
    expect(json.mode).toBe('propose');
    expect(runResumeAgent).toHaveBeenCalledWith(expect.objectContaining({ mode: 'propose' }), {
      userId: USER_ID,
      clerkId: CLERK_ID,
    });
  });

  it('returns the proposal session id and changes in propose mode', async () => {
    runResumeAgent.mockResolvedValue({
      output: {
        ...analysis(),
        proposedSessionId: 'session-1',
        proposedChanges: [
          {
            id: 'S',
            action: 'rewrite',
            where: 'Summary',
            status: 'proposed',
            before: 'Old summary.',
            after: 'New summary.',
            reason: 'Tailored to the posting',
          },
        ],
        proposalMessage: 'Saved 1 suggestion. The resume is unchanged.',
      },
      run: agentRun(),
    });

    const { json } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });
    const result = json.analysis as Record<string, unknown>;

    expect(result.proposedSessionId).toBe('session-1');
    expect(result.proposedChanges).toHaveLength(1);
    expect(String(result.proposalMessage)).toMatch(/resume is unchanged/i);
  });

  it.each([['apply'], ['delete'], ['ANALYZE'], ['']])(
    'rejects the unsupported mode %p without running the agent',
    async (mode) => {
      const { response } = await post({ jobDescription: JOB_DESCRIPTION, mode });

      expect(response.status).toBe(400);
      expect(runResumeAgent).not.toHaveBeenCalled();
    }
  );

  it('keeps rate limiting and identity checks in propose mode', async () => {
    agentRunCount.mockResolvedValue(RESUME_AGENT_LIMITS.dailyRuns);

    const { response } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(response.status).toBe(429);
    expect(runResumeAgent).not.toHaveBeenCalled();
  });

  it('still refuses an unowned resume in propose mode', async () => {
    profileFindFirst.mockResolvedValue(null);

    const { response } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' }, 'other');

    expect(response.status).toBe(404);
    expect(runResumeAgent).not.toHaveBeenCalled();
    expectNoResumeMutations();
  });
});
