/**
 * Resume Agent — end-to-end backend test.
 *
 * Everything between the HTTP request and the database runs for real: the
 * route, the rate limiter, `runResumeAgent`, the agent runtime's tool loop,
 * ownership resolution, requirement matching, grounding, and the edit-session
 * service that writes the pending proposal.
 *
 * Only three things are stubbed: Clerk (the session), the Prisma client (so no
 * database or production credential is involved), and the model turns.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/resumes/[resumeId]/agent/route';
import {
  __resetResumeAgentRateLimit,
  RESUME_AGENT_LIMITS,
} from '@/services/agents/resume/rate-limit';

import type { NextRequest } from 'next/server';

const {
  authMock,
  executeChatCompletion,
  executeAICall,
  userFindUnique,
  profileFindUnique,
  profileFindFirst,
  profileFindMany,
  sessionFindMany,
  sessionCreate,
  agentRunCount,
  agentRunUpsert,
  mutations,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  executeChatCompletion: vi.fn(),
  executeAICall: vi.fn(),
  userFindUnique: vi.fn(),
  profileFindUnique: vi.fn(),
  profileFindFirst: vi.fn(),
  profileFindMany: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionCreate: vi.fn(),
  agentRunCount: vi.fn(),
  agentRunUpsert: vi.fn(),
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
vi.mock('@/lib/ai-client', () => ({
  executeChatCompletion,
  executeAICall,
  isAIAvailable: () => true,
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: { ...mutations, findUnique: userFindUnique, findFirst: vi.fn(), findMany: vi.fn() },
    profile: {
      ...mutations,
      findUnique: profileFindUnique,
      findFirst: profileFindFirst,
      findMany: profileFindMany,
    },
    // `create` is its own spy: the pending review row is the only resume-side
    // write a proposal may cause, so it must not trip the mutation guard.
    resumeEditSession: {
      ...mutations,
      findFirst: vi.fn(),
      findMany: sessionFindMany,
      create: sessionCreate,
    },
    agentRun: { ...mutations, count: agentRunCount, upsert: agentRunUpsert },
    ...mutations,
  },
}));

// ---------------------------------------------------------------------------
// Fixtures — one development-shaped account with one resume
// ---------------------------------------------------------------------------

const CLERK_ID = 'clerk_e2e';
const USER_ID = 'user-e2e';
const RESUME_ID = 'resume-e2e';

const JOB_DESCRIPTION = `Senior Backend Engineer at Northwind Robotics

Requirements
Build backend services in Python. Work with PostgreSQL databases daily.
Kubernetes experience is required for this role.

Benefits
Medical, dental, vision. Flexible PTO.`;

/** The requirement reader is the one model call the tools make on their own. */
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
function profileRow() {
  return {
    id: RESUME_ID,
    userId: USER_ID,
    handle: 'alex-backend',
    resumeTitle: 'Backend Engineer',
    firstName: 'Alex',
    middleName: null,
    lastName: 'Rivera',
    headline: 'Backend Engineer',
    summary: 'Engineer building payment systems in Python.',
    location: 'San Francisco, CA',
    status: 'PUBLISHED',
    resumeVisibility: 'PRIVATE',
    isArchived: false,
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    contactInfo: { email: 'alex@example.test', phone: null, website: null },
    workExperiences: [
      {
        id: 'exp-acme',
        company: 'Acme',
        role: 'Backend Engineer',
        location: 'Remote',
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
    skills: [
      { name: 'Python', isVisible: true },
      { name: 'PostgreSQL', isVisible: true },
    ],
    skillGroups: [],
    educations: [
      {
        id: 'edu-1',
        institution: 'State University',
        degree: 'BS',
        fieldOfStudy: 'Computer Science',
        startDate: new Date('2014-09-01'),
        endDate: new Date('2018-06-01'),
        isCurrent: false,
        isVisible: true,
      },
    ],
    certifications: [],
    projects: [],
  };
}

// ---------------------------------------------------------------------------
// Mocked model turns
// ---------------------------------------------------------------------------

type Call = { id: string; type: 'function'; function: { name: string; arguments: string } };

function call(name: string, args: Record<string, unknown>, id = `call-${name}`): Call {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function turn(...calls: Call[]) {
  return {
    message: { role: 'assistant' as const, content: null, tool_calls: calls },
    meta: {
      model: 'gpt-test',
      tokensUsed: { input: 120, output: 40 },
      durationMs: 1,
      timestamp: new Date().toISOString(),
    },
  };
}

const SUBMIT_ARGS = {
  summary: 'Python and PostgreSQL are well evidenced; Kubernetes is not on the resume.',
  recommendations: [
    { requirement: 'Kubernetes', suggestion: 'Only add it if you have actually used it at work.' },
  ],
  limitations: [],
};

/** A summary rewrite that invents nothing — grounding keeps it. */
const GROUNDED_REWRITE = {
  ref: 'S',
  text: 'Backend engineer building payment systems in Python and PostgreSQL.',
};

function proposeFlow(changes: Array<Record<string, unknown>> = [GROUNDED_REWRITE]) {
  return [
    turn(call('get_resume', { resumeId: RESUME_ID })),
    turn(call('analyze_job_description', { jobDescription: JOB_DESCRIPTION })),
    turn(call('score_resume_against_jd', { resumeId: RESUME_ID })),
    turn(call('read_resume_lines', { resumeId: RESUME_ID })),
    turn(
      call('propose_resume_edits', {
        resumeId: RESUME_ID,
        request: 'Tailor the summary to this posting',
        changes,
      })
    ),
    turn(call('submit_resume_result', SUBMIT_ARGS)),
  ];
}

function queue(turns: Array<ReturnType<typeof turn>>) {
  for (const t of turns) executeChatCompletion.mockResolvedValueOnce(t);
}

// ---------------------------------------------------------------------------

function request(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

async function post(body: unknown, resumeId = RESUME_ID) {
  const response = await POST(request(body), { params: Promise.resolve({ resumeId }) });
  return { response, json: (await response.json()) as Record<string, unknown> };
}

function expectNoResumeMutations() {
  for (const [name, spy] of Object.entries(mutations)) {
    expect(
      spy,
      `db.${name} must never run: the agent cannot change a resume`
    ).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetResumeAgentRateLimit();

  authMock.mockResolvedValue({ userId: CLERK_ID });
  executeAICall.mockResolvedValue(modelRequirements());
  agentRunCount.mockResolvedValue(0);
  agentRunUpsert.mockResolvedValue({});

  // One Clerk identity maps to one Follio user, which owns one resume.
  // `user.findUnique` is reached with both key shapes: `{ clerkId }` from the
  // route and from resolveActiveProfileContext, `{ id }` from listOwnedResumes.
  userFindUnique.mockImplementation(({ where }: { where: { clerkId?: string; id?: string } }) => {
    const mine = where.clerkId === CLERK_ID || where.id === USER_ID;
    return Promise.resolve(mine ? { id: USER_ID, profile: { id: RESUME_ID } } : null);
  });
  profileFindMany.mockResolvedValue([profileRow()]);
  profileFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === RESUME_ID ? profileRow() : null)
  );
  profileFindFirst.mockImplementation(({ where }: { where: { id?: string; userId?: string } }) => {
    const mine =
      (where.id === undefined || where.id === RESUME_ID) &&
      (where.userId === undefined || where.userId === USER_ID);
    return Promise.resolve(mine ? { id: RESUME_ID } : null);
  });

  sessionFindMany.mockResolvedValue([]);
  sessionCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'session-e2e',
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

describe('POST /api/resumes/[resumeId]/agent — propose mode, full stack', () => {
  it('returns a grounded analysis and the real pending session id', async () => {
    queue(proposeFlow());

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });
    const analysis = json.analysis as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.mode).toBe('propose');

    // The id came out of the database row, through the tool, through memory.
    expect(analysis.proposedSessionId).toBe('session-e2e');
    expect(sessionCreate).toHaveBeenCalledTimes(1);

    // Requirement matching is real: Python and PostgreSQL are on the resume,
    // Kubernetes is not, and nothing in the flow could change that.
    expect((analysis.strengths as Array<{ term: string }>).map((s) => s.term)).toEqual(
      expect.arrayContaining(['Python', 'PostgreSQL'])
    );
    expect((analysis.missingRequirements as Array<{ term: string }>).map((g) => g.term)).toEqual([
      'Kubernetes',
    ]);
  });

  it('writes the pending session against the caller’s own resume and user', async () => {
    queue(proposeFlow());

    await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    const written = sessionCreate.mock.calls[0][0] as {
      data: { userId: string; profileId: string; brief: { via: string } };
    };
    expect(written.data.userId).toBe(USER_ID);
    expect(written.data.profileId).toBe(RESUME_ID);
    // Tagged so an agent-written set stays identifiable in the builder.
    expect(written.data.brief.via).toBe('Follio Resume Agent');
  });

  it('leaves the resume itself untouched', async () => {
    queue(proposeFlow());

    const { response } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(response.status).toBe(200);
    expectNoResumeMutations();
  });

  it('returns the proposed change still awaiting the user’s approval', async () => {
    queue(proposeFlow());

    const { json } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });
    const changes = (json.analysis as { proposedChanges: Array<Record<string, unknown>> })
      .proposedChanges;

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ status: 'proposed', where: expect.any(String) });
    expect(String(changes[0].after)).toMatch(/PostgreSQL/);
    expect(String((json.analysis as { proposalMessage: string }).proposalMessage)).toMatch(
      /resume is unchanged/i
    );
  });

  it('runs the whole flow through the agent runtime, not a hard-coded sequence', async () => {
    queue(proposeFlow());

    const { json } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });
    const run = json.run as { status: string; steps: number; agentId: string };

    expect(run.agentId).toBe('resume-agent');
    expect(run.status).toBe('succeeded');
    // 6 model turns plus 6 tool executions.
    expect(run.steps).toBe(12);
    expect(executeChatCompletion).toHaveBeenCalledTimes(6);
    expect(agentRunUpsert).toHaveBeenCalledTimes(1);
  });

  it('drops a rewrite that invents a skill, and saves no session', async () => {
    queue(proposeFlow([{ ref: 'E1.1', text: 'Ran Python services on Kubernetes clusters.' }]));

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });
    const analysis = json.analysis as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(analysis.proposedSessionId).toBeNull();
    expect(analysis.proposedChanges).toEqual([]);
    expect(sessionCreate).not.toHaveBeenCalled();
    expect((analysis.limitations as string[]).join(' ')).toMatch(/No edit was proposed/i);
  });

  it('creates one session even when the model proposes twice', async () => {
    const flow = proposeFlow();
    queue([
      ...flow.slice(0, 5),
      turn(
        call(
          'propose_resume_edits',
          {
            resumeId: RESUME_ID,
            request: 'Tailor the first bullet too',
            changes: [
              { ref: 'E1.2', text: 'Tuned PostgreSQL queries for a service handling 2x traffic' },
            ],
          },
          'call-propose-again'
        )
      ),
      flow[5],
    ]);

    const { json } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(sessionCreate).toHaveBeenCalledTimes(1);
    expect((json.analysis as { proposedSessionId: string }).proposedSessionId).toBe('session-e2e');
  });
});

