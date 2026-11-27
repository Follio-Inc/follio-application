/**
 * Resume Agent — read-only evaluation.
 *
 * A tool-calling agent that reads the one resume the caller selected and
 * reports on it. It can work in three ways, chosen by the caller:
 *
 *   - general: describe what the resume contains;
 *   - jd:      evaluate it against a job description the user pasted;
 *   - role:    evaluate it against a general target role the user picked.
 *
 * Still read-only. The registered tools are the resume reader, three
 * deterministic evaluators and the terminal result tool. No editing, saving or
 * deleting tool is registered, so no prompt can reach one.
 *
 * Runs on the existing Follio agent runtime (lib/agents/runtime.ts). The
 * runtime enforces the step, token and wall-clock budgets, validates every
 * tool argument against its Zod schema, and validates the final result against
 * `outputSchema` before the run can end.
 *
 * Three things are enforced in code rather than in the prompt:
 *   - the resume under analysis is pinned to the one the caller selected;
 *   - the job description and target role come from trusted run input, so the
 *     model can neither supply them nor alter them;
 *   - every factual field of the result — resume id, title, name, counts, and
 *     all match figures — is read back from the stored resume or from what the
 *     deterministic tools computed, never from what the model wrote.
 *
 * The mode is a statement of what the user asked for and what inputs exist. It
 * is not a script: the model decides which tools to call and in what order,
 * and adapts when a tool reports that its precondition is unmet.
 */

import { z } from 'zod';

import { defineTool } from '@/lib/agents/define-tool';
import { runAgent } from '@/lib/agents/runtime';
import { Errors } from '@/lib/errors';
import { resolveRoleProfile } from '@/lib/role-profiles/profiles';

import {
  JOB_DESCRIPTION_META_KEY,
  MEMORY_JD_KEYWORDS,
  MEMORY_JD_MATCH,
  MEMORY_ROLE_COVERAGE,
  RESUME_EVALUATION_TOOLS,
  TARGET_ROLE_META_KEY,
} from './jd-tools';
import {
  getResumeTool,
  MEMORY_RESUME,
  pinnedToSelectedResume,
  SELECTED_RESUME_META_KEY,
  type AgentResumeView,
} from './tools';

import type { AgentContext, AgentId, AgentRunResult, ToolAgentDefinition } from '@/types/agents';

export { SELECTED_RESUME_META_KEY };
export { JOB_DESCRIPTION_META_KEY, TARGET_ROLE_META_KEY };

/**
 * Registered in the `AgentId` union (types/agents.ts) as of Phase 2A, so this
 * is no longer a cast. Its own id rather than a reused one, because sharing
 * e.g. 'resume-parse' would merge this agent's telemetry with the parser's.
 */
const RESUME_AGENT_ID: AgentId = 'resume-agent';

// ============================================================================
// INPUT CONTRACT
// ============================================================================

export const RESUME_AGENT_MODES = ['general', 'jd', 'role'] as const;
export type ResumeAgentMode = (typeof RESUME_AGENT_MODES)[number];

export interface ResumeAgentInput {
  /** The resume the user selected. Authoritative for the whole run. */
  resumeId: string;
  /** What kind of evaluation the user asked for. Defaults to 'general'. */
  mode?: ResumeAgentMode;
  /** Job description text, already validated by the caller. Mode 'jd' only. */
  jobDescription?: string;
  /** A supported role id or label, resolved by the caller. Mode 'role' only. */
  targetRole?: string;
  /** What the user asked for, in their words. Optional. */
  instruction?: string;
}

/** Identifiers for one authenticated session. Never model-supplied. */
export interface ResumeAgentAuth {
  /** Follio `User.id` — not the Clerk id. */
  userId: string;
}

// ============================================================================
// RESULT CONTRACT
// ============================================================================

/**
 * Shapes produced by the deterministic tools. The result tool copies these out
 * of agent memory verbatim, so these schemas describe computed data, not
 * anything the model is free to write.
 */
const jdMatchSchema = z.object({
  score: z.number(),
  band: z.string(),
  label: z.string(),
  summary: z.string(),
  jobTitleHint: z.string().nullable(),
  matchedSkills: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  basis: z.string(),
});

const jdKeywordsSchema = z.object({
  jobTitleHint: z.string().nullable(),
  matchedInSkills: z.array(z.string()),
  presentButNotListedAsSkill: z.array(z.string()),
  absentFromResume: z.array(z.string()),
  interpretation: z.string(),
});

