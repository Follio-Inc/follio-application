/**
 * JD / Role Matching Agent — a specialist, independently runnable.
 *
 * Compares one resume against either a job description the user pasted or a
 * general target role they picked. It knows nothing about writing quality;
 * that is the Evaluation Agent's job.
 *
 * Every tool it owns is a Phase 1 tool, reused unchanged:
 * `score_against_jd`, `find_missing_keywords` and `evaluate_against_role`
 * from ./jd-tools, backed by lib/jd-match and lib/role-profiles. Nothing about
 * the matching maths is reimplemented here, so this agent and the Phase 1
 * Resume Agent cannot drift apart in what they report.
 *
 * Two distinctions are preserved because they are the ones most easily lost:
 *
 *   - JD matching produces a score out of 100, because there is a real posting
 *     to compare against. Role evaluation produces **competency coverage and
 *     no score**, because there is not — inventing a percentage there would
 *     dress Follio's own role description up as an ATS verdict.
 *   - The three-way keyword split (listed as a skill / present in the text but
 *     unlisted / absent entirely) survives into the output, because those
 *     three cases call for different advice.
 *
 * The model chooses which tools to run and explains what came back. It never
 * produces a figure: every number and every keyword list is copied out of run
 * memory where the deterministic tool put it.
 */

import { z } from 'zod';

import { defineTool } from '@/lib/agents/define-tool';
import { runAgent } from '@/lib/agents/runtime';
import { Errors } from '@/lib/errors';
import { resolveRoleProfile } from '@/lib/role-profiles/profiles';

import {
  evaluateAgainstRoleTool,
  findMissingKeywordsTool,
  JOB_DESCRIPTION_META_KEY,
  MEMORY_JD_KEYWORDS,
  MEMORY_JD_MATCH,
  MEMORY_ROLE_COVERAGE,
  scoreAgainstJdTool,
  TARGET_ROLE_META_KEY,
} from './jd-tools';
import { getResumeTool, pinnedToSelectedResume, SELECTED_RESUME_META_KEY } from './tools';

import type { AgentContext, AgentRunResult, ToolAgentDefinition } from '@/types/agents';

// ============================================================================
// CONTRACT
// ============================================================================

/** What this specialist was asked to compare against. */
export type MatchTarget = 'jd' | 'role';

export interface JdMatchAgentInput {
  resumeId: string;
  target: MatchTarget;
  /** Present for 'jd'. The text itself travels in meta, never in the prompt. */
  jobDescriptionLength?: number;
  /** Present for 'role'. A resolved role id. */
  targetRole?: string;
  focus?: string;
}

/** Mirrors what `score_against_jd` computes. */
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

/** Mirrors what `find_missing_keywords` computes. The three-way split. */
const jdKeywordsSchema = z.object({
  jobTitleHint: z.string().nullable(),
  matchedInSkills: z.array(z.string()),
  presentButNotListedAsSkill: z.array(z.string()),
  absentFromResume: z.array(z.string()),
  interpretation: z.string(),
});

/** Mirrors what `evaluate_against_role` computes. Note: no score field. */
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

export const jdMatchAgentResultSchema = z.object({
  /** Which comparison this run performed. */
  target: z.enum(['jd', 'role']),
  /** Model prose explaining what the computed results mean. */
  assessment: z.string(),
  /** Model prose: grounded, actionable, ordered most useful first. */
  recommendations: z.array(z.string()),
  /** Present only when score_against_jd ran. Computed. */
  jdMatch: jdMatchSchema.optional(),
  /** Present only when find_missing_keywords ran. Computed. */
  keywords: jdKeywordsSchema.optional(),
  /** Present only when evaluate_against_role ran. Computed. */
  roleCoverage: roleCoverageSchema.optional(),
  limitations: z.array(z.string()),
});

export type JdMatchAgentOutput = z.infer<typeof jdMatchAgentResultSchema>;

// ============================================================================
// RESULT TOOL
// ============================================================================

