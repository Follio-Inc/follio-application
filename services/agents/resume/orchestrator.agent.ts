/**
 * Resume Orchestrator Agent — Phase 2B.
 *
 * Coordinates two specialists and owns no analysis of its own. Its tools are
 * not functions: each one is a whole agent, wrapped by `agentAsTool`, with its
 * own instructions, its own tool-calling loop, its own Zod output schema, its
 * own budget and its own `AgentRun` row.
 *
 * What the orchestrator decides, and what is decided for it:
 *
 *   - It decides **which specialists to run and in what order**, from the
 *     user's mode and from what the first specialist actually returned. A weak
 *     match score is a reason to also look at writing quality; a strong one is
 *     not. That decision is made by the model from tool results, which is the
 *     part that makes this an orchestrator rather than a script.
 *   - It does **not** decide what it is allowed to look at. The pinned resume,
 *     the authenticated user and the available comparison target all come from
 *     trusted context, enforced in code. Delegating matching when no job
 *     description and no role were supplied is refused before a child starts,
 *     rather than left to the prompt.
 *   - It does **not** decide what the numbers are. Every figure in the final
 *     report is copied off the shared blackboard, where the specialist that
 *     computed it published it. A model that misremembers a score cannot
 *     change what the user is shown.
 *
 * Built alongside the Phase 1 Resume Agent, which is untouched and still
 * serves the API and the Builder. Nothing here is wired into a route yet.
 */

import { z } from 'zod';

import { agentAsTool } from '@/lib/agents/agent-as-tool';
import { createDelegationState } from '@/lib/agents/delegation';
import { defineTool } from '@/lib/agents/define-tool';
import { runAgent } from '@/lib/agents/runtime';
import { Errors } from '@/lib/errors';
import { resolveRoleProfile } from '@/lib/role-profiles/profiles';

import {
  evaluationAgent,
  EVALUATION_AGENT_BUDGET,
  evaluationAgentResultSchema,
} from './evaluation.agent';
import {
  jdMatchAgent,
  JD_MATCH_AGENT_BUDGET,
  jdMatchAgentResultSchema,
  type MatchTarget,
} from './jd-match.agent';
import { JOB_DESCRIPTION_META_KEY, TARGET_ROLE_META_KEY } from './jd-tools';
import { SELECTED_RESUME_META_KEY } from './tools';

import type { AgentContext, AgentRunResult, AgentTool, ToolAgentDefinition } from '@/types/agents';

// ============================================================================
// CONTRACT
// ============================================================================

export const ORCHESTRATOR_MODES = ['general', 'jd', 'role'] as const;
export type OrchestratorMode = (typeof ORCHESTRATOR_MODES)[number];

export interface OrchestratorInput {
  resumeId: string;
  mode: OrchestratorMode;
  jobDescription?: string;
  targetRole?: string;
  instruction?: string;
}

/** Blackboard keys the specialists publish under, in their own namespaces. */
export const SHARED_EVALUATION_KEY = 'evaluation';
export const SHARED_MATCHING_KEY = 'matching';

export const orchestratorResultSchema = z.object({
  resumeId: z.string(),
  mode: z.enum(ORCHESTRATOR_MODES),
  /** Model prose: the combined picture. */
  summary: z.string(),
  /** Model prose, ordered most useful first, drawn from specialist findings. */
  recommendations: z.array(z.string()),
  /** Which specialists actually produced findings. Computed from the blackboard. */
  agentsUsed: z.array(z.string()),
  /** Present only when the Evaluation Agent ran. Computed. */
  evaluation: evaluationAgentResultSchema.optional(),
  /** Present only when the Matching Agent ran. Computed. */
  matching: jdMatchAgentResultSchema.optional(),
  limitations: z.array(z.string()),
});

export type OrchestratorOutput = z.infer<typeof orchestratorResultSchema>;

// ============================================================================
// DELEGATION TOOLS
// ============================================================================

