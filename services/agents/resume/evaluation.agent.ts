/**
 * Resume Evaluation Agent — a specialist, independently runnable.
 *
 * Judges how well one resume is *written*: section completeness, bullet
 * substance, evidence of measurable results, vague or padded phrasing. It
 * knows nothing about job descriptions or target roles; that is the JD/Role
 * Matching Agent's job, and keeping them apart is what lets the orchestrator
 * run one without the other.
 *
 * Read-only. Two tools: the shared resume reader and the deterministic quality
 * analyser. No editing tool is registered, so no prompt can reach one.
 *
 * Grounding works the way it does in the Phase 1 agent, and for the same
 * reason: the counts, the metric coverage and the findings are copied out of
 * run memory where the deterministic tool put them, so a model that
 * misremembers a number cannot change what the orchestrator is told. The model
 * supplies the prose — the assessment, the prioritised recommendations — and
 * nothing else.
 *
 * Runs on the shared Follio runtime, so it can be executed directly (useful in
 * tests and in the local harness) or delegated to by the orchestrator through
 * `agentAsTool`. Nothing in this file knows which of those is happening.
 */

import { z } from 'zod';

import { defineTool } from '@/lib/agents/define-tool';
import { runAgent } from '@/lib/agents/runtime';
import { Errors } from '@/lib/errors';

import { assessResumeQualityTool, MEMORY_QUALITY_REPORT } from './quality-tools';
import {
  getResumeTool,
  MEMORY_RESUME,
  pinnedToSelectedResume,
  SELECTED_RESUME_META_KEY,
  type AgentResumeView,
} from './tools';

import type { ResumeQualityReport } from '@/lib/resume-quality/types';
import type { AgentContext, AgentRunResult, ToolAgentDefinition } from '@/types/agents';

// ============================================================================
// CONTRACT
// ============================================================================

export interface EvaluationAgentInput {
  /** The resume under analysis. Authoritative; set from trusted context. */
  resumeId: string;
  /** What the orchestrator wants looked at. Free text, optional. */
  focus?: string;
}

const findingSchema = z.object({
  code: z.string(),
  severity: z.string(),
  location: z.string(),
  detail: z.string(),
  evidence: z.string().optional(),
});

export const evaluationAgentResultSchema = z.object({
  /** Model prose: how this resume reads. */
  assessment: z.string(),
  /** Model prose, ordered most useful first. Suggestions, never claims. */
  recommendations: z.array(z.string()),
  /** Computed. Copied from the deterministic report, not written by the model. */
  counts: z.object({
    experiences: z.number(),
    education: z.number(),
    skills: z.number(),
    projects: z.number(),
    totalBullets: z.number(),
    bulletsWithMetrics: z.number(),
  }),
  metricCoveragePercent: z.number(),
  missingSections: z.array(z.string()),
  /** The deterministic findings, most severe first. Computed. */
  findings: z.array(findingSchema),
  /** How the computed parts were produced. Computed. */
  basis: z.string(),
  /** Anything that failed or could not be checked. */
  limitations: z.array(z.string()),
});

export type EvaluationAgentOutput = z.infer<typeof evaluationAgentResultSchema>;

/** Findings carried into the result. Enough to act on without flooding the UI. */
const MAX_FINDINGS_IN_RESULT = 20;

// ============================================================================
// RESULT TOOL
// ============================================================================

export const submitEvaluationTool = defineTool({
  name: 'submit_evaluation',
  description:
    'Finish the run and return the evaluation. Call this only after get_resume and ' +
    'assess_resume_quality have both succeeded. The counts, metric coverage, missing sections ' +
    'and findings are filled in from what was computed — you supply only the assessment, the ' +
    'recommendations and any limitations.',
  inputSchema: z.object({
    assessment: z
      .string()
      .min(1)
      .describe('A few sentences on how this resume reads, based only on the findings.'),
    recommendations: z
      .array(z.string())
      .describe(
        'Specific, actionable changes to the resume text, most useful first. Phrase them as ' +
          'suggestions about the writing, never as claims about the user’s experience. Use [] ' +
          'when the findings support nothing concrete.'
      ),
    limitations: z
      .array(z.string())
      .optional()
      .describe('Anything that failed or could not be checked. Use [] when nothing did.'),
  }),
  execute: async ({ assessment, recommendations, limitations }, ctx) => {
    const resume = ctx.memory.get<AgentResumeView>(MEMORY_RESUME);
    if (!resume) {
      return { error: 'No resume in memory. Call get_resume before submitting an evaluation.' };
    }

    const report = ctx.memory.get<ResumeQualityReport>(MEMORY_QUALITY_REPORT);
    if (!report) {
      return {
        error:
          'No quality report in memory. Call assess_resume_quality before submitting, so the ' +
          'evaluation rests on computed findings rather than on impressions.',
      };
    }

    return {
      assessment,
      recommendations,
      counts: report.counts,
      metricCoveragePercent: report.metricCoveragePercent,
      missingSections: report.missingSections,
      findings: report.findings.slice(0, MAX_FINDINGS_IN_RESULT),
      basis: report.basis,
      limitations: [...(limitations ?? [])],
    };
  },
});

