/**
 * Frontend client for the Resume Agent endpoint.
 *
 * `fetch` is mocked throughout: no network, no Clerk, no database, no OpenAI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ResumeAgentNetworkError,
  ResumeAgentRequestError,
  runResumeAgentRequest,
  type ResumeAgentResponse,
} from '@/lib/resume-agent/client';

const RESUME_ID = 'p1';
const JOB_DESCRIPTION = `Senior Backend Engineer at Northwind

Requirements
Build backend services in Python. Work with PostgreSQL databases daily.
Kubernetes experience is required for this role.`;

const fetchMock = vi.fn();

function analysis(overrides: Record<string, unknown> = {}) {
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
    recommendations: [
      { requirement: 'Kubernetes', suggestion: 'Only add it if you have used it.' },
    ],
    scores: { requirementMatch: 66, keywordCoverage: 50, writing: 70 },
    limitations: [],
    proposedSessionId: null,
    proposedChanges: [],
    proposalMessage: null,
    ...overrides,
  };
}

function runMeta() {
  return {
    id: 'run-1',
    agentId: 'resume-agent',
    version: 'resume-agent-v1',
    status: 'succeeded',
    steps: 8,
    tokensUsed: { input: 1200, output: 300 },
    startedAt: '2026-11-16T00:00:00.000Z',
    finishedAt: '2026-11-16T00:00:12.000Z',
  };
}

/** A 200 with the route's success envelope. */
function ok(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

/** A refusal carrying whatever error body the route would send. */
function fail(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: async () => body,
  };
}

/** The flat `{ error: "..." }` shape the agent route answers with directly. */
function flat(message: string) {
  return { error: message };
}

/** The nested shape `handleApiError` returns for an AppError. */
function nested(code: string, message: string) {
  return { success: false, error: { code, message } };
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(
    ok({ success: true, mode: 'analyze', analysis: analysis(), run: runMeta() })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('request shape', () => {
  it('posts analyze mode to the resume’s agent endpoint', async () => {
    await runResumeAgentRequest(RESUME_ID, { jobDescription: JOB_DESCRIPTION, mode: 'analyze' });

    const { url, init, body } = lastCall();
    expect(url).toBe('/api/resumes/p1/agent');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(body).toEqual({ jobDescription: JOB_DESCRIPTION, mode: 'analyze' });
  });

  it('posts propose mode with the instruction the user typed', async () => {
    fetchMock.mockResolvedValue(
      ok({ success: true, mode: 'propose', analysis: analysis(), run: runMeta() })
    );

    await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      instruction: 'Tailor my summary',
      mode: 'propose',
    });

    const { url, body } = lastCall();
    expect(url).toBe('/api/resumes/p1/agent');
    expect(body).toEqual({
      jobDescription: JOB_DESCRIPTION,
      mode: 'propose',
      instruction: 'Tailor my summary',
    });
  });

  it('omits instruction entirely when it is undefined', async () => {
    await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      instruction: undefined,
      mode: 'analyze',
    });

    const { body } = lastCall();
    expect('instruction' in body).toBe(false);
    expect(Object.keys(body).sort()).toEqual(['jobDescription', 'mode']);
  });

  it('keeps an empty instruction, which is the caller’s choice to send', async () => {
    await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      instruction: '',
      mode: 'analyze',
    });

    expect(lastCall().body.instruction).toBe('');
  });

  it('url-encodes a resume id with characters that would break the path', async () => {
    await runResumeAgentRequest('a/b?c#d e', { jobDescription: JOB_DESCRIPTION, mode: 'analyze' });

    expect(lastCall().url).toBe('/api/resumes/a%2Fb%3Fc%23d%20e/agent');
  });

  it('never sends identity, budget or tool fields', async () => {
    await runResumeAgentRequest(
      RESUME_ID,
      {
        jobDescription: JOB_DESCRIPTION,
        mode: 'propose',
        // A caller that smuggles extra keys past the type gets them dropped
        // here, before the route's .strict() would reject the whole request.
        ...({
          userId: 'someone-else',
          clerkId: 'clerk_x',
          budget: { maxSteps: 500 },
          tools: [],
        } as object),
      },
      undefined
    );

    const { body } = lastCall();
    for (const forbidden of ['userId', 'clerkId', 'budget', 'tools']) {
      expect(body, `${forbidden} must never reach the server`).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(body).sort()).toEqual(['jobDescription', 'mode']);
  });

  it('sends same-origin credentials by relying on the session cookie', async () => {
    await runResumeAgentRequest(RESUME_ID, { jobDescription: JOB_DESCRIPTION, mode: 'analyze' });

    // A relative URL is same-origin, so the cookie rides along without the
    // client handling a token. No Authorization header is set.
    const { url, init } = lastCall();
    expect(url.startsWith('/api/')).toBe(true);
    expect(init.headers).not.toHaveProperty('Authorization');
  });
});