export const submitMatchFindingsTool = defineTool({
  name: 'submit_match_findings',
  description:
    'Finish the run and return the matching findings. Call this only after the matching tools ' +
    'you needed have succeeded. The score, matched skills, keyword groups and competency ' +
    'coverage are filled in from what was computed — you supply only the assessment, the ' +
    'recommendations and any limitations.',
  inputSchema: z.object({
    assessment: z
      .string()
      .min(1)
      .describe('A few sentences explaining what the computed results mean for this resume.'),
    recommendations: z
      .array(z.string())
      .describe(
        'Specific changes to the resume text, most useful first. Phrase them as suggestions ' +
          'about wording and emphasis, never as claims about the user’s experience. Use [] ' +
          'when the results support nothing concrete.'
      ),
    limitations: z
      .array(z.string())
      .optional()
      .describe('Anything that failed or could not be checked. Use [] when nothing did.'),
  }),
  execute: async ({ assessment, recommendations, limitations }, ctx) => {
    const input = ctx.memory.get<JdMatchAgentInput>('__input');
    const target: MatchTarget = input?.target ?? 'jd';

    const jdMatch = ctx.memory.get<z.infer<typeof jdMatchSchema>>(MEMORY_JD_MATCH);
    const keywords = ctx.memory.get<z.infer<typeof jdKeywordsSchema>>(MEMORY_JD_KEYWORDS);
    const roleCoverage = ctx.memory.get<z.infer<typeof roleCoverageSchema>>(MEMORY_ROLE_COVERAGE);

    // Nothing ran, so there is nothing to report. Refusing here rather than
    // returning an empty result keeps the loop going so the model can run the
    // tool it skipped — and if it never does, the run fails rather than
    // handing the orchestrator a confident-looking blank.
    if (!jdMatch && !keywords && !roleCoverage) {
      return {
        error:
          'No matching results in memory. Run the matching tool for this target before ' +
          'submitting, so the findings rest on computed results rather than on impressions.',
      };
    }

    const notes = [...(limitations ?? [])];
    if (target === 'jd' && !jdMatch && !keywords) {
      notes.push('No job-description analysis ran, so nothing here reflects that posting.');
    }
    if (target === 'role' && !roleCoverage) {
      notes.push('No target-role evaluation ran, so nothing here reflects that role.');
    }

    return {
      target,
      assessment,
      recommendations,
      ...(jdMatch ? { jdMatch } : {}),
      ...(keywords ? { keywords } : {}),
      ...(roleCoverage ? { roleCoverage } : {}),
      limitations: notes,
    };
  },
});

// ============================================================================
// AGENT DEFINITION
// ============================================================================

const INSTRUCTIONS = [
  'You are the Follio JD / Role Matching Agent. You compare one resume against either a job',
  'description or a general target role. You are read-only: you cannot change anything.',
  '',
  'Rules:',
  '1. Never state or estimate a score, a match percentage, or a list of matched or missing',
  '   keywords yourself. Those come from the tools. If a tool did not run, there is no score.',
  '2. A keyword missing from a resume means it is not written there. It does not mean the user',
  '   lacks that experience. Never say or imply that it does.',
  '3. A target role is a general profile Follio wrote, not a real posting, so it has no match',
  '   percentage and no ATS score. Report competency coverage and never invent a number for it.',
  '4. Never invent employers, job titles, dates, metrics, technologies, degrees or institutions.',
  '5. Read only the resume named in the task. Never mention another user or another resume.',
  '6. If a tool reports it cannot run, record that in limitations rather than guessing what it',
  '   would have returned.',
  '',
  'Tools:',
  '- get_resume: read the selected resume. Call this first; the matching tools need it.',
  '- score_against_jd: score the resume against the job description supplied for this run.',
  '- find_missing_keywords: sort that job description’s keywords into already-listed,',
  '  present-but-not-listed-as-a-skill, and absent.',
  '- evaluate_against_role: check the resume against the target role chosen for this run.',
  '- submit_match_findings: finish the run.',
  '',
  'How to work:',
  'Read the resume, then run the tools that fit the target you were given. You cannot see the',
  'job description or the role definition yourself — only the tools can, so you must call them',
  'to learn anything about either. Look at what each returns before deciding what to do next: a',
  'weak score or a long list of absent keywords is a reason to look further with the keyword',
  'tool, a strong one may not be. Do not call a tool whose input this run does not have.',
  '',
  'Then call submit_match_findings. The computed figures are filled in for you, so do not',
  'restate them as arguments — explain what they mean and what to change.',
].join('\n');