const roleCoverageSchema = z.object({
  roleId: z.string(),
  roleLabel: z.string(),
  roleSummary: z.string(),
  band: z.string(),
  label: z.string(),
  competencies: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
      coverage: z.string(),
      evidence: z.array(z.string()),
    })
  ),
  coveredCount: z.number(),
  partialCount: z.number(),
  absentCount: z.number(),
  totalCompetencies: z.number(),
  matchingTitles: z.array(z.string()),
  provenance: z.string(),
  basis: z.string(),
});

/**
 * The run result.
 *
 * Backward compatible: every field the read-only v1 agent returned is still
 * present and still required, so an existing caller that knows nothing about
 * the evaluation modes keeps working. Everything new is optional and appears
 * only when the matching tool actually ran.
 */
export const resumeAgentResultSchema = z.object({
  /** Filled in from the stored resume, not from the model. */
  resumeId: z.string(),
  resumeTitle: z.string(),
  name: z.string(),
  /** The model's prose. */
  summary: z.string(),
  highlights: z.array(z.string()),
  /** Counted from the stored resume. */
  counts: z.object({
    experiences: z.number(),
    education: z.number(),
    skills: z.number(),
    projects: z.number(),
  }),
  /** Resume sections that are empty, determined from the stored resume. */
  missingSections: z.array(z.string()),
  /** Anything that failed or could not be checked. */
  limitations: z.array(z.string()),

  /** Which evaluation the caller asked for. */
  mode: z.enum(RESUME_AGENT_MODES).optional(),
  /** Suggestions written by the model. Advice, not findings. */
  recommendations: z.array(z.string()).optional(),
  /** Present only when score_against_jd ran. Computed, not model-written. */
  jdMatch: jdMatchSchema.optional(),
  /** Present only when find_missing_keywords ran. Computed. */
  keywords: jdKeywordsSchema.optional(),
  /** Present only when evaluate_against_role ran. Computed. */
  roleCoverage: roleCoverageSchema.optional(),
});

export type ResumeAgentOutput = z.infer<typeof resumeAgentResultSchema>;

// ============================================================================
// RESULT TOOL
// ============================================================================

/** Sections reported as missing when empty, in the order they are checked. */
const SECTION_CHECKS: Array<{ label: string; isEmpty: (resume: AgentResumeView) => boolean }> = [
  { label: 'headline', isEmpty: (resume) => !resume.headline?.trim() },
  { label: 'summary', isEmpty: (resume) => !resume.summary?.trim() },
  { label: 'contact email', isEmpty: (resume) => !resume.contact.email?.trim() },
  { label: 'work experience', isEmpty: (resume) => resume.experiences.length === 0 },
  { label: 'education', isEmpty: (resume) => resume.education.length === 0 },
  { label: 'skills', isEmpty: (resume) => resume.skills.length === 0 },
  { label: 'projects', isEmpty: (resume) => resume.projects.length === 0 },
];

/**
 * Terminal tool. The runtime validates whatever this returns against
 * `outputSchema` and ends the run on success; returning `{ error }` instead
 * leaves the loop running so the model can fix the problem.
 *
 * The model supplies prose only. Scores, matched skills, missing keywords and
 * competency coverage are copied out of memory, where the deterministic tools
 * put them — so a model that misremembers a score cannot change what the user
 * is shown.
 */
