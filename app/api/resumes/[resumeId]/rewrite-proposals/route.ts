/**
 * GET  /api/resumes/[resumeId]/rewrite-proposals  — list stored batches
 * POST /api/resumes/[resumeId]/rewrite-proposals  — generate and store one
 *
 * A separate endpoint from `/agent` rather than another mode on it, for three
 * reasons. Rewriting costs several times what an analysis costs and needs its
 * own rate-limit price. It returns batch metadata rather than an analysis, so
 * sharing a response shape would mean a discriminated union on a route that
 * already has one. And most importantly, it keeps `/agent` exactly as it was:
 * every existing mode — general, job description, target role, keyword
 * analysis — behaves identically, and nothing a client already sends can now
 * cause a rewrite.
 *
 * POST is the only billable call in this feature, so the order of checks is
 * deliberate: authenticate, prove ownership, validate the body, check the
 * engine, honour an idempotency key, and only then reserve a rate-limit slot
 * and run. A request that was going to fail never spends a token.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { isAIAvailable } from '@/lib/ai-client';
import { handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { validateJobDescription } from '@/lib/resume-lens/validate-jd';
import { ROLE_PROFILE_OPTIONS, resolveRoleProfile } from '@/lib/role-profiles/profiles';
import { selectAnalysisEngine } from '@/services/agents/resume/engine';
import {
  ORCHESTRATOR_MODES,
  runResumeOrchestrator,
} from '@/services/agents/resume/orchestrator.agent';
import {
  findBatchByIdempotencyKey,
  listProposalBatches,
  persistProposalBatch,
} from '@/services/resume-proposals.service';

import { acquireAgentRun, releaseAgentRun, RUN_COST } from '../agent/rate-limit';
import { authorizeResume, readJsonBody } from './authorize';

/**
 * Route deadline. A rewrite run is the longest execution Follio performs:
 * REWRITE_DELEGATION_LIMITS allows 360s across the whole tree, so the route
 * has to outlive that or the function is killed mid-run and the user sees a
 * timeout instead of the budget message. 300 is the platform maximum already
 * in use elsewhere in this repository; a tree that reaches its own ceiling
 * past that point fails with its own message on the next turn.
 */
export const maxDuration = 300;

const MAX_BODY_BYTES = 256_000;
const MAX_INSTRUCTION_CHARS = 500;

const proposalsLogger = logger.child({ source: 'api-rewrite-proposals' });

/**
 * Strict on purpose, and this is where it earns its keep: a client that sends
 * `verified: true`, `verificationStatus`, `state` or `proposedText` gets a
 * 400 rather than having it quietly dropped. There is no field in this schema
 * through which a caller can influence what the server will later treat as
 * verified.
 */
const generateSchema = z
  .object({
    mode: z.enum(ORCHESTRATOR_MODES).optional(),
    jobDescription: z.string().optional(),
    targetRole: z.string().optional(),
    instruction: z.string().max(MAX_INSTRUCTION_CHARS).optional(),
    /**
     * Makes a retry cheap. A second POST with the same key returns the batch
     * the first one stored instead of paying for another run — the guard
     * against a double-submitted form or a client that retries on timeout.
     */
    idempotencyKey: z.string().min(8).max(200).optional(),
  })
  .strict();

interface RouteContext {
  params: Promise<{ resumeId: string }>;
}

type GenerateInput = {
  mode: (typeof ORCHESTRATOR_MODES)[number];
  jobDescription?: string;
  targetRole?: string;
  instruction?: string;
  idempotencyKey?: string;
};

type BodyResult = { ok: true; input: GenerateInput } | { ok: false; error: string };

function readBody(raw: unknown): BodyResult {
  if (raw === undefined) return { ok: false, error: 'Request body must be valid JSON.' };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const parsed = generateSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join('.') || 'body';
    return { ok: false, error: `Invalid request: ${field} — ${issue?.message ?? 'not accepted'}.` };
  }

  const { mode = 'general', jobDescription, targetRole, instruction, idempotencyKey } = parsed.data;

  if (mode === 'general' && (jobDescription !== undefined || targetRole !== undefined)) {
    return {
      ok: false,
      error:
        'A job description or target role was sent without selecting that mode. ' +
        'Set mode to "jd" or "role".',
    };
  }

  if (mode === 'jd') {
    // The same validator the analysis route and the extension use, so the
    // three reject the same pastes for the same reasons.
    const validated = validateJobDescription(jobDescription ?? '');
    if (!validated.ok) return { ok: false, error: validated.message };
    return { ok: true, input: { mode, jobDescription: validated.jd, instruction, idempotencyKey } };
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
    return { ok: true, input: { mode, targetRole: role.id, instruction, idempotencyKey } };
  }

  return { ok: true, input: { mode: 'general', instruction, idempotencyKey } };
}

