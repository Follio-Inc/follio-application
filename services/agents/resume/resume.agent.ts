/**
 * Resume Agent.
 *
 * A tool-calling agent that reads one resume, reads a job posting, scores the
 * two against each other, and reports grounded strengths, gaps and next steps.
 *
 * Everything it can do is read-only. The scoring itself is not the model's
 * opinion: it comes from services/ai/skills, computed from the resume's own
 * words. The model chooses which tools to call and writes the prose; it never
 * decides whether a requirement is met.
 *
 * Two things are enforced in code rather than in the prompt:
 *   - the resume under analysis is pinned to the one the user selected
 *   - strengths and gaps are read from the scored evaluation, not from the model
 */

import { z } from 'zod';

import { runAgent } from '@/lib/agents/runtime';
import { defineTool } from '@/lib/agents/define-tool';
import { Errors } from '@/lib/errors';
import { RESUME_EDIT_LIMITS } from '@/lib/resume-edit/types';
import { getResumeTool } from './tools';
import {
  analyzeJobDescriptionTool,
  MEMORY_EVALUATION,
  MEMORY_SCORED_RESUME_ID,
  scoreResumeAgainstJdTool,
} from './jd-tools';

import type { ResumeEvaluation } from '@/services/ai/evaluate';
import type {
  AgentContext,
  AgentRunResult,
  AgentTool,
  AgentToolContext,
  ToolAgentDefinition,
} from '@/types/agents';

/**
 * Context key holding the resume the user selected. Set by runResumeAgent from
 * trusted input — never from a tool argument the model wrote.
 */
export const SELECTED_RESUME_META_KEY = 'selectedResumeId';

// ============================================================================
// RESULT CONTRACT
// ============================================================================

const strengthSchema = z.object({
  term: z.string(),
  importance: z.enum(['required', 'preferred']),
  match: z.enum(['exact', 'implied', 'related']),
  evidence: z.enum(['shown', 'listed']),
  /** Resume sections the evidence was found in. */
  where: z.array(z.string()),
  /** The resume's own wording when it differs from the posting's term. */
  via: z.string().nullable(),
});

const gapSchema = z.object({
  term: z.string(),
  kind: z.string(),
  importance: z.enum(['required', 'preferred']),
});

const recommendationSchema = z.object({
  /** A requirement term the posting actually asks for. */
  requirement: z.string(),
  suggestion: z.string(),
});

export const resumeAgentResultSchema = z.object({
  resumeId: z.string(),
  summary: z.string(),
  strengths: z.array(strengthSchema),
  missingRequirements: z.array(gapSchema),
  recommendations: z.array(recommendationSchema),
  scores: z.object({
    /** 0–100 requirement match, or null when the posting asks for nothing specific. */
    requirementMatch: z.number().nullable(),
    keywordCoverage: z.number().nullable(),
    writing: z.number().nullable(),
  }),
  limitations: z.array(z.string()),
});

export type ResumeAgentOutput = z.infer<typeof resumeAgentResultSchema>;

export interface ResumeAgentInput {
  /** The resume the user selected. Authoritative for the whole run. */
  resumeId: string;
  jobDescription: string;
  /** What the user asked for, in their words. */
  instruction?: string;
}

/** Identifiers for one authenticated session. Never model-supplied. */
export interface ResumeAgentAuth {
  /** Follio `User.id`. */
  userId: string;
  clerkId: string;
}

// ============================================================================
// RESUME PINNING
// ============================================================================

/**
 * Constrain a resume-scoped tool to the selected resume.
 *
 * The model proposes `resumeId` like any other argument, so the prompt alone
 * cannot stop it naming a different one. This rejects the call instead of
 * quietly rewriting it, so a substitution attempt is visible in the run rather
 * than hidden behind a correct-looking answer.
 */
function pinnedToSelectedResume(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (input: unknown, ctx: AgentToolContext) => {
      const selected =
        typeof ctx.meta?.[SELECTED_RESUME_META_KEY] === 'string'
          ? (ctx.meta[SELECTED_RESUME_META_KEY] as string).trim()
          : '';
      if (!selected) {
        throw Errors.badRequest('No resume was selected for this run.');
      }

      const requested = (input as { resumeId?: unknown }).resumeId;
      if (typeof requested !== 'string' || requested.trim() !== selected) {
        throw Errors.badRequest(
          `This run analyzes only the resume the user selected (${selected}). ` +
            `Call ${tool.name} with resumeId="${selected}".`
        );
      }

      return tool.execute({ ...(input as object), resumeId: selected }, ctx);
    },
  };
}