export const submitResumeSummaryTool = defineTool({
  name: 'submit_resume_summary',
  description:
    'Finish the run and return the analysis. Call this only after get_resume has succeeded. ' +
    'The resume id, title, name, section counts, missing sections, and any job-description or ' +
    'target-role figures are filled in from what was actually read and computed — you supply ' +
    'only the summary, the highlights, any recommendations and any limitations.',
  inputSchema: z.object({
    summary: z
      .string()
      .min(1)
      .describe('A few sentences describing this resume, based only on what it contains.'),
    highlights: z
      .array(z.string())
      .describe(
        'Short factual points drawn from the resume, each traceable to something it states. ' +
          'Use [] when the resume is too sparse to support any.'
      ),
    recommendations: z
      .array(z.string())
      .optional()
      .describe(
        'Specific, actionable suggestions grounded in what the tools returned. Phrase them as ' +
          'suggestions about the resume text, never as claims about the user’s experience. ' +
          'Use [] when you have nothing well-grounded to suggest.'
      ),
    limitations: z
      .array(z.string())
      .optional()
      .describe('Anything that failed or could not be checked. Use [] when nothing did.'),
  }),
  execute: async ({ summary, highlights, recommendations, limitations }, ctx) => {
    // Read off the stored resume, not off the model's recollection of it.
    const resume = ctx.memory.get<AgentResumeView>(MEMORY_RESUME);
    if (!resume) {
      return {
        error: 'No resume in memory. Call get_resume before submitting a summary.',
      };
    }

    const missingSections = SECTION_CHECKS.filter((check) => check.isEmpty(resume)).map(
      (check) => check.label
    );

    const notes = [...(limitations ?? [])];
    if (missingSections.length > 0) {
      notes.push(
        `This resume has no ${missingSections.join(', ')}, so nothing was reported about it.`
      );
    }

    // The runtime seeds memory with the run input under `__input`
    // (lib/agents/runtime.ts), so the mode is already here — trusted, because
    // it came from the caller rather than from the model.
    const mode = ctx.memory.get<ResumeAgentInput>('__input')?.mode;
    const jdMatch = ctx.memory.get<z.infer<typeof jdMatchSchema>>(MEMORY_JD_MATCH);
    const keywords = ctx.memory.get<z.infer<typeof jdKeywordsSchema>>(MEMORY_JD_KEYWORDS);
    const roleCoverage = ctx.memory.get<z.infer<typeof roleCoverageSchema>>(MEMORY_ROLE_COVERAGE);

    // The user asked for an evaluation and none was produced. Say so rather
    // than returning a general summary that looks like an answer to the
    // question they actually asked.
    if (mode === 'jd' && !jdMatch && !keywords) {
      notes.push(
        'The job-description analysis did not run, so nothing in this result reflects that posting.'
      );
    }
    if (mode === 'role' && !roleCoverage) {
      notes.push(
        'The target-role evaluation did not run, so nothing in this result reflects that role.'
      );
    }

    return {
      resumeId: resume.resumeId,
      resumeTitle: resume.resumeTitle,
      name: resume.name,
      summary,
      highlights,
      counts: {
        experiences: resume.experiences.length,
        education: resume.education.length,
        skills: resume.skills.length,
        projects: resume.projects.length,
      },
      missingSections,
      limitations: notes,
      ...(mode ? { mode } : {}),
      ...(recommendations ? { recommendations } : {}),
      ...(jdMatch ? { jdMatch } : {}),
      ...(keywords ? { keywords } : {}),
      ...(roleCoverage ? { roleCoverage } : {}),
    };
  },
});

// ============================================================================
// AGENT DEFINITION
// ============================================================================

const INSTRUCTIONS = [
  'You are the Follio Resume Agent. You read one resume belonging to the signed-in user and',
  'report on it. You are read-only: you cannot change, save or delete anything.',
  '',
  'Rules:',
  '1. Never invent a fact. Every statement you make must come from the resume you read or from',
  '   what a tool returned.',
  '2. If something is missing from the resume, it is missing. Do not fill it in, estimate it,',
  '   or infer it from context.',
  '3. Do not invent employers, job titles, dates, metrics, technologies, degrees or institutions.',
  '4. Use only the tools listed below. If a tool fails or reports that it cannot run, say so in',
  '   limitations rather than working around it or guessing what it would have returned.',
  '5. Read only the resume the user selected. Its id is given in the task.',
  '6. Do not mention or compare against any other user or any other resume.',
  '7. Never state or estimate a score, a match percentage, or a list of matched or missing',
  '   keywords yourself. Those come from the tools. If a tool did not run, there is no score.',
  '8. A keyword missing from a resume means it is not written there. It does not mean the user',
  '   lacks that experience. Never say or imply that it does.',
  '9. Keep the summary and highlights concise and specific. No praise, no filler.',
  '',
  'Tools:',
  '- get_resume: read the selected resume. Always call this first; the other tools need it.',
  '- score_against_jd: score the resume against the job description supplied for this run.',
  '- find_missing_keywords: sort that job description’s keywords into already-listed,',
  '  present-but-not-listed-as-a-skill, and absent.',
  '- evaluate_against_role: check the resume against the target role chosen for this run and',
  '  report evidence per competency.',
  '- submit_resume_summary: finish the run.',
  '',
  'How to work:',
  'Read the resume, then decide which of the evaluation tools the user’s request and the',
  'available inputs actually call for, and run those. You cannot see the job description or the',
  'role definition yourself — only the tools can, so you must call them to learn anything about',
  'them. Look at what each tool returns before deciding what to do next: a weak score or a long',
  'list of absent keywords is a reason to look further with another tool, a strong one may not',
  'be. Do not call a tool whose input this run does not have; if you do, it will tell you so,',
  'and you should record that in limitations rather than retrying it.',
  '',
  'Then call submit_resume_summary. Recommendations should follow from what the tools returned:',
  'suggest wording and content changes to the resume, never claims about the user. The resume id,',
  'title, name, section counts, missing sections and all computed figures are filled in for you,',
  'so do not restate them as arguments.',
].join('\n');