// ============================================================================
// GET
// ============================================================================

export async function GET(request: NextRequest, context: RouteContext) {
  const { resumeId } = await context.params;

  try {
    const authorized = await authorizeResume(resumeId);
    if (!authorized.ok) return authorized.response;

    const batches = await listProposalBatches(authorized.context.userId, resumeId);
    return NextResponse.json({ batches });
  } catch (error) {
    return handleApiError(error, {
      path: `/api/resumes/${resumeId}/rewrite-proposals`,
      method: request.method,
    });
  }
}

// ============================================================================
// POST
// ============================================================================

export async function POST(request: NextRequest, context: RouteContext) {
  const { resumeId } = await context.params;

  try {
    const authorized = await authorizeResume(resumeId);
    if (!authorized.ok) return authorized.response;
    const { userId } = authorized.context;

    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    }

    const body = readBody(await readJsonBody(request));
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

    if (!isAIAvailable()) {
      return NextResponse.json(
        { error: 'AI is not configured on this environment.' },
        { status: 503 }
      );
    }

    // Rewriting needs the orchestrated engine: the single-agent Resume Agent
    // has no rewrite or verification specialist, so it cannot produce a
    // verified proposal at all. Refusing is the only honest answer — falling
    // back would bill the user for an analysis they did not ask for and
    // return a batch with nothing in it.
    const engine = selectAnalysisEngine();
    if (engine !== 'multi-agent') {
      return NextResponse.json(
        {
          error:
            'Verified rewriting needs the multi-agent engine, which is not enabled on this ' +
            'environment. Analysis is unaffected.',
          engine,
        },
        { status: 503 }
      );
    }

    // Before the rate-limit slot, so a retry neither pays again nor burns
    // quota it does not need.
    if (body.input.idempotencyKey) {
      const existing = await findBatchByIdempotencyKey(userId, resumeId, body.input.idempotencyKey);
      if (existing) {
        return NextResponse.json({ ...existing, reused: true });
      }
    }

    const slot = acquireAgentRun(userId, Date.now(), RUN_COST.rewrite);
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
      const { output, run } = await runResumeOrchestrator(
        {
          resumeId,
          mode: body.input.mode,
          jobDescription: body.input.jobDescription,
          targetRole: body.input.targetRole,
          instruction: body.input.instruction,
          // The one place rewriting is turned on, from a request that said so
          // explicitly on an endpoint that exists only for it.
          rewrite: true,
        },
        { userId },
        { signal: request.signal }
      );

      const stored = await persistProposalBatch({
        userId,
        resumeId,
        // Validated by the orchestrator's own output schema before it got
        // here. Nothing from the request body reaches the persistence layer
        // except the idempotency key.
        output,
        rootRunId: run.rootRunId ?? run.id,
        idempotencyKey: body.input.idempotencyKey,
      });

      proposalsLogger.info('Stored a rewrite proposal batch', {
        resumeId,
        batchId: stored.batch.id,
        status: stored.batch.status,
        proposals: stored.proposals.length,
        tokens: run.totalTokensUsed.input + run.totalTokensUsed.output,
      });

      return NextResponse.json({
        ...stored,
        analysis: {
          summary: output.summary,
          recommendations: output.recommendations,
          agentsUsed: output.agentsUsed,
          evaluation: output.evaluation,
          matching: output.matching,
          executionStatus: output.executionStatus,
        },
        run: {
          status: run.status,
          tokensUsed: run.totalTokensUsed.input + run.totalTokensUsed.output,
        },
      });
    } finally {
      releaseAgentRun(userId);
    }
  } catch (error) {
    return handleApiError(error, {
      path: `/api/resumes/${resumeId}/rewrite-proposals`,
      method: request.method,
    });
  }
}