// ============================================================================
// RESULT TOOL
// ============================================================================

/**
 * Terminal tool. The runtime validates whatever this returns against
 * `outputSchema` and ends the run on success; returning `{ error }` instead
 * leaves the loop running so the model can fix the problem.
 */
export const submitResumeResultTool = defineTool({
  name: 'submit_resume_result',
  description:
    'Finish the run and return the analysis. Call this only after score_resume_against_jd has ' +
    'succeeded. Strengths, gaps and scores are filled in from the scored result — you supply the ' +
    'summary, the recommendations, and anything that limited the analysis.',
  inputSchema: z.object({
    summary: z
      .string()
      .min(1)
      .describe('A few sentences on how this resume stands against this posting.'),
    recommendations: z
      .array(
        z.object({
          requirement: z
            .string()
            .describe('A requirement term from the posting, exactly as the scoring reported it.'),
          suggestion: z
            .string()
            .describe(
              'What the user could do about it, based only on what the resume already shows.'
            ),
        })
      )
      .describe('Concrete next steps, each tied to one requirement.'),
    limitations: z
      .array(z.string())
      .optional()
      .describe('Anything that failed or could not be checked. Use [] when nothing did.'),
  }),
  execute: async ({ summary, recommendations, limitations }, ctx) => {
    const evaluation = ctx.memory.get<ResumeEvaluation>(MEMORY_EVALUATION);
    if (!evaluation) {
      return {
        error:
          'No scoring in memory. Call analyze_job_description and then score_resume_against_jd ' +
          'before submitting a result.',
      };
    }

    const resumeId =
      ctx.memory.get<string>(MEMORY_SCORED_RESUME_ID) ??
      (typeof ctx.meta?.[SELECTED_RESUME_META_KEY] === 'string'
        ? (ctx.meta[SELECTED_RESUME_META_KEY] as string)
        : '');

    const matches = evaluation.skills?.matches ?? [];

    // Read off the scored result, not off the model's recollection of it.
    const strengths = matches
      .filter((match) => match.match !== 'missing' && match.evidence !== 'missing')
      .map((match) => ({
        term: match.term,
        importance: match.importance,
        match: match.match as 'exact' | 'implied' | 'related',
        evidence: match.evidence as 'shown' | 'listed',
        where: [...match.where],
        via: match.via,
      }));

    const missingRequirements = matches
      .filter((match) => match.match === 'missing')
      .map((match) => ({
        term: match.term,
        kind: match.kind,
        importance: match.importance,
      }));

    // A recommendation about a requirement this posting never asked for has
    // nothing behind it, so it is dropped rather than passed on.
    const known = new Map(matches.map((match) => [match.term.toLowerCase(), match.term]));
    const grounded: Array<{ requirement: string; suggestion: string }> = [];
    const dropped: string[] = [];
    for (const recommendation of recommendations) {
      const term = known.get(recommendation.requirement.trim().toLowerCase());
      if (term) {
        grounded.push({ requirement: term, suggestion: recommendation.suggestion });
      } else {
        dropped.push(recommendation.requirement);
      }
    }

    const notes = [...(limitations ?? [])];
    if (dropped.length > 0) {
      notes.push(
        `Dropped ${dropped.length} recommendation(s) naming requirements this posting does not list: ${dropped.join(', ')}.`
      );
    }
    if (evaluation.skills === null) {
      notes.push(
        'The posting did not yield specific requirements, so no requirement match was scored.'
      );
    }

    return {
      resumeId,
      summary,
      strengths,
      missingRequirements,
      recommendations: grounded,
      scores: {
        requirementMatch: evaluation.skills?.score ?? null,
        keywordCoverage: evaluation.job?.coverage ?? null,
        writing: evaluation.writing,
      },
      limitations: notes,
    };
  },
});