function buildUserMessage(input: ResumeAgentInput): string {
  const mode: ResumeAgentMode = input.mode ?? 'general';
  const lines = [`Selected resumeId: ${input.resumeId}`, `Requested evaluation: ${mode}`];

  if (mode === 'jd') {
    const length = input.jobDescription?.length ?? 0;
    lines.push(
      `A job description was supplied for this run (${length} characters). You cannot see its`,
      'text. Use score_against_jd and find_missing_keywords to analyze it.'
    );
  } else if (mode === 'role') {
    const role = resolveRoleProfile(input.targetRole);
    lines.push(
      `Target role: ${role?.label ?? input.targetRole}. You cannot see the role definition.`,
      'Use evaluate_against_role to analyze it.',
      'This is a general role profile, not a job posting, so there is no match percentage.'
    );
  } else {
    lines.push(
      'No job description and no target role were supplied, so the job-description and role',
      'tools cannot run on this request.'
    );
  }

  lines.push(
    input.instruction
      ? `The user asked: ${input.instruction}`
      : 'The user asked for an analysis of this resume.'
  );

  return lines.join('\n');
}

export const resumeAgent: ToolAgentDefinition<ResumeAgentInput, ResumeAgentOutput> = {
  kind: 'tool',
  id: RESUME_AGENT_ID,
  version: 'resume-agent-v2-evaluation',
  // 'strategy' routes to the heavy model (lib/ai-client.ts resolveModel). v1
  // used 'extraction' and the light model, which suited a fixed two-step
  // errand; this agent now chooses among five tools and reads their results
  // before deciding what to do next, which is what the heavy model is for.
  taskType: 'strategy',
  instructions: INSTRUCTIONS,
  buildUserMessage: (input) => buildUserMessage(input),
  tools: [
    pinnedToSelectedResume(getResumeTool),
    ...RESUME_EVALUATION_TOOLS.map(pinnedToSelectedResume),
    submitResumeSummaryTool,
  ],
  resultToolName: 'submit_resume_summary',
  outputSchema: resumeAgentResultSchema,
  // No fallback on purpose: a run that could not read the resume must fail,
  // not quietly return a plausible-looking summary of nothing.
};

/**
 * A general run is two turns; a job-description run that uses both JD tools is
 * four. The head-room covers a retry when the model calls the result tool too
 * early, returns a payload that fails `outputSchema`, or calls a tool whose
 * input this run does not have and has to adapt.
 */
export const RESUME_AGENT_BUDGET = {
  maxSteps: 10,
  maxDurationMs: 90_000,
  maxTokens: 60_000,
} as const;

// ============================================================================
// ENTRY POINT
// ============================================================================

/**
 * Run the Resume Agent for one authenticated user.
 *
 * `auth` comes from the session at the API boundary — never from the request
 * body and never from the model. The tool re-checks ownership against it.
 *
 * The job description and target role are validated here and then put in
 * `meta`, where only the tools can read them. They are never placed in the
 * model's context: the model learns about them solely through tool results.
 */
export async function runResumeAgent(
  input: ResumeAgentInput,
  auth: ResumeAgentAuth,
  ctx: AgentContext = {}
): Promise<AgentRunResult<ResumeAgentOutput>> {
  const userId = auth.userId?.trim();
  if (!userId) {
    throw Errors.unauthorized('Resume agent requires an authenticated user.');
  }

  const resumeId = input.resumeId?.trim();
  if (!resumeId) {
    throw Errors.badRequest('Select a resume to summarize.');
  }

  const mode: ResumeAgentMode = input.mode ?? 'general';

  const jobDescription = mode === 'jd' ? input.jobDescription?.trim() : undefined;
  if (mode === 'jd' && !jobDescription) {
    throw Errors.badRequest('Paste a job description to evaluate this resume against.');
  }

  // Resolved to a canonical id so the tool and the result agree on the role,
  // and so an unsupported role fails here rather than silently doing nothing.
  const role = mode === 'role' ? resolveRoleProfile(input.targetRole) : null;
  if (mode === 'role' && !role) {
    throw Errors.badRequest('Choose a supported target role to evaluate this resume against.');
  }

  return runAgent(
    resumeAgent,
    { ...input, resumeId, mode },
    {
      ...ctx,
      // Spread last so a caller cannot slip a different userId in through ctx.
      userId,
      meta: {
        ...ctx.meta,
        [SELECTED_RESUME_META_KEY]: resumeId,
        ...(jobDescription ? { [JOB_DESCRIPTION_META_KEY]: jobDescription } : {}),
        ...(role ? { [TARGET_ROLE_META_KEY]: role.id } : {}),
      },
      budget: { ...RESUME_AGENT_BUDGET, ...ctx.budget },
    }
  );
}