describe('POST /api/resumes/[resumeId]/agent — analyze mode, full stack', () => {
  it('produces an analysis and no session at all', async () => {
    queue([
      turn(call('get_resume', { resumeId: RESUME_ID })),
      turn(call('analyze_job_description', { jobDescription: JOB_DESCRIPTION })),
      turn(call('score_resume_against_jd', { resumeId: RESUME_ID })),
      turn(call('submit_resume_result', SUBMIT_ARGS)),
    ]);

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION });
    const analysis = json.analysis as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json.mode).toBe('analyze');
    expect(analysis.proposedSessionId).toBeNull();
    expect(analysis.proposedChanges).toEqual([]);
    expect(sessionCreate).not.toHaveBeenCalled();
    expectNoResumeMutations();
  });

  it('does not expose the editing tools to the model', async () => {
    queue([
      turn(call('analyze_job_description', { jobDescription: JOB_DESCRIPTION })),
      turn(call('score_resume_against_jd', { resumeId: RESUME_ID })),
      turn(call('submit_resume_result', SUBMIT_ARGS)),
    ]);

    await post({ jobDescription: JOB_DESCRIPTION });

    const offered = (
      executeChatCompletion.mock.calls[0][0] as {
        tools: Array<{ function: { name: string } }>;
      }
    ).tools.map((tool) => tool.function.name);

    expect(offered).not.toContain('propose_resume_edits');
    expect(offered).not.toContain('read_resume_lines');
    expect(offered.some((name) => /apply|revert|delete|publish/i.test(name))).toBe(false);
  });
});

