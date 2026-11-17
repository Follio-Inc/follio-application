/**
 * Job-description tools for the Resume Agent.
 *
 * Two steps, split on cost:
 *   analyze_job_description  — one cached model call, reads what the posting asks for.
 *   score_resume_against_jd  — no model call at all, scores a resume by code.
 *
 * Both are read-only. Neither writes to the database, and neither decides for
 * itself whether the resume covers a requirement: that judgement stays in
 * services/ai/skills, where it is made from the resume's own words.
 */

import { z } from 'zod';

// Deep import: the `@/lib/agents` barrel re-exports runAgent -> persist-run -> lib/db.
import { defineTool } from '@/lib/agents/define-tool';
import {
  requireOwnedResume,
  RESUME_ID_DESCRIPTION,
  ResumeRefSchema,
} from '@/lib/ai-connector/resume-target';
import { Errors } from '@/lib/errors';
import { RESUME_EDIT_LIMITS } from '@/lib/resume-edit/types';
import { evaluateResume } from '@/services/ai/evaluate';
import { readJobRequirements } from '@/services/ai/job-requirements';
import { getEditableResume } from '@/services/resume-edit-session.service';

import type { AgentToolContext } from '@/types/agents';
import type { ResumeEvaluation } from '@/services/ai/evaluate';
import type { JobRequirement } from '@/services/ai/job-requirements';

/** Agent-memory key: the posting text the requirements were read from. */
export const MEMORY_JOB_DESCRIPTION = 'jobDescription';
/** Agent-memory key: the requirements read from that posting. */
export const MEMORY_JOB_REQUIREMENTS = 'jobRequirements';
/** Agent-memory key: the evaluation of the scored resume against that posting. */
export const MEMORY_EVALUATION = 'resumeEvaluation';
/** Agent-memory key: the resolved id of the resume that evaluation belongs to. */
export const MEMORY_SCORED_RESUME_ID = 'scoredResumeId';

/**
 * Same normalization `readJobRequirements` caches on, so "the same posting"
 * means the same thing here as it does there. Whitespace-only differences
 * are not a different posting; anything else is.
 */
function normalizeJd(jobDescription: string): string {
  return jobDescription.replace(/\s+/g, ' ').trim();
}

/** Reject an unauthenticated run before it can reach a paid call or the database. */
function requireUserId(ctx: AgentToolContext): string {
  const userId = ctx.userId?.trim();
  if (!userId) {
    throw Errors.unauthorized('No authenticated user in agent context.');
  }
  return userId;
}

// ============================================================================
// analyze_job_description
// ============================================================================

export const analyzeJobDescriptionInputSchema = z.object({
  jobDescription: z
    .string()
    .trim()
    .min(RESUME_EDIT_LIMITS.jobMinChars, 'Add a bit more of the job description.')
    .max(
      RESUME_EDIT_LIMITS.jobMaxChars,
      'That posting is too long. Paste the job description, not the whole page.'
    )
    .describe('The job posting text, exactly as the user pasted it.'),
});

export const analyzeJobDescriptionTool = defineTool({
  name: 'analyze_job_description',
  description:
    'Read what a job posting asks a candidate to have: tools, practices, domains and credentials, ' +
    'each marked required or preferred. Company story, benefits and legal text are left out. ' +
    'Call this before score_resume_against_jd. Read-only.',
  inputSchema: analyzeJobDescriptionInputSchema,
  execute: async (
    { jobDescription },
    ctx
  ): Promise<{
    requirements: JobRequirement[];
    requirementCount: number;
    note: string;
  }> => {
    requireUserId(ctx);

    // One cached model call per posting, shared with the builder panel.
    const requirements = await readJobRequirements(jobDescription);

    // null means the read failed or was unusable. An empty list would mean
    // "this posting asks for nothing specific" — a different claim entirely.
    if (requirements === null) {
      throw Errors.badRequest("Could not read this posting's requirements. Try again in a moment.");
    }

    ctx.memory.set(MEMORY_JOB_DESCRIPTION, normalizeJd(jobDescription));
    ctx.memory.set(MEMORY_JOB_REQUIREMENTS, requirements);

    return {
      requirements,
      requirementCount: requirements.length,
      note:
        requirements.length === 0
          ? 'This posting does not ask for anything specific.'
          : 'Requirements are cached for this run. Call score_resume_against_jd next.',
    };
  },
});

// ============================================================================
// score_resume_against_jd
// ============================================================================

export const scoreResumeAgainstJdInputSchema = z.object({
  resumeId: ResumeRefSchema.shape.resumeId.describe(RESUME_ID_DESCRIPTION),
  jobDescription: z
    .string()
    .trim()
    .max(RESUME_EDIT_LIMITS.jobMaxChars)
    .optional()
    .describe(
      'Only to confirm which posting to score against. Omit to use the posting already ' +
        'analyzed in this run. It must be that same posting — this tool never re-reads one.'
    ),
});

export const scoreResumeAgainstJdTool = defineTool({
  name: 'score_resume_against_jd',
  description:
    "Score one of the user's resumes against the analyzed posting: writing checks, keyword " +
    'coverage, and every requirement marked exact, implied, related or missing with the ' +
    'evidence behind it. Scored by code, not by a model. Requires analyze_job_description ' +
    'first. Read-only — it never changes the resume.',
  inputSchema: scoreResumeAgainstJdInputSchema,
  execute: async ({ resumeId, jobDescription }, ctx): Promise<ResumeEvaluation> => {
    const userId = requireUserId(ctx);
    const clerkId = ctx.clerkId?.trim();
    if (!clerkId) {
      throw Errors.unauthorized('No Clerk identity in agent context; cannot read a resume.');
    }

    const analyzedJd = ctx.memory.get<string>(MEMORY_JOB_DESCRIPTION);
    const requirements = ctx.memory.get<JobRequirement[]>(MEMORY_JOB_REQUIREMENTS);

    if (!analyzedJd || !requirements) {
      throw Errors.badRequest(
        'No job posting has been analyzed in this run. Call analyze_job_description first.'
      );
    }

    // An override is a confirmation, not a new posting. Scoring one posting's
    // resume against another posting's requirements would be silently wrong,
    // so a mismatch stops here rather than guessing which one was meant.
    if (jobDescription !== undefined && normalizeJd(jobDescription) !== analyzedJd) {
      throw Errors.badRequest(
        'That job description is not the one that was analyzed. Call analyze_job_description ' +
          'with this posting first, then score against it.'
      );
    }

    // Ownership, twice over: requireOwnedResume resolves the reference only
    // among this user's resumes, and getEditableResume re-checks the resolved
    // id against the Clerk session's active user.
    const owned = await requireOwnedResume(userId, resumeId);
    const facts = await getEditableResume(clerkId, owned.resumeId);

    // Requirement matching is done by code in services/ai/skills, from the
    // resume's own words. Nothing here can invent a qualification.
    const evaluation = evaluateResume(facts, analyzedJd, requirements);

    // Kept so a later tool can report strengths and gaps from the scored
    // result rather than from whatever the model remembers of it.
    ctx.memory.set(MEMORY_EVALUATION, evaluation);
    ctx.memory.set(MEMORY_SCORED_RESUME_ID, owned.resumeId);

    return evaluation;
  },
});

export const JD_AGENT_TOOLS = [analyzeJobDescriptionTool, scoreResumeAgainstJdTool];
