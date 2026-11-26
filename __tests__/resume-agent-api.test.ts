/**
 * Resume Agent API route + its billable-request guard.
 *
 * The route's job is to decide *whether* the agent may run, for whom, and on
 * what input, so these tests focus on the gate rather than on the agent (which
 * is mocked here — see resume-agent-integration.test.ts for tests that run the
 * real agent and its tools): authentication, ownership, AI availability, rate
 * limiting, request-body validation, and the rule that identity is never taken
 * from the request.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NextRequest } from 'next/server';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const profileFindFirst = vi.fn();
const isAIAvailableMock = vi.fn(() => true);
const runResumeAgentMock = vi.fn();
const runResumeOrchestratorMock = vi.fn();
const isMultiAgentEnabledMock = vi.fn(() => false);

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    profile: { findFirst: (...args: unknown[]) => profileFindFirst(...args) },
  },
}));

vi.mock('@/lib/ai-client', () => ({
  isAIAvailable: () => isAIAvailableMock(),
}));

vi.mock('@/lib/features', () => ({
  isMultiAgentResumeEnabled: () => isMultiAgentEnabledMock(),
}));

vi.mock('@/services/agents/resume/orchestrator.agent', () => ({
  runResumeOrchestrator: (...args: unknown[]) => runResumeOrchestratorMock(...args),
}));

vi.mock('@/services/agents/resume/resume.agent', async () => {
  // The route imports RESUME_AGENT_MODES for its body schema, so the real
  // constant has to survive the mock — only the runner is replaced.
  const actual = await vi.importActual<typeof import('@/services/agents/resume/resume.agent')>(
    '@/services/agents/resume/resume.agent'
  );
  return {
    ...actual,
    runResumeAgent: (...args: unknown[]) => runResumeAgentMock(...args),
  };
});

import { POST } from '@/app/api/resumes/[resumeId]/agent/route';
import {
  RATE_LIMIT,
  RUN_COST,
  acquireAgentRun,
  releaseAgentRun,
  resetAgentRateLimit,
} from '@/app/api/resumes/[resumeId]/agent/rate-limit';

const RESUME_ID = 'resume_abc123';
const USER_ID = 'user_internal_1';
const CLERK_ID = 'clerk_external_1';

const VALID_JD = `Senior Backend Engineer
We need an engineer fluent in TypeScript who has shipped services on Kubernetes.
You will design APIs and own reliability for a distributed platform.`;

interface CallOptions {
  resumeId?: string;
  /** Omit for the no-body request the route accepted before modes existed. */
  body?: unknown;
  /** Send raw text instead of JSON, for malformed-body tests. */
  rawBody?: string;
  /** Override the declared Content-Length, for the oversized-body test. */
  contentLength?: string;
}

function callRoute(options: CallOptions = {}) {
  const { resumeId = RESUME_ID, body, rawBody, contentLength } = options;
  const text = rawBody !== undefined ? rawBody : body === undefined ? '' : JSON.stringify(body);

  const request = {
    method: 'POST',
    // Next gives route handlers an AbortSignal that fires when the client
    // disconnects; the route forwards it into the agent context.
    signal: new AbortController().signal,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-length' ? (contentLength ?? String(text.length)) : null,
    },
    text: async () => text,
  } as unknown as NextRequest;

  return POST(request, { params: Promise.resolve({ resumeId }) });
}

function agentResult() {
  return {
    output: {
      resumeId: RESUME_ID,
      resumeTitle: 'Resume-Nov',
      name: 'Alex Morgan',
      summary: 'A product engineer with three roles.',
      highlights: ['Shipped the billing rewrite'],
      counts: { experiences: 3, education: 2, skills: 26, projects: 2 },
      missingSections: [],
      limitations: [],
    },
    run: {
      id: 'run_1',
      agentId: 'resume-agent',
      version: 'resume-agent-v2-evaluation',
      status: 'succeeded',
      stepMetas: [],
      totalTokensUsed: { input: 1200, output: 300 },
      startedAt: new Date().toISOString(),
    },
  };
}

