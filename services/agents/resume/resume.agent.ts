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
import {
  MEMORY_PROPOSAL,
  MEMORY_PROPOSAL_ERROR,
  proposeResumeEditsTool,
  readResumeLinesTool,
  type ProposeResumeEditsResult,
} from './edit-tools';
import { pinnedToSelectedResume, selectedResumeId, SELECTED_RESUME_META_KEY } from './pinning';

import type { ResumeEvaluation } from '@/services/ai/evaluate';
import type { AgentContext, AgentRunResult, AgentTool, ToolAgentDefinition } from '@/types/agents';

// Re-exported so existing importers of this module keep working.
export { SELECTED_RESUME_META_KEY };

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

/** One grounded change, exactly as the proposal tool reported it. */
const proposedChangeSchema = z.object({
  id: z.string(),
  action: z.string(),
  where: z.string(),
  status: z.string(),
  before: z.string(),
  after: z.string(),
  reason: z.string(),
  /** Set when the line still holds a [__] the user must fill. */
  needsInput: z.string().optional(),
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
  /**
   * Proposal state, read from the proposal tool's stored result — never from
   * anything the model wrote. Null and empty in analyze mode, and whenever
   * nothing survived grounding.
   */
  proposedSessionId: z.string().nullable(),
  proposedChanges: z.array(proposedChangeSchema),
  proposalMessage: z.string().nullable(),
});

export type ResumeAgentOutput = z.infer<typeof resumeAgentResultSchema>;

/**
 * 'analyze' reads and scores only. 'propose' may additionally save a pending
 * edit session for the user to review. Neither can apply anything.
 */
export type ResumeAgentMode = 'analyze' | 'propose';

export const RESUME_AGENT_MODES: readonly ResumeAgentMode[] = ['analyze', 'propose'] as const;

export interface ResumeAgentInput {
  /** The resume the user selected. Authoritative for the whole run. */
  resumeId: string;
  jobDescription: string;
  /** What the user asked for, in their words. */
  instruction?: string;
  /** Defaults to 'analyze', which keeps the original read-only behaviour. */
  mode?: ResumeAgentMode;
}

/** Identifiers for one authenticated session. Never model-supplied. */
export interface ResumeAgentAuth {
  /** Follio `User.id`. */
  userId: string;
  clerkId: string;
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

    const resumeId = ctx.memory.get<string>(MEMORY_SCORED_RESUME_ID) ?? selectedResumeId(ctx);

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

    // Proposal state comes from what propose_resume_edits actually stored.
    // The model has no argument for it, so it can neither invent a session id
    // nor hide one it created.
    const proposal = ctx.memory.get<ProposeResumeEditsResult>(MEMORY_PROPOSAL);
    if (proposal && proposal.sessionId === null) {
      notes.push(
        `No edit was proposed: ${proposal.dropped} dropped, ${proposal.ignored} ignored by grounding.`
      );
    }

    // A proposal that threw while saving may have left a row behind that this
    // run never learned the id of. Say so rather than report a clean analysis.
    if (ctx.memory.get<string>(MEMORY_PROPOSAL_ERROR)) {
      notes.push(
        'A proposed edit could not be saved, and may have left a pending suggestion set. ' +
          'Check Builder, Edit with AI before proposing again.'
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
      proposedSessionId: proposal?.sessionId ?? null,
      proposedChanges: proposal?.sessionId ? proposal.changes : [],
      proposalMessage: proposal?.message ?? null,
    };
  },
});

// ============================================================================
// AGENT
// ============================================================================

const SHARED_RULES = `HARD RULES
1. Never invent qualifications, experience, skills, employers, titles, dates or numbers. If the resume does not show something, it is missing.
2. A missing requirement is missing. Never describe it as met, partly met, or transferable.
3. Call only the tools listed above. Nothing else exists.
4. Work only on the resume the user selected, using the resumeId given in the request. Never pass a different one.
5. Never mention or infer anything about other users or other accounts.
6. If a tool fails, say so in limitations and do not report the run as if it had succeeded. Do not call submit_resume_result as though the failed step had worked.
7. Every recommendation must name a requirement the posting actually lists, and must rest on what the resume already shows.`;

const ANALYZE_INSTRUCTIONS = `You are Follio's resume agent. You help one signed-in user understand how their resume stands against one job posting.

TOOLS
- get_resume: read the selected resume.
- analyze_job_description: read what the posting asks for. Required before scoring.
- score_resume_against_jd: score the resume against those requirements. Scored by code, not by you.
- submit_resume_result: finish the run.

${SHARED_RULES}
8. You are read-only. You cannot change the resume or propose edits in this run, and you must never imply that you did. If the user asks for rewrites, say that analysis mode does not write proposals.

RECOMMENDED FLOW
1. get_resume for the selected resumeId.
2. analyze_job_description with the posting text.
3. score_resume_against_jd for the same resumeId.
4. submit_resume_result with a summary and recommendations.

Strengths, gaps and scores are filled in from the scored result, so do not restate them as arguments. Be concise and specific.`;

