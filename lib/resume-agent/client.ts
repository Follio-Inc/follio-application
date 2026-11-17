/**
 * Browser calls for the Resume Agent.
 *
 * One endpoint, two modes: `analyze` reads and scores the resume against a
 * posting, `propose` may additionally save a pending edit session the user
 * reviews in the builder. Neither applies anything to the resume.
 *
 * Identity comes from the Clerk session cookie on a same-origin request. The
 * route's body schema is `.strict()`, so a request carrying userId, clerkId,
 * tools or budget is rejected outright — this client never sends them.
 */

import { readErrorMessage } from '@/lib/resume-edit/client';

import type { ResumeAgentMode, ResumeAgentOutput } from '@/services/agents/resume/resume.agent';
import type { AgentId, AgentRunStatus, AgentTokenUsage } from '@/types/agents';

// `import type` is erased at compile time, so naming the server module here
// pulls no runtime code — and no Prisma client — into the browser bundle. It
// keeps one definition of the result instead of a copy that can drift.
export type { ResumeAgentMode };

/** The grounded analysis, exactly as the agent's result schema defines it. */
export type ResumeAgentAnalysis = ResumeAgentOutput;

/** One proposed rewrite awaiting the user's approval. Display only. */
export type ResumeAgentProposedChange = ResumeAgentAnalysis['proposedChanges'][number];

/** Summary run metadata. Step details and prompts stay server-side. */
export interface ResumeAgentRunMeta {
  id: string;
  agentId: AgentId;
  version: string;
  status: AgentRunStatus;
  steps: number;
  tokensUsed: AgentTokenUsage;
  startedAt: string;
  finishedAt: string | null;
}

export interface ResumeAgentResponse {
  success: true;
  mode: ResumeAgentMode;
  analysis: ResumeAgentAnalysis;
  run: ResumeAgentRunMeta;
}

/** Everything the caller may send. Anything else is a 400 at the route. */
export interface ResumeAgentRequestInput {
  jobDescription: string;
  instruction?: string;
  mode: ResumeAgentMode;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * The request reached the server and came back refused.
 *
 * `status` is carried so a caller can tell a limit (429) from a timeout (504)
 * without matching on prose. `message` is already safe to show.
 */
export class ResumeAgentRequestError extends Error {
  readonly status: number;
  /** What the server said, when it said anything readable. */
  readonly serverMessage: string | null;

  constructor(status: number, message: string, serverMessage: string | null) {
    super(message);
    this.name = 'ResumeAgentRequestError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

/** The request never completed: offline, DNS, or a dropped connection. */
export class ResumeAgentNetworkError extends Error {
  constructor(message = 'You appear to be offline. Check your connection and try again.') {
    super(message);
    this.name = 'ResumeAgentNetworkError';
  }
}

/**
 * What to show when the server offers nothing better. Keyed to the statuses
 * this route actually returns.
 */
const FALLBACK: Record<number, string> = {
  400: 'Check the job description and try again.',
  401: 'Your session has expired. Refresh the page and sign in again.',
  404: 'That resume is no longer available.',
  429: "You've reached today's limit for resume analysis. Try again tomorrow.",
  502: 'The analysis could not be completed. Try again in a moment.',
  503: 'Resume analysis is unavailable right now.',
  504: 'The analysis did not finish in time. Try a shorter job description.',
};

/**
 * Server messages that name the failure without telling the user anything
 * they can act on. The fallback reads better, so prefer it over these.
 */
const UNHELPFUL = new Set(['invalid request body', 'unauthorized', 'user not found']);

function messageFor(status: number, serverMessage: string | null): string {
  const useful = serverMessage && !UNHELPFUL.has(serverMessage.trim().toLowerCase());
  if (useful) return serverMessage;
  return FALLBACK[status] ?? 'Something went wrong. Try again in a moment.';
}

/** True for the abort a cancelled request raises, in browsers and in Node. */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

// ============================================================================
// Request
// ============================================================================

/**
 * Run the Resume Agent over one of the signed-in user's resumes.
 *
 * Named apart from the server-side `runResumeAgent` so an import of the wrong
 * one is obvious at the call site.
 *
 * @throws {ResumeAgentRequestError} the server refused the request
 * @throws {ResumeAgentNetworkError} the request never completed
 * @throws {DOMException} `AbortError`, re-thrown untouched when `signal` fires
 */
export async function runResumeAgentRequest(
  resumeId: string,
  input: ResumeAgentRequestInput,
  signal?: AbortSignal
): Promise<ResumeAgentResponse> {
  // Only these three fields. Identity is the session cookie's job, and the
  // budget is the server's.
  const body: ResumeAgentRequestInput = {
    jobDescription: input.jobDescription,
    mode: input.mode,
    ...(input.instruction === undefined ? {} : { instruction: input.instruction }),
  };

  let response: Response;
  try {
    response = await fetch(`/api/resumes/${encodeURIComponent(resumeId)}/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // A cancelled request is the caller's own doing, not a failure to report.
    if (isAbortError(error)) throw error;
    throw new ResumeAgentNetworkError();
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const serverMessage = readErrorMessage(payload);
    throw new ResumeAgentRequestError(
      response.status,
      messageFor(response.status, serverMessage),
      serverMessage
    );
  }

  return payload as ResumeAgentResponse;
}