describe('POST /api/resumes/[resumeId]/agent — refusals reach no model', () => {
  it('rejects an unauthenticated request', async () => {
    authMock.mockResolvedValue({ userId: null });

    const { response } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(response.status).toBe(401);
    expect(executeChatCompletion).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('rejects a resume the caller does not own, before the model runs', async () => {
    const { response, json } = await post(
      { jobDescription: JOB_DESCRIPTION, mode: 'propose' },
      'someone-elses-resume'
    );

    expect(response.status).toBe(404);
    // Phrased as missing, so it never confirms another account's resume exists.
    expect(json.error).toBe('Resume not found');
    expect(executeChatCompletion).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
    expectNoResumeMutations();
  });

  it('refuses a Clerk identity with no Follio user', async () => {
    userFindUnique.mockResolvedValue(null);

    const { response } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(response.status).toBe(404);
    expect(executeChatCompletion).not.toHaveBeenCalled();
  });

  it('ignores identity and budget fields smuggled into the body', async () => {
    const { response } = await post({
      jobDescription: JOB_DESCRIPTION,
      mode: 'propose',
      userId: 'someone-else',
      clerkId: 'clerk_attacker',
      budget: { maxSteps: 500 },
    });

    expect(response.status).toBe(400);
    expect(executeChatCompletion).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses once the caller is over the daily run limit', async () => {
    agentRunCount.mockResolvedValue(RESUME_AGENT_LIMITS.dailyRuns);

    const { response } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(response.status).toBe(429);
    expect(executeChatCompletion).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/resumes/[resumeId]/agent — failures do not report success', () => {
  it('returns 504 and no analysis when the model never finishes', async () => {
    executeChatCompletion.mockResolvedValue(
      turn(call('get_resume', { resumeId: RESUME_ID }, 'spin'))
    );

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(response.status).toBe(504);
    expect(json.success).toBeUndefined();
    expect(json.analysis).toBeUndefined();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('does not leak the internal failure detail to the caller', async () => {
    executeChatCompletion.mockRejectedValue(new Error('upstream key sk-live-123 rejected'));

    const { response, json } = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(response.status).toBe(502);
    expect(JSON.stringify(json)).not.toMatch(/sk-live-123/);
  });

  it('releases the concurrency slot after a failed run', async () => {
    executeChatCompletion.mockRejectedValueOnce(new Error('transient'));

    const first = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });
    expect(first.response.status).toBe(502);

    queue(proposeFlow());
    const second = await post({ jobDescription: JOB_DESCRIPTION, mode: 'propose' });

    expect(second.response.status).toBe(200);
  });
});