function buildUserMessage(input: JdMatchAgentInput): string {
  const lines = [`Selected resumeId: ${input.resumeId}`, `Comparison target: ${input.target}`];

  if (input.target === 'jd') {
    lines.push(
      `A job description was supplied for this run (${input.jobDescriptionLength ?? 0} characters).`,
      'You cannot see its text. Use score_against_jd and find_missing_keywords to analyse it.'
    );
  } else {
    const role = resolveRoleProfile(input.targetRole);
    lines.push(
      `Target role: ${role?.label ?? input.targetRole}. You cannot see the role definition.`,
      'Use evaluate_against_role to analyse it.',
      'This is a general role profile, not a job posting, so there is no match percentage.'
    );
  }

  if (input.focus) lines.push(`The orchestrator asked you to focus on: ${input.focus}`);

  return lines.join('\n');
}

export const jdMatchAgent: ToolAgentDefinition<JdMatchAgentInput, JdMatchAgentOutput> = {
  kind: 'tool',
  id: 'resume-jd-match',
  version: 'resume-jd-match-v1',
  taskType: 'strategy',
  instructions: INSTRUCTIONS,
  buildUserMessage: (input) => buildUserMessage(input),
  // All four data tools are registered in both targets on purpose. A tool
  // whose input this run does not have refuses in code (jd-tools.ts) and the
  // model adapts — which is a real decision, rather than a path chosen for it
  // by swapping the tool list.
  tools: [
    pinnedToSelectedResume(getResumeTool),
    pinnedToSelectedResume(scoreAgainstJdTool),
    pinnedToSelectedResume(findMissingKeywordsTool),
    pinnedToSelectedResume(evaluateAgainstRoleTool),
    submitMatchFindingsTool,
  ],
  resultToolName: 'submit_match_findings',
  outputSchema: jdMatchAgentResultSchema,
  // No fallback: a run that could not match must fail, not return a guess.
};

/**
 * A JD run that uses both JD tools is four turns; a role run is three. The
 * head-room covers a retry when the model submits too early or returns a
 * payload that fails `outputSchema`.
 */
export const JD_MATCH_AGENT_BUDGET = {
  maxSteps: 10,
  maxDurationMs: 60_000,
  maxTokens: 50_000,
} as const;

// ============================================================================
// ENTRY POINT
// ============================================================================

/**
 * Run the matching specialist on its own.
 *
 * As with the Evaluation Agent, the orchestrator does not call this: it
 * delegates through `agentAsTool`. This exists so the specialist is genuinely
 * independently runnable.
 *
 * The job description and target role are validated here and put in `meta`,
 * where only the tools can read them. Neither is ever placed in the model's
 * context — it learns about them solely through tool results.
 */
export async function runJdMatchAgent(
  input: JdMatchAgentInput & { jobDescription?: string },
  auth: { userId: string },
  ctx: AgentContext = {}
): Promise<AgentRunResult<JdMatchAgentOutput>> {
  const userId = auth.userId?.trim();
  if (!userId) {
    throw Errors.unauthorized('Resume matching requires an authenticated user.');
  }

  const resumeId = input.resumeId?.trim();
  if (!resumeId) {
    throw Errors.badRequest('Select a resume to match.');
  }

  const jobDescription = input.target === 'jd' ? input.jobDescription?.trim() : undefined;
  if (input.target === 'jd' && !jobDescription) {
    throw Errors.badRequest('Paste a job description to match this resume against.');
  }

  const role = input.target === 'role' ? resolveRoleProfile(input.targetRole) : null;
  if (input.target === 'role' && !role) {
    throw Errors.badRequest('Choose a supported target role to match this resume against.');
  }

  return runAgent(
    jdMatchAgent,
    {
      ...input,
      resumeId,
      jobDescriptionLength: jobDescription?.length,
      ...(role ? { targetRole: role.id } : {}),
    },
    {
      ...ctx,
      userId,
      meta: {
        ...ctx.meta,
        [SELECTED_RESUME_META_KEY]: resumeId,
        ...(jobDescription ? { [JOB_DESCRIPTION_META_KEY]: jobDescription } : {}),
        ...(role ? { [TARGET_ROLE_META_KEY]: role.id } : {}),
      },
      budget: { ...JD_MATCH_AGENT_BUDGET, ...ctx.budget },
    }
  );
}