describe('successful response', () => {
  it('returns the full typed envelope', async () => {
    const body = { success: true, mode: 'analyze', analysis: analysis(), run: runMeta() };
    fetchMock.mockResolvedValue(ok(body));

    const result: ResumeAgentResponse = await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      mode: 'analyze',
    });

    expect(result.success).toBe(true);
    expect(result.mode).toBe('analyze');
    expect(result.run.id).toBe('run-1');
    expect(result.run.tokensUsed).toEqual({ input: 1200, output: 300 });
    expect(result.analysis.summary).toMatch(/Kubernetes is missing/);
    expect(result.analysis.strengths[0].term).toBe('Python');
    expect(result.analysis.missingRequirements[0].term).toBe('Kubernetes');
    expect(result.analysis.scores.requirementMatch).toBe(66);
  });

  it('carries a propose run’s session id and pending changes through', async () => {
    fetchMock.mockResolvedValue(
      ok({
        success: true,
        mode: 'propose',
        analysis: analysis({
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
        }),
        run: runMeta(),
      })
    );

    const result = await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      mode: 'propose',
    });

    expect(result.analysis.proposedSessionId).toBe('session-1');
    expect(result.analysis.proposedChanges).toHaveLength(1);
    expect(result.analysis.proposedChanges[0].status).toBe('proposed');
    expect(result.analysis.proposalMessage).toMatch(/resume is unchanged/i);
  });

  it('reads an analyze run as having proposed nothing', async () => {
    const result = await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      mode: 'analyze',
    });

    expect(result.analysis.proposedSessionId).toBeNull();
    expect(result.analysis.proposedChanges).toEqual([]);
    expect(result.analysis.proposalMessage).toBeNull();
  });
});