// ============================================================================
// AGENT
// ============================================================================

const INSTRUCTIONS = `You are Follio's resume agent. You help one signed-in user understand how their resume stands against one job posting.

TOOLS
- get_resume: read the selected resume.
- analyze_job_description: read what the posting asks for. Required before scoring.
- score_resume_against_jd: score the resume against those requirements. Scored by code, not by you.
- submit_resume_result: finish the run.

HARD RULES
1. Never invent qualifications, experience, skills, employers, titles, dates or numbers. If the resume does not show something, it is missing.
2. A missing requirement is missing. Never describe it as met, partly met, or transferable.
3. You are read-only. You cannot change the resume, and you must never imply that you did.
4. Call only the four tools above. Nothing else exists.
5. Work only on the resume the user selected, using the resumeId given in the request. Never pass a different one.
6. Never mention or infer anything about other users or other accounts.
7. If a tool fails, say so in limitations and do not report an analysis as if it had succeeded. Do not call submit_resume_result as though the failed step had worked.
8. Every recommendation must name a requirement the posting actually lists, and must rest on what the resume already shows.

RECOMMENDED FLOW
1. get_resume for the selected resumeId.
2. analyze_job_description with the posting text.
3. score_resume_against_jd for the same resumeId.
4. submit_resume_result with a summary and recommendations.

Strengths, gaps and scores are filled in from the scored result, so do not restate them as arguments. Be concise and specific.`;

export const resumeAgent: ToolAgentDefinition<ResumeAgentInput, ResumeAgentOutput> = {
  kind: 'tool',
  id: 'resume-agent',
  version: 'resume-agent-v1',
  taskType: 'strategy',
  instructions: INSTRUCTIONS,
  buildUserMessage: (input) =>
    [
      `Selected resumeId: ${input.resumeId}`,
      input.instruction
        ? `The user asked: ${input.instruction}`
        : 'The user asked for an analysis of this resume against the posting below.',
      '',
      'JOB POSTING',
      '"""',
      input.jobDescription.trim(),
      '"""',
    ].join('\n'),
  tools: [
    pinnedToSelectedResume(getResumeTool),
    analyzeJobDescriptionTool,
    pinnedToSelectedResume(scoreResumeAgainstJdTool),
    submitResumeResultTool,
  ],
  resultToolName: 'submit_resume_result',
  outputSchema: resumeAgentResultSchema,
  // No fallback on purpose: a run that could not read the resume or the
  // posting must fail, not quietly return a plausible-looking analysis.
};

export const RESUME_AGENT_BUDGET = {
  maxSteps: 10,
  maxDurationMs: 120_000,
  maxTokens: 60_000,
} as const;

/**
 * Run the Resume Agent for one authenticated user.
 *
 * `auth` comes from the session at the API boundary. Both identifiers must
 * describe the same user; the tools re-check ownership against each.
 */
export async function runResumeAgent(
  input: ResumeAgentInput,
  auth: ResumeAgentAuth,
  ctx: AgentContext = {}
): Promise<AgentRunResult<ResumeAgentOutput>> {
  const userId = auth.userId?.trim();
  const clerkId = auth.clerkId?.trim();
  if (!userId || !clerkId) {
    throw Errors.unauthorized('Resume agent requires an authenticated user.');
  }

  const resumeId = input.resumeId?.trim();
  if (!resumeId) {
    throw Errors.badRequest('Select a resume to analyze.');
  }

  const jobDescription = input.jobDescription?.trim() ?? '';
  if (jobDescription.length < RESUME_EDIT_LIMITS.jobMinChars) {
    throw Errors.badRequest('Add a bit more of the job description.');
  }
  if (jobDescription.length > RESUME_EDIT_LIMITS.jobMaxChars) {
    throw Errors.badRequest(
      'That posting is too long. Paste the job description, not the whole page.'
    );
  }

  return runAgent(
    resumeAgent,
    { ...input, resumeId, jobDescription },
    {
      ...ctx,
      userId,
      clerkId,
      meta: { ...ctx.meta, [SELECTED_RESUME_META_KEY]: resumeId },
      budget: { ...RESUME_AGENT_BUDGET, ...ctx.budget },
    }
  );
}
