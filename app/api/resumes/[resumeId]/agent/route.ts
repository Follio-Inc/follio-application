/**
 * POST /api/resumes/[resumeId]/agent
 *
 * Runs the read-only Resume Agent over one resume and returns its validated
 * analysis. Read-only end to end: the agent registers no editing tool, and this
 * route writes nothing.
 *
 * The body selects the evaluation and carries its input:
 *
 *   {}                                             → general analysis
 *   { mode: 'jd',   jobDescription: '…' }          → scored against that posting
 *   { mode: 'role', targetRole: 'product-manager' }→ checked against that role
 *
 * A request with no body at all is still a valid general analysis, which is
 * what the route did before evaluation modes existed.
 *
 * Identity is never taken from the request. `resumeId` comes from the path and
 * the user from the Clerk session, and the body schema is strict, so a caller
 * that tries to pass `userId` or an ownership hint is rejected rather than
 * quietly ignored.
 *
 * Order of checks is deliberate: authenticate, resolve the Follio user, prove
 * ownership, validate the body, confirm AI is configured, and only then reserve
 * a rate-limit slot. The billable call is the last thing to happen, so a
 * request that was going to fail never spends a token or consumes quota. Body
 * validation sits after the ownership check so that a caller who does not own
 * the resume cannot probe it.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { isAIAvailable } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { validateJobDescription } from '@/lib/resume-lens/validate-jd';
import { ROLE_PROFILE_OPTIONS, resolveRoleProfile } from '@/lib/role-profiles/profiles';
import { RESUME_AGENT_MODES, runResumeAgent } from '@/services/agents/resume/resume.agent';

import { acquireAgentRun, releaseAgentRun } from './rate-limit';

import type { ResumeAgentInput } from '@/services/agents/resume/resume.agent';

/** The agent's own wall-clock budget is 90s (RESUME_AGENT_BUDGET). */
export const maxDuration = 120;

/**
 * Hard cap before the body is parsed at all. The job-description validator
 * allows up to 80k characters; this leaves room for multi-byte text and JSON
 * escaping while still refusing a payload sent to waste server time.
 */
const MAX_BODY_BYTES = 256_000;

const MAX_INSTRUCTION_CHARS = 500;

const agentLogger = logger.child({ source: 'api-resume-agent' });

/**
 * Strict on purpose: an unexpected key is an error, not something to drop.
 * That makes "the client tried to send userId" a visible 400 instead of a
 * silent no-op, and it is asserted in the tests.
 */
const bodySchema = z
  .object({
    mode: z.enum(RESUME_AGENT_MODES).optional(),
    jobDescription: z.string().optional(),
    targetRole: z.string().optional(),
    instruction: z.string().max(MAX_INSTRUCTION_CHARS).optional(),
  })
  .strict();

interface RouteContext {
  params: Promise<{ resumeId: string }>;
}

type BodyResult =
  | { ok: true; input: Omit<ResumeAgentInput, 'resumeId'> }
  | { ok: false; error: string };

/**
 * Read and validate the request body.
 *
 * Returns the agent input minus the resumeId, which the caller takes from the
 * path so it can never come from the body.
 */
async function readBody(request: NextRequest): Promise<BodyResult> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { ok: false, error: 'Request body is too large.' };
  }

  // No body is the pre-existing general-analysis request, so an unreadable or
  // empty body is treated as {} rather than as an error.
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return { ok: false, error: 'Request body is too large.' };
    }
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: 'Request body must be valid JSON.' };
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join('.') ?? 'body';
    return { ok: false, error: `Invalid request: ${field} — ${issue?.message ?? 'not accepted'}.` };
  }

  const { mode = 'general', jobDescription, targetRole, instruction } = parsed.data;

  if (mode === 'general' && (jobDescription !== undefined || targetRole !== undefined)) {
    return {
      ok: false,
      error:
        'A job description or target role was sent without selecting that mode. ' +
        'Set mode to "jd" or "role".',
    };
  }

  if (mode === 'jd') {
    // Reuse the extension's validator so the dashboard and the extension
    // reject the same pastes for the same reasons.
    const validated = validateJobDescription(jobDescription ?? '');
    if (!validated.ok) {
      return { ok: false, error: validated.message };
    }
    return { ok: true, input: { mode, jobDescription: validated.jd, instruction } };
  }

  if (mode === 'role') {
    const role = resolveRoleProfile(targetRole);
    if (!role) {
      const supported = ROLE_PROFILE_OPTIONS.map((option) => option.label).join(', ');
      return {
        ok: false,
        error: targetRole?.trim()
          ? `"${targetRole}" is not a supported target role. Supported roles: ${supported}.`
          : `Choose a target role. Supported roles: ${supported}.`,
      };
    }
    // Canonical id, so the agent and the tools cannot disagree about the role.
    return { ok: true, input: { mode, targetRole: role.id, instruction } };
  }

  return { ok: true, input: { mode: 'general', instruction } };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { resumeId } = await context.params;

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Ownership is the `where` clause, matching the agent's own tool query.
    // "Not yours" and "does not exist" deliberately return the same 404 so the
    // endpoint cannot be used to discover which resume ids exist.
    const resume = await db.profile.findFirst({
      where: { id: resumeId, userId: user.id, isArchived: false },
      select: { id: true },
    });

    if (!resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    const body = await readBody(request);
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: 400 });
    }

    if (!isAIAvailable()) {
      return NextResponse.json(
        { error: 'AI is not configured on this environment.' },
        { status: 503 }
      );
    }

    const slot = acquireAgentRun(user.id);
    if (!slot.allowed) {
      return NextResponse.json(
        {
          error:
            slot.reason === 'concurrent'
              ? 'An analysis is already running for this account.'
              : 'Too many analyses recently. Try again shortly.',
        },
        { status: 429, headers: { 'Retry-After': String(slot.retryAfterSeconds) } }
      );
    }

    try {
      const { output, run } = await runResumeAgent(
        { ...body.input, resumeId: resume.id },
        { userId: user.id }
      );

      agentLogger.info('Resume agent run finished', {
        resumeId: resume.id,
        mode: body.input.mode,
        status: run.status,
        tokens: run.totalTokensUsed.input + run.totalTokensUsed.output,
      });

      return NextResponse.json({
        analysis: output,
        run: {
          status: run.status,
          tokensUsed: run.totalTokensUsed.input + run.totalTokensUsed.output,
        },
      });
    } finally {
      // Always release, including when the agent throws, or the user stays
      // blocked behind their own in-flight flag.
      releaseAgentRun(user.id);
    }
  } catch (error) {
    return handleApiError(error, {
      path: `/api/resumes/${resumeId}/agent`,
      method: request.method,
    });
  }
}