/** The comparison this run can actually make, from trusted context only. */
function matchTargetFromMeta(
  meta: Readonly<Record<string, unknown>> | undefined
): MatchTarget | null {
  const jd = meta?.[JOB_DESCRIPTION_META_KEY];
  if (typeof jd === 'string' && jd.trim()) return 'jd';
  const role = meta?.[TARGET_ROLE_META_KEY];
  if (typeof role === 'string' && role.trim()) return 'role';
  return null;
}

/**
 * Refuse matching before a child run starts when there is nothing to match
 * against.
 *
 * Without this the model could delegate matching on a general run; the child
 * would start, every one of its tools would refuse, and it would burn its
 * whole budget before failing. Checking here costs nothing, consumes no child
 * slot, and hands the model a reason it can act on.
 */
function requiresMatchTarget(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (input, ctx) => {
      if (!matchTargetFromMeta(ctx.meta)) {
        return {
          error:
            'No job description and no target role were supplied for this run, so there is ' +
            'nothing to match against. Do not try again — use the evaluation specialist instead.',
        };
      }
      return tool.execute(input, ctx);
    },
  };
}

const delegateEvaluationTool = agentAsTool({
  agent: evaluationAgent,
  name: 'delegate_evaluation',
  description:
    'Hand the resume to the Resume Evaluation Agent, which judges how well it is written: ' +
    'empty sections, bullet substance, measurable results, vague phrasing. Returns computed ' +
    'findings with evidence plus prioritised recommendations. Use this for a general review, ' +
    'or alongside matching when the writing itself looks like the problem.',
  inputSchema: z.object({
    focus: z.string().optional().describe('What to concentrate on, in your words. Optional.'),
  }),
  buildInput: (args, trusted) => ({
    // Trusted pin, never a model argument.
    resumeId: trusted.resumeId ?? '',
    focus: args.focus,
  }),
  budget: EVALUATION_AGENT_BUDGET,
  publishAs: SHARED_EVALUATION_KEY,
});

const delegateMatchingTool = requiresMatchTarget(
  agentAsTool({
    agent: jdMatchAgent,
    name: 'delegate_matching',
    description:
      'Hand the resume to the JD / Role Matching Agent, which compares it against the job ' +
      'description or target role supplied for this run. Returns a deterministic score and ' +
      'keyword breakdown for a job description, or competency coverage for a general role. ' +
      'Only works when one of those was supplied.',
    inputSchema: z.object({
      focus: z.string().optional().describe('What to concentrate on, in your words. Optional.'),
    }),
    buildInput: (args, trusted) => {
      const jd = trusted.meta[JOB_DESCRIPTION_META_KEY];
      const role = trusted.meta[TARGET_ROLE_META_KEY];
      // The target is derived from what the run actually has, so the model
      // cannot ask for a JD comparison on a run that has no job description.
      const target = matchTargetFromMeta(trusted.meta) ?? 'jd';

      return {
        resumeId: trusted.resumeId ?? '',
        target,
        jobDescriptionLength: typeof jd === 'string' ? jd.length : undefined,
        targetRole: typeof role === 'string' ? role : undefined,
        focus: args.focus,
      };
    },
    budget: JD_MATCH_AGENT_BUDGET,
    publishAs: SHARED_MATCHING_KEY,
  })
);

// ============================================================================
// RESULT TOOL
// ============================================================================