const PROPOSE_INSTRUCTIONS = `You are Follio's resume agent. You analyse one signed-in user's resume against one job posting, then propose rewrites for them to review.

TOOLS
- get_resume: read the selected resume.
- analyze_job_description: read what the posting asks for. Required before scoring.
- score_resume_against_jd: score the resume against those requirements. Scored by code, not by you.
- read_resume_lines: the editable lines and their refs ("S", "E1.2"). Required before proposing.
- propose_resume_edits: save rewrites for the user to review. Required refs come from read_resume_lines.
- submit_resume_result: finish the run.

${SHARED_RULES}
8. You cannot apply, approve, revert or delete anything. propose_resume_edits only saves a proposal; the user approves it in Follio. Never say an edit has been made.
9. Rewrite only the summary ("S") and existing experience bullets ("E1.2"). You cannot add bullets, roles, projects or credentials, and you cannot touch employers, titles or dates.
10. Every rewrite must use only what the resume already states. Follio drops rewrites that add a tool, name, title or number the resume does not show, and blanks invented figures as [__]. Do not try to work around this.
11. Call propose_resume_edits at most once. Send every rewrite in that one call. Once it saves a proposal, a second call is refused, so there is nothing to gain from splitting them up.
12. Never add an outcome the resume does not already state. Do not append benefits like "improving efficiency", "enhancing productivity" or "driving business value" to a line that does not claim them. Keep the result the line already has, or state no result at all.
13. A rewrite is a finished resume line. Never write about the resume inside it: no "exact numbers are not specified", no "based on the resume", no "(assumed)", no bracketed notes to the user. If a figure is missing, leave it out and say so in your summary instead.

RECOMMENDED FLOW
1. get_resume for the selected resumeId.
2. analyze_job_description with the posting text.
3. score_resume_against_jd for the same resumeId.
4. read_resume_lines for the same resumeId.
5. propose_resume_edits with rewrites aimed at the gaps the scoring found.
6. submit_resume_result with a summary and recommendations.

Steps 2, 3 and 4 are prerequisites: proposing before them is refused. Strengths, gaps, scores and the proposal are filled in from the stored results, so do not restate them as arguments. Be concise and specific.`;

const INSTRUCTIONS: Record<ResumeAgentMode, string> = {
  analyze: ANALYZE_INSTRUCTIONS,
  propose: PROPOSE_INSTRUCTIONS,
};

/**
 * The tools each mode exposes. Analyze mode simply has no editing tool
 * registered, so no prompt or instruction can reach one.
 */
function toolsForMode(mode: ResumeAgentMode): AgentTool[] {
  const tools: AgentTool[] = [
    pinnedToSelectedResume(getResumeTool),
    analyzeJobDescriptionTool,
    pinnedToSelectedResume(scoreResumeAgainstJdTool),
  ];

  if (mode === 'propose') {
    tools.push(
      pinnedToSelectedResume(readResumeLinesTool),
      pinnedToSelectedResume(proposeResumeEditsTool)
    );
  }

  tools.push(submitResumeResultTool);
  return tools;
}

export function buildResumeAgent(
  mode: ResumeAgentMode
): ToolAgentDefinition<ResumeAgentInput, ResumeAgentOutput> {
  return {
    kind: 'tool',
    id: 'resume-agent',
    version: mode === 'propose' ? 'resume-agent-v1-propose' : 'resume-agent-v1',
    taskType: 'strategy',
    instructions: INSTRUCTIONS[mode],
    buildUserMessage: (input) =>
      [
        `Selected resumeId: ${input.resumeId}`,
        input.instruction
          ? `The user asked: ${input.instruction}`
          : mode === 'propose'
            ? 'The user asked for rewrites of this resume for the posting below.'
            : 'The user asked for an analysis of this resume against the posting below.',
        '',
        'JOB POSTING',
        '"""',
        input.jobDescription.trim(),
        '"""',
      ].join('\n'),
    tools: toolsForMode(mode),
    resultToolName: 'submit_resume_result',
    outputSchema: resumeAgentResultSchema,
    // No fallback on purpose: a run that could not read the resume or the
    // posting must fail, not quietly return a plausible-looking analysis.
  };
}

/** The read-only agent. Unchanged from before modes existed. */
export const resumeAgent = buildResumeAgent('analyze');

/** The same agent, plus the two editing tools. Still cannot apply anything. */
export const resumeProposeAgent = buildResumeAgent('propose');

export const RESUME_AGENT_BUDGET = {
  maxSteps: 10,
  maxDurationMs: 120_000,
  maxTokens: 60_000,
} as const;

/**
 * Propose mode needs two extra prerequisite calls before it can propose, and
 * grounding commonly drops a whole first attempt, so a legitimate run stumbles
 * more often than an analyze run. These turns restore the same head-room
 * analyze has.
 *
 * `maxTokens` is scaled to hold the per-turn allowance identical to analyze
 * mode (6,000 x maxSteps) rather than to widen it: a measured clean run peaks
 * near 3k tokens on its largest request, but each tool result is only capped
 * at 24,000 characters, so a long resume can push a turn far higher.
 *
 * Wall clock is deliberately unchanged, so `maxDurationMs` still bounds how
 * long a slow run can cost.
 */
export const RESUME_PROPOSE_BUDGET = {
  ...RESUME_AGENT_BUDGET,
  maxSteps: 14,
  maxTokens: 84_000,
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

  const mode: ResumeAgentMode = input.mode ?? 'analyze';
  if (!RESUME_AGENT_MODES.includes(mode)) {
    throw Errors.badRequest(`Unknown resume agent mode: ${String(mode)}.`);
  }

  return runAgent(
    mode === 'propose' ? resumeProposeAgent : resumeAgent,
    { ...input, resumeId, jobDescription, mode },
    {
      ...ctx,
      userId,
      clerkId,
      meta: { ...ctx.meta, [SELECTED_RESUME_META_KEY]: resumeId },
      budget: {
        ...(mode === 'propose' ? RESUME_PROPOSE_BUDGET : RESUME_AGENT_BUDGET),
        ...ctx.budget,
      },
    }
  );
}
