import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isAIAvailable } from '@/lib/ai-client';
import { AgentBudgetExceededError, AgentCancelledError, AgentError } from '@/lib/agents/errors';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RESUME_EDIT_LIMITS } from '@/lib/resume-edit/types';
import { reserveResumeAgentRun } from '@/services/agents/resume/rate-limit';
import { runResumeAgent } from '@/services/agents/resume/resume.agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * Slightly above the agent's own 120s budget so the run trips its own limit
 * and returns a clean 504, rather than being cut off by the platform.
 */
export const maxDuration = 150;

const agentLogger = logger.child({ source: 'api-resume-agent' });

interface RouteContext {
  params: Promise<{ resumeId: string }>;
}

/**
 * `.strict()` is load-bearing: it rejects a body carrying userId, clerkId,
 * tools or budget. Identity and limits come from the session and the server,
 * never from the caller.
 */
const agentRequestSchema = z
  .object({
    jobDescription: z
      .string()
      .trim()
      .min(RESUME_EDIT_LIMITS.jobMinChars, 'Add a bit more of the job description.')
      .max(
        RESUME_EDIT_LIMITS.jobMaxChars,
        'That posting is too long. Paste the job description, not the whole page.'
      ),
    instruction: z.string().trim().max(RESUME_EDIT_LIMITS.instructionsMaxChars).optional(),
    /**
     * 'analyze' (the default) is read-only. 'propose' may additionally save a
     * pending edit session the user reviews in the builder. Neither applies
     * anything. An unknown value is a 400, not a silent fallback.
     */
    mode: z.enum(['analyze', 'propose']).optional(),
  })
  .strict();

/**
 * POST /api/resumes/[resumeId]/agent
 *
 * Run the read-only Resume Agent over one of the caller's resumes against a
 * pasted job posting. Returns the grounded analysis and summary run metadata.
 * Nothing on the resume is modified.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { resumeId } = await context.params;
    if (!resumeId?.trim()) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    // The Clerk id and the Follio user id are different identifiers. Both come
    // from this one session: the Clerk id from auth(), the Follio id resolved
    // from it here. Neither is ever read from the request body.
    const user = await db.user.findUnique({ where: { clerkId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = agentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Ownership at the boundary. A resume belonging to someone else is
    // reported as missing, so this never confirms another user's resume exists.
    const profile = await db.profile.findFirst({
      where: { id: resumeId, userId: user.id, isArchived: false },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    if (!isAIAvailable()) {
      throw new AppError(
        'Resume analysis is unavailable right now.',
        ErrorCode.SERVICE_UNAVAILABLE,
        503
      );
    }

    // Claim a slot before anything that costs money. Throws a 429 when the
    // user is over their daily total or already has runs in flight.
    const releaseSlot = await reserveResumeAgentRun(user.id);

    try {
      const mode = parsed.data.mode ?? 'analyze';
      const { output, run } = await runResumeAgent(
        {
          resumeId: profile.id,
          jobDescription: parsed.data.jobDescription,
          instruction: parsed.data.instruction,
          mode,
        },
        { userId: user.id, clerkId }
      );

      agentLogger.info('Resume agent run completed', {
        runId: run.id,
        userId: user.id,
        profileId: profile.id,
        mode,
        proposedSessionId: output.proposedSessionId,
        status: run.status,
        steps: run.stepMetas.length,
        tokensIn: run.totalTokensUsed.input,
        tokensOut: run.totalTokensUsed.output,
      });

      return NextResponse.json({
        success: true,
        mode,
        analysis: output,
        // Summary metadata only. Step details and prompts stay server-side.
        run: {
          id: run.id,
          agentId: run.agentId,
          version: run.version,
          status: run.status,
          steps: run.stepMetas.length,
          tokensUsed: run.totalTokensUsed,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt ?? null,
        },
      });
    } catch (error) {
      // The runtime rethrows whatever the model client threw. Those messages
      // can carry request detail, and handleApiError echoes error.message
      // outside production, so anything not already curated is normalized to
      // an AgentError here and logged in full server-side instead.
      if (error instanceof AgentError || isAppError(error)) throw error;
      agentLogger.error(
        'Resume agent run failed unexpectedly',
        error instanceof Error ? error : new Error(String(error)),
        { userId: user.id, profileId: profile.id }
      );
      throw new AgentError('resume-agent', 'RUN_FAILED', 'Resume agent run failed.', error);
    } finally {
      releaseSlot();
    }
  } catch (error) {
    // Agent failures carry internal detail (step counts, prompts, model
    // messages). Map them to flat, safe responses before the generic handler,
    // which echoes error.message outside production.
    if (error instanceof AgentBudgetExceededError) {
      agentLogger.warn('Resume agent exceeded its budget', { error: error.message });
      return NextResponse.json(
        { error: 'The analysis did not finish in time. Try a shorter job description.' },
        { status: 504 }
      );
    }
    if (error instanceof AgentCancelledError) {
      return NextResponse.json({ error: 'The analysis was cancelled.' }, { status: 499 });
    }
    if (error instanceof AgentError) {
      agentLogger.error('Resume agent failed', error);
      return NextResponse.json(
        { error: 'The analysis could not be completed. Try again in a moment.' },
        { status: 502 }
      );
    }

    return handleApiError(error, {
      method: 'POST',
      path: '/api/resumes/[resumeId]/agent',
    });
  }
}