export const submitOrchestratedReportTool = defineTool({
  name: 'submit_orchestrated_report',
  description:
    'Finish the run and return the combined report. Call this once the specialists you needed ' +
    'have returned. Their findings are filled in from what they computed — you supply only the ' +
    'summary, the combined recommendations and any limitations.',
  inputSchema: z.object({
    summary: z.string().min(1).describe('A few sentences combining what the specialists found.'),
    recommendations: z
      .array(z.string())
      .describe(
        'The most useful changes across every specialist, ordered, de-duplicated. Phrase them ' +
          'as suggestions about the resume text, never as claims about the user. Use [] when ' +
          'the findings support nothing concrete.'
      ),
    limitations: z
      .array(z.string())
      .optional()
      .describe('Anything that failed or could not be checked. Use [] when nothing did.'),
  }),
  execute: async ({ summary, recommendations, limitations }, ctx) => {
    const input = ctx.memory.get<OrchestratorInput>('__input');
    const mode: OrchestratorMode = input?.mode ?? 'general';

    // Read the specialists' own validated outputs off the blackboard, filed
    // under the agent that produced each one. Not from the model's retelling.
    const evaluation = ctx.shared?.getFrom<z.infer<typeof evaluationAgentResultSchema>>(
      'resume-evaluation',
      SHARED_EVALUATION_KEY
    );
    const matching = ctx.shared?.getFrom<z.infer<typeof jdMatchAgentResultSchema>>(
      'resume-jd-match',
      SHARED_MATCHING_KEY
    );

    if (!evaluation && !matching) {
      return {
        error:
          'No specialist findings are available. Delegate to a specialist before submitting, ' +
          'so the report rests on computed findings rather than on impressions.',
      };
    }

    const agentsUsed = [
      ...(evaluation ? ['resume-evaluation'] : []),
      ...(matching ? ['resume-jd-match'] : []),
    ];

    // The mode the user asked for did not get the work it needed. Say so,
    // rather than returning something that looks like an answer to it.
    const notes = [...(limitations ?? [])];
    if (mode === 'jd' && !matching) {
      notes.push(
        'The job-description comparison did not run, so nothing here reflects that posting.'
      );
    }
    if (mode === 'role' && !matching) {
      notes.push('The target-role evaluation did not run, so nothing here reflects that role.');
    }
    if (mode === 'general' && !evaluation) {
      notes.push(
        'The resume evaluation did not run, so nothing here reflects its writing quality.'
      );
    }

    return {
      resumeId: input?.resumeId ?? '',
      mode,
      summary,
      recommendations,
      agentsUsed,
      ...(evaluation ? { evaluation } : {}),
      ...(matching ? { matching } : {}),
      limitations: notes,
    };
  },
});

// ============================================================================
// AGENT DEFINITION
// ============================================================================

const INSTRUCTIONS = [
  'You are the Follio Resume Orchestrator. You do not analyse resumes yourself. You decide',
  'which specialist agents to run, read what they return, and combine their findings into one',
  'report. You are read-only: nothing you or they do changes the resume.',
  '',
  'Your specialists:',
  '- delegate_evaluation → the Resume Evaluation Agent. How well the resume is *written*:',
  '  empty sections, thin bullets, missing measurable results, vague phrasing.',
  '- delegate_matching → the JD / Role Matching Agent. How well the resume *matches* the job',
  '  description or target role supplied for this run. Only works when one was supplied.',
  '',
  'Rules:',
  '1. Never invent a finding, a score, a keyword or a count. Everything factual in your report',
  '   comes from a specialist. If no specialist ran, you have nothing to report.',
  '2. Never restate a specialist’s numbers as your own arguments — they are filled in for you.',
  '3. A keyword missing from a resume means it is not written there, not that the user lacks',
  '   the experience. Never say or imply otherwise.',
  '4. Do not delegate the same specialist twice for the same question. If one refuses, record',
  '   that in limitations rather than retrying it.',
  '5. Recommend changes to the resume text, never claims about the user.',
  '',
  'How to decide:',
  '- General review: delegate_evaluation. That is usually all you need.',
  '- Job description: delegate_matching first. Then look at what came back. If the score is',
  '  weak or fair, or many keywords are absent, the writing may be the real problem — delegate',
  '  _evaluation as well and combine both. If the match is strong and little is missing, do not',
  '  spend a second specialist; report what you have.',
  '- Target role: delegate_matching first. If competency coverage is thin or several',
  '  competencies have no evidence, delegate_evaluation as well to see whether the resume is',
  '  simply underwritten. If coverage is broad, report what you have.',
  '',
  'Then call submit_orchestrated_report. Combine the recommendations across specialists: lead',
  'with what matters most, merge duplicates, and keep each one specific enough to act on.',
].join('\n');