// ============================================================================
// AGENT DEFINITION
// ============================================================================

const INSTRUCTIONS = [
  'You are the Follio Resume Evaluation Agent. You judge how well one resume is written, for',
  'the signed-in user. You are read-only: you cannot change, save or delete anything.',
  '',
  'Rules:',
  '1. Never invent a fact. Every statement must come from the resume or from a tool result.',
  '2. Do not invent employers, job titles, dates, metrics, technologies, degrees or institutions.',
  '3. Never state a count, a percentage or a finding yourself. Those come from the tools.',
  '4. A missing metric means the resume does not state a number. It does not mean the work had',
  '   no impact. Never say or imply that it did.',
  '5. Recommend changes to the writing. Never recommend adding something the user may not have',
  '   done — say "add figures if you have them", not "add that you increased revenue".',
  '6. Read only the resume named in the task. Never mention another user or another resume.',
  '7. If a tool fails, record it in limitations rather than working around it.',
  '',
  'Tools:',
  '- get_resume: read the selected resume. Call this first; the analyser needs it.',
  '- assess_resume_quality: compute section completeness, bullet substance, metric coverage and',
  '  specific findings with evidence.',
  '- submit_evaluation: finish the run.',
  '',
  'How to work:',
  'Read the resume, then run the quality analysis. Look at what came back before you write:',
  'lead your recommendations with the highest-severity findings, group findings that share a',
  'cause rather than repeating one per bullet, and say plainly when the resume is already in',
  'good shape instead of inventing problems. Then call submit_evaluation. The counts, coverage,',
  'missing sections and findings are filled in for you, so do not restate them as arguments.',
].join('\n');

export const evaluationAgent: ToolAgentDefinition<EvaluationAgentInput, EvaluationAgentOutput> = {
  kind: 'tool',
  id: 'resume-evaluation',
  version: 'resume-evaluation-v1',
  // Prioritising findings and writing grounded advice is a judgement task.
  taskType: 'strategy',
  instructions: INSTRUCTIONS,
  buildUserMessage: (input) =>
    [
      `Selected resumeId: ${input.resumeId}`,
      input.focus
        ? `The orchestrator asked you to focus on: ${input.focus}`
        : 'Evaluate the overall writing quality of this resume.',
    ].join('\n'),
  tools: [
    pinnedToSelectedResume(getResumeTool),
    pinnedToSelectedResume(assessResumeQualityTool),
    submitEvaluationTool,
  ],
  resultToolName: 'submit_evaluation',
  outputSchema: evaluationAgentResultSchema,
  // No fallback on purpose: an evaluation that could not read the resume must
  // fail, not quietly return plausible-looking advice about nothing.
};

/**
 * Two data tools plus the result tool, so a clean run is three turns. The
 * head-room covers a retry when the model submits too early or returns a
 * payload that fails `outputSchema`.
 */
export const EVALUATION_AGENT_BUDGET = {
  maxSteps: 8,
  maxDurationMs: 60_000,
  maxTokens: 50_000,
} as const;

// ============================================================================
// ENTRY POINT
// ============================================================================

/**
 * Run the Evaluation Agent on its own.
 *
 * The orchestrator does not call this — it delegates through `agentAsTool`,
 * which builds the child context from its own trusted context. This exists so
 * the specialist can be run and tested independently, which is the point of it
 * being an agent rather than a prompt.
 */
export async function runEvaluationAgent(
  input: EvaluationAgentInput,
  auth: { userId: string },
  ctx: AgentContext = {}
): Promise<AgentRunResult<EvaluationAgentOutput>> {
  const userId = auth.userId?.trim();
  if (!userId) {
    throw Errors.unauthorized('Resume evaluation requires an authenticated user.');
  }

  const resumeId = input.resumeId?.trim();
  if (!resumeId) {
    throw Errors.badRequest('Select a resume to evaluate.');
  }

  return runAgent(
    evaluationAgent,
    { ...input, resumeId },
    {
      ...ctx,
      // Spread last so a caller cannot slip a different userId in through ctx.
      userId,
      meta: { ...ctx.meta, [SELECTED_RESUME_META_KEY]: resumeId },
      budget: { ...EVALUATION_AGENT_BUDGET, ...ctx.budget },
    }
  );
}