/** What `runResumeOrchestrator` resolves to. A different shape on purpose. */
function orchestratorResult() {
  return {
    output: {
      resumeId: RESUME_ID,
      mode: 'general',
      summary: 'Readable, but under-evidenced.',
      recommendations: ['Add figures where you have them.'],
      agentsUsed: ['resume-evaluation'],
      evaluation: {
        assessment: 'Bullets lean on filler.',
        recommendations: ['Replace "responsible for".'],
        counts: {
          experiences: 3,
          education: 2,
          skills: 26,
          projects: 2,
          totalBullets: 8,
          bulletsWithMetrics: 2,
        },
        metricCoveragePercent: 25,
        missingSections: [],
        findings: [],
        basis: 'Computed from the text of this resume.',
        limitations: [],
      },
      limitations: [],
    },
    run: {
      id: 'run_orchestrated',
      agentId: 'resume-orchestrator',
      version: 'resume-orchestrator-v1',
      status: 'succeeded',
      stepMetas: [],
      totalTokensUsed: { input: 4000, output: 900 },
      startedAt: new Date().toISOString(),
    },
  };
}

/** Signed in, user row present, resume owned, AI configured. */
function happyPath() {
  authMock.mockResolvedValue({ userId: CLERK_ID });
  userFindUnique.mockResolvedValue({ id: USER_ID });
  profileFindFirst.mockResolvedValue({ id: RESUME_ID });
  isAIAvailableMock.mockReturnValue(true);
  isMultiAgentEnabledMock.mockReturnValue(false);
  runResumeAgentMock.mockResolvedValue(agentResult());
  runResumeOrchestratorMock.mockResolvedValue(orchestratorResult());
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAgentRateLimit();
  isAIAvailableMock.mockReturnValue(true);
  isMultiAgentEnabledMock.mockReturnValue(false);
});

describe('POST /api/resumes/[resumeId]/agent — authentication', () => {
  it('rejects an unauthenticated caller with 401 and never runs the agent', async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await callRoute();

    expect(response.status).toBe(401);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the Clerk session has no Follio user row', async () => {
    authMock.mockResolvedValue({ userId: CLERK_ID });
    userFindUnique.mockResolvedValue(null);

    const response = await callRoute();

    expect(response.status).toBe(404);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('resolves the Follio user from the Clerk id, not from the request', async () => {
    happyPath();

    await callRoute();

    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clerkId: CLERK_ID } })
    );
  });
});