function buildUserMessage(input: OrchestratorInput): string {
  const lines = [`Selected resumeId: ${input.resumeId}`, `Requested evaluation: ${input.mode}`];

  if (input.mode === 'jd') {
    lines.push(
      `A job description was supplied for this run (${input.jobDescription?.length ?? 0} characters).`,
      'Neither you nor the specialist can see its text; only their tools can.'
    );
  } else if (input.mode === 'role') {
    const role = resolveRoleProfile(input.targetRole);
    lines.push(
      `Target role: ${role?.label ?? input.targetRole}.`,
      'This is a general role profile, not a job posting, so there is no match percentage.'
    );
  } else {
    lines.push(
      'No job description and no target role were supplied, so delegate_matching cannot run.'
    );
  }

  lines.push(
    input.instruction
      ? `The user asked: ${input.instruction}`
      : 'The user asked for an analysis of this resume.'
  );

  return lines.join('\n');
}

export const resumeOrchestratorAgent: ToolAgentDefinition<OrchestratorInput, OrchestratorOutput> = {
  kind: 'tool',
  id: 'resume-orchestrator',
  version: 'resume-orchestrator-v1',
  // Choosing specialists from intermediate results is the judgement task this
  // whole phase exists for, so it runs on the heavy model.
  taskType: 'strategy',
  instructions: INSTRUCTIONS,
  buildUserMessage: (input) => buildUserMessage(input),
  tools: [delegateEvaluationTool, delegateMatchingTool, submitOrchestratedReportTool],
  resultToolName: 'submit_orchestrated_report',
  outputSchema: orchestratorResultSchema,
  // No fallback: a run where every specialist failed must fail, not return a
  // plausible-looking report assembled from nothing.
};

/**
 * The orchestrator's own per-run budget. Each specialist has its own on top,
 * and the tree-wide ceilings below cap the whole execution.
 */
export const ORCHESTRATOR_BUDGET = {
  maxSteps: 12,
  maxDurationMs: 180_000,
  maxTokens: 80_000,
} as const;

/**
 * Tree-wide ceilings for one orchestrated request.
 *
 * `maxDepth: 1` is the important one: the orchestrator may delegate to a
 * specialist, and a specialist may not delegate at all. Neither specialist
 * registers a delegation tool today, so this is belt and braces — but it is
 * enforced in code, so adding one later cannot silently open a recursion.
 */
export const ORCHESTRATOR_DELEGATION_LIMITS = {
  maxDepth: 1,
  maxChildRuns: 3,
  maxCallsPerTool: 2,
  maxTotalTokens: 200_000,
  maxTotalDurationMs: 240_000,
} as const;

// ============================================================================
// ENTRY POINT
// ============================================================================

/**
 * Run the orchestrated, multi-agent resume analysis for one authenticated user.
 *
 * `auth` comes from the session at the API boundary — never from a request
 * body and never from a model. The pinned resume, the job description and the
 * target role are validated here and placed in `meta`, where only tools can
 * read them; they are inherited unchanged by every delegated child.
 */
export async function runResumeOrchestrator(
  input: OrchestratorInput,
  auth: { userId: string },
  ctx: AgentContext = {}
): Promise<AgentRunResult<OrchestratorOutput>> {
  const userId = auth.userId?.trim();
  if (!userId) {
    throw Errors.unauthorized('Resume analysis requires an authenticated user.');
  }

  const resumeId = input.resumeId?.trim();
  if (!resumeId) {
    throw Errors.badRequest('Select a resume to analyse.');
  }

  const mode: OrchestratorMode = input.mode ?? 'general';

  const jobDescription = mode === 'jd' ? input.jobDescription?.trim() : undefined;
  if (mode === 'jd' && !jobDescription) {
    throw Errors.badRequest('Paste a job description to evaluate this resume against.');
  }

  const role = mode === 'role' ? resolveRoleProfile(input.targetRole) : null;
  if (mode === 'role' && !role) {
    throw Errors.badRequest('Choose a supported target role to evaluate this resume against.');
  }

  return runAgent(
    resumeOrchestratorAgent,
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
      budget: { ...ORCHESTRATOR_BUDGET, ...ctx.budget },
      // Starting the delegation ledger here is what makes delegation legal at
      // all: `agentAsTool` refuses outright on a run without one.
      delegation: ctx.delegation ?? createDelegationState(ORCHESTRATOR_DELEGATION_LIMITS),
    }
  );
}