describe('HTTP errors', () => {
  async function expectRefusal(status: number, body: unknown) {
    fetchMock.mockResolvedValue(fail(status, body));
    const caught = await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      mode: 'analyze',
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ResumeAgentRequestError);
    return caught as ResumeAgentRequestError;
  }

  it('maps 400 past the route’s unhelpful "Invalid request body"', async () => {
    const error = await expectRefusal(400, {
      error: 'Invalid request body',
      details: { fieldErrors: { jobDescription: ['Too short'] } },
    });

    expect(error.status).toBe(400);
    expect(error.message).toBe('Check the job description and try again.');
    // The raw text is kept for logging, just not shown.
    expect(error.serverMessage).toBe('Invalid request body');
  });

  it('keeps a 400 that actually explains the problem', async () => {
    const error = await expectRefusal(
      400,
      nested('VALIDATION_ERROR', 'Add a bit more of the job description.')
    );

    expect(error.message).toBe('Add a bit more of the job description.');
  });

  it('maps 401 to a sign-in prompt', async () => {
    const error = await expectRefusal(401, flat('Unauthorized'));

    expect(error.status).toBe(401);
    expect(error.message).toMatch(/sign in again/i);
    expect(error.message).not.toBe('Unauthorized');
  });

  it('maps 404 to a missing resume', async () => {
    const error = await expectRefusal(404, flat('Resume not found'));

    expect(error.status).toBe(404);
    // "Resume not found" is informative, so it is kept as the server wrote it.
    expect(error.message).toBe('Resume not found');
  });

  it('replaces the uninformative 404 the route sends for a missing user', async () => {
    const error = await expectRefusal(404, flat('User not found'));

    expect(error.message).toBe('That resume is no longer available.');
  });

  it('keeps the server’s 429 message, which says which limit was hit', async () => {
    const error = await expectRefusal(
      429,
      nested('RATE_LIMITED', 'An analysis is already running for your account.')
    );

    expect(error.status).toBe(429);
    expect(error.message).toBe('An analysis is already running for your account.');
  });

  it('keeps the daily 429 message too', async () => {
    const error = await expectRefusal(
      429,
      nested('RATE_LIMITED', "You've used today's resume analyses. Try again tomorrow.")
    );

    expect(error.message).toMatch(/today's resume analyses/i);
  });

  it('falls back when a 429 body carries no message at all', async () => {
    const error = await expectRefusal(429, null);

    expect(error.status).toBe(429);
    expect(error.message).toMatch(/today's limit/i);
    expect(error.serverMessage).toBeNull();
  });

  it('maps 502 to a retryable agent failure', async () => {
    const error = await expectRefusal(
      502,
      flat('The analysis could not be completed. Try again in a moment.')
    );

    expect(error.status).toBe(502);
    expect(error.message).toMatch(/try again in a moment/i);
  });

  it('maps 503 to AI being unavailable', async () => {
    const error = await expectRefusal(
      503,
      nested('SERVICE_UNAVAILABLE', 'Resume analysis is unavailable right now.')
    );

    expect(error.status).toBe(503);
    expect(error.message).toMatch(/unavailable right now/i);
  });

  it('maps 504 to a timeout with advice', async () => {
    const error = await expectRefusal(
      504,
      flat('The analysis did not finish in time. Try a shorter job description.')
    );

    expect(error.status).toBe(504);
    expect(error.message).toMatch(/shorter job description/i);
  });

  it('handles a status with no mapping and an unreadable body', async () => {
    const error = await expectRefusal(418, 'not json at all');

    expect(error.status).toBe(418);
    expect(error.message).toBe('Something went wrong. Try again in a moment.');
  });

  it('does not treat a refusal as a network error', async () => {
    const error = await expectRefusal(502, flat('nope'));

    expect(error).not.toBeInstanceOf(ResumeAgentNetworkError);
  });
});

describe('cancellation and network failure', () => {
  it('forwards the AbortSignal to fetch', async () => {
    const controller = new AbortController();

    await runResumeAgentRequest(
      RESUME_ID,
      { jobDescription: JOB_DESCRIPTION, mode: 'analyze' },
      controller.signal
    );

    expect(lastCall().init.signal).toBe(controller.signal);
  });

  it('re-throws an AbortError untouched rather than calling it offline', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValue(abort);

    const caught = await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      mode: 'analyze',
    }).catch((error: unknown) => error);

    expect(caught).toBe(abort);
    expect(caught).not.toBeInstanceOf(ResumeAgentNetworkError);
    expect(caught).not.toBeInstanceOf(ResumeAgentRequestError);
  });

  it('re-throws a plain Error named AbortError, as Node’s fetch raises', async () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValue(abort);

    const caught = await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      mode: 'analyze',
    }).catch((error: unknown) => error);

    expect(caught).toBe(abort);
  });

  it('reports a failed connection as a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const caught = await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      mode: 'analyze',
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ResumeAgentNetworkError);
    expect((caught as Error).message).toMatch(/offline/i);
    expect(caught).not.toBeInstanceOf(ResumeAgentRequestError);
  });

  it('does not leak the underlying transport message to the user', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED 127.0.0.1:3000'));

    const caught = await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      mode: 'analyze',
    }).catch((error: unknown) => error);

    expect((caught as Error).message).not.toMatch(/ECONNREFUSED/);
  });
});