describe('POST /api/resumes/[resumeId]/agent — ownership', () => {
  it('scopes the resume lookup to the authenticated user', async () => {
    happyPath();

    await callRoute();

    const [query] = profileFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(query.where).toMatchObject({ id: RESUME_ID, userId: USER_ID });
  });

  it('returns 404 for a resume the user does not own, without running the agent', async () => {
    authMock.mockResolvedValue({ userId: CLERK_ID });
    userFindUnique.mockResolvedValue({ id: USER_ID });
    profileFindFirst.mockResolvedValue(null);

    const response = await callRoute({ resumeId: 'someone_elses_resume' });

    expect(response.status).toBe(404);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('checks ownership before validating the body, so a stranger cannot probe it', async () => {
    authMock.mockResolvedValue({ userId: CLERK_ID });
    userFindUnique.mockResolvedValue({ id: USER_ID });
    profileFindFirst.mockResolvedValue(null);

    const response = await callRoute({
      resumeId: 'someone_elses_resume',
      body: { mode: 'not-a-mode' },
    });

    // 404, not 400 — the body is never reached.
    expect(response.status).toBe(404);
  });

  it('passes the path resumeId and the session userId to the agent', async () => {
    happyPath();

    await callRoute();

    const [input, auth] = runResumeAgentMock.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(input).toMatchObject({ resumeId: RESUME_ID, mode: 'general' });
    expect(auth).toEqual({ userId: USER_ID });
  });
});

describe('POST /api/resumes/[resumeId]/agent — body validation', () => {
  it('treats a request with no body as a general analysis (backward compatible)', async () => {
    happyPath();

    const response = await callRoute();

    expect(response.status).toBe(200);
    const [input] = runResumeAgentMock.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({ mode: 'general', resumeId: RESUME_ID });
  });

  it('accepts an explicit general mode', async () => {
    happyPath();

    const response = await callRoute({ body: { mode: 'general' } });

    expect(response.status).toBe(200);
  });

  it('passes a validated job description through for jd mode', async () => {
    happyPath();

    const response = await callRoute({ body: { mode: 'jd', jobDescription: VALID_JD } });

    expect(response.status).toBe(200);
    const [input] = runResumeAgentMock.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({ mode: 'jd', jobDescription: VALID_JD.trim() });
  });

  it('rejects a job description that is too short', async () => {
    happyPath();

    const response = await callRoute({ body: { mode: 'jd', jobDescription: 'Backend dev' } });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/more of the job description/i);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('rejects a job description that is only a link', async () => {
    happyPath();

    const response = await callRoute({
      body: { mode: 'jd', jobDescription: 'https://example.com/jobs/12345678901234567890' },
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/not the link/i);
  });

  it('rejects jd mode with no job description at all', async () => {
    happyPath();

    const response = await callRoute({ body: { mode: 'jd' } });

    expect(response.status).toBe(400);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('resolves a target role to its canonical id', async () => {
    happyPath();

    const response = await callRoute({
      body: { mode: 'role', targetRole: 'Technical Program Manager' },
    });

    expect(response.status).toBe(200);
    const [input] = runResumeAgentMock.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({ mode: 'role', targetRole: 'technical-program-manager' });
  });

  it('rejects an unsupported target role and lists the supported ones', async () => {
    happyPath();

    const response = await callRoute({
      body: { mode: 'role', targetRole: 'Chief Vibes Officer' },
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/not a supported target role/i);
    expect(payload.error).toMatch(/Technical Program Manager/);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown mode', async () => {
    happyPath();

    const response = await callRoute({ body: { mode: 'rewrite' } });

    expect(response.status).toBe(400);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('rejects a job description sent without selecting jd mode', async () => {
    happyPath();

    const response = await callRoute({ body: { jobDescription: VALID_JD } });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/without selecting that mode/i);
  });

  it('rejects client-supplied identity fields rather than ignoring them', async () => {
    happyPath();

    const response = await callRoute({
      body: { mode: 'general', userId: 'someone_else', resumeId: 'another_resume' },
    });

    expect(response.status).toBe(400);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    happyPath();

    const response = await callRoute({ rawBody: '{"mode": "jd"' });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/valid JSON/i);
  });

  it('rejects a JSON array body', async () => {
    happyPath();

    const response = await callRoute({ body: ['general'] });

    expect(response.status).toBe(400);
  });

  it('rejects an oversized body on its declared length, before parsing', async () => {
    happyPath();

    const response = await callRoute({
      body: { mode: 'general' },
      contentLength: String(10_000_000),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/too large/i);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized body even when Content-Length lies', async () => {
    happyPath();

    const response = await callRoute({
      rawBody: JSON.stringify({ mode: 'jd', jobDescription: 'x'.repeat(300_000) }),
      contentLength: '10',
    });

    expect(response.status).toBe(400);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('rejects an over-long instruction', async () => {
    happyPath();

    const response = await callRoute({
      body: { mode: 'general', instruction: 'x'.repeat(5_000) },
    });

    expect(response.status).toBe(400);
  });

  it('does not consume a rate-limit slot when the body is invalid', async () => {
    happyPath();

    for (let i = 0; i < RATE_LIMIT.maxRunsPerWindow + 2; i++) {
      expect((await callRoute({ body: { mode: 'rewrite' } })).status).toBe(400);
    }

    // The window is untouched, so a valid request still succeeds.
    expect((await callRoute()).status).toBe(200);
  });
});

describe('POST /api/resumes/[resumeId]/agent — AI availability', () => {
  it('returns 503 when no AI key is configured', async () => {
    happyPath();
    isAIAvailableMock.mockReturnValue(false);

    const response = await callRoute();

    expect(response.status).toBe(503);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/resumes/[resumeId]/agent — success', () => {
  it('returns the validated analysis and run metadata', async () => {
    happyPath();

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis).toMatchObject({
      resumeId: RESUME_ID,
      counts: { experiences: 3, education: 2, skills: 26, projects: 2 },
    });
    expect(body.run).toMatchObject({ status: 'succeeded', tokensUsed: 1500 });
  });
});

describe('POST /api/resumes/[resumeId]/agent — rate limiting', () => {
  it('returns 429 with Retry-After once the window quota is spent', async () => {
    happyPath();

    for (let i = 0; i < RATE_LIMIT.maxRunsPerWindow; i++) {
      expect((await callRoute()).status).toBe(200);
    }

    const blocked = await callRoute();

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(runResumeAgentMock).toHaveBeenCalledTimes(RATE_LIMIT.maxRunsPerWindow);
  });

  it('frees the in-flight slot when the agent throws, so the next call is not blocked', async () => {
    happyPath();
    runResumeAgentMock.mockRejectedValueOnce(new Error('model exploded'));

    const failed = await callRoute();
    expect(failed.status).toBeGreaterThanOrEqual(500);

    runResumeAgentMock.mockResolvedValue(agentResult());
    const second = await callRoute();

    // Not 429 — the failed run released its slot.
    expect(second.status).toBe(200);
  });
});

describe('agent rate limiter', () => {
  it('allows one run and blocks a second while it is in flight', () => {
    expect(acquireAgentRun(USER_ID).allowed).toBe(true);

    const concurrent = acquireAgentRun(USER_ID);

    expect(concurrent).toMatchObject({ allowed: false, reason: 'concurrent' });
  });

  it('counts completed runs against the window', () => {
    for (let i = 0; i < RATE_LIMIT.maxRunsPerWindow; i++) {
      expect(acquireAgentRun(USER_ID).allowed).toBe(true);
      releaseAgentRun(USER_ID);
    }

    expect(acquireAgentRun(USER_ID)).toMatchObject({ allowed: false, reason: 'quota' });
  });

  it('allows runs again once the window has passed', () => {
    const start = 1_000_000;

    for (let i = 0; i < RATE_LIMIT.maxRunsPerWindow; i++) {
      expect(acquireAgentRun(USER_ID, start).allowed).toBe(true);
      releaseAgentRun(USER_ID);
    }
    expect(acquireAgentRun(USER_ID, start).allowed).toBe(false);

    const afterWindow = start + RATE_LIMIT.windowMs + 1;
    expect(acquireAgentRun(USER_ID, afterWindow).allowed).toBe(true);
  });

  it('tracks each user separately', () => {
    expect(acquireAgentRun('user_a').allowed).toBe(true);

    // user_a is in flight; user_b must be unaffected.
    expect(acquireAgentRun('user_b').allowed).toBe(true);
  });

  it('charges a costly run more than one slot', () => {
    const start = 1_000_000;

    // Two multi-agent runs spend 4 of the 5 slots in the window.
    expect(acquireAgentRun(USER_ID, start, RUN_COST.multiAgent).allowed).toBe(true);
    releaseAgentRun(USER_ID);
    expect(acquireAgentRun(USER_ID, start, RUN_COST.multiAgent).allowed).toBe(true);
    releaseAgentRun(USER_ID);

    // A third would need 6, so it is refused outright rather than part-charged.
    expect(acquireAgentRun(USER_ID, start, RUN_COST.multiAgent)).toMatchObject({
      allowed: false,
      reason: 'quota',
    });

    // A cheaper run still fits in the one slot that remains.
    expect(acquireAgentRun(USER_ID, start, RUN_COST.singleAgent).allowed).toBe(true);
  });

  it('ages a costly run out of the window like any other', () => {
    const start = 1_000_000;

    expect(acquireAgentRun(USER_ID, start, RUN_COST.multiAgent).allowed).toBe(true);
    releaseAgentRun(USER_ID);
    expect(acquireAgentRun(USER_ID, start, RUN_COST.multiAgent).allowed).toBe(true);
    releaseAgentRun(USER_ID);
    expect(acquireAgentRun(USER_ID, start, RUN_COST.multiAgent).allowed).toBe(false);

    const afterWindow = start + RATE_LIMIT.windowMs + 1;
    expect(acquireAgentRun(USER_ID, afterWindow, RUN_COST.multiAgent).allowed).toBe(true);
  });
});

describe('POST /api/resumes/[resumeId]/agent — execution engine', () => {
  it('runs the single-agent Resume Agent when the flag is off', async () => {
    happyPath();
    isMultiAgentEnabledMock.mockReturnValue(false);

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runResumeAgentMock).toHaveBeenCalledTimes(1);
    expect(runResumeOrchestratorMock).not.toHaveBeenCalled();
    expect(body.engine).toBe('single-agent');
  });

  it('runs the orchestrator when the flag is on', async () => {
    happyPath();
    isMultiAgentEnabledMock.mockReturnValue(true);

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runResumeOrchestratorMock).toHaveBeenCalledTimes(1);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
    expect(body.engine).toBe('multi-agent');
    // The richer payload is returned as-is, not flattened into the old shape.
    expect(body.analysis.agentsUsed).toEqual(['resume-evaluation']);
    expect(body.analysis.evaluation.metricCoveragePercent).toBe(25);
  });

  it('runs exactly one engine per request, in both settings', async () => {
    happyPath();

    isMultiAgentEnabledMock.mockReturnValue(false);
    await callRoute();
    isMultiAgentEnabledMock.mockReturnValue(true);
    await callRoute();

    expect(runResumeAgentMock).toHaveBeenCalledTimes(1);
    expect(runResumeOrchestratorMock).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to the other engine when one fails', async () => {
    happyPath();
    isMultiAgentEnabledMock.mockReturnValue(true);
    runResumeOrchestratorMock.mockRejectedValueOnce(new Error('orchestrator exploded'));

    const response = await callRoute();

    expect(response.status).toBeGreaterThanOrEqual(500);
    // A silent retry would hide the failure and bill for a second run.
    expect(runResumeAgentMock).not.toHaveBeenCalled();
  });

  it('passes the same validated input and trusted identity to either engine', async () => {
    happyPath();
    isMultiAgentEnabledMock.mockReturnValue(true);

    await callRoute({ body: { mode: 'role', targetRole: 'Technical Program Manager' } });

    const [input, auth] = runResumeOrchestratorMock.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(input).toMatchObject({
      resumeId: RESUME_ID,
      mode: 'role',
      targetRole: 'technical-program-manager',
    });
    expect(auth).toEqual({ userId: USER_ID });
  });

  it('forwards the request signal so a disconnect stops the run', async () => {
    happyPath();
    isMultiAgentEnabledMock.mockReturnValue(true);

    await callRoute();

    const [, , ctx] = runResumeOrchestratorMock.mock.calls[0] as [
      unknown,
      unknown,
      { signal?: AbortSignal },
    ];
    expect(ctx?.signal).toBeDefined();
  });

  it('refuses a client that tries to choose the engine itself', async () => {
    happyPath();

    const response = await callRoute({ body: { mode: 'general', engine: 'multi-agent' } });

    expect(response.status).toBe(400);
    expect(runResumeAgentMock).not.toHaveBeenCalled();
    expect(runResumeOrchestratorMock).not.toHaveBeenCalled();
  });

  it('charges a multi-agent run more quota than a single-agent one', async () => {
    happyPath();
    isMultiAgentEnabledMock.mockReturnValue(true);

    // RUN_COST.multiAgent is 2 and the window allows 5, so the third run is
    // refused where a single-agent user would still have budget.
    expect((await callRoute()).status).toBe(200);
    expect((await callRoute()).status).toBe(200);
    const blocked = await callRoute();

    expect(blocked.status).toBe(429);
    expect(runResumeOrchestratorMock).toHaveBeenCalledTimes(2);
  });

  it('still allows the full single-agent allowance when the flag is off', async () => {
    happyPath();
    isMultiAgentEnabledMock.mockReturnValue(false);

    for (let i = 0; i < RATE_LIMIT.maxRunsPerWindow; i++) {
      expect((await callRoute()).status).toBe(200);
    }
    expect((await callRoute()).status).toBe(429);
  });
});
