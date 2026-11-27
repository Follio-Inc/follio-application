/**
 * Resume Orchestrator Agent — Phase 2B, extended in Phase 3A.
 *
 * Coordinates specialists and owns no analysis of its own. Its tools are not
 * functions: each one is a whole agent, wrapped by `agentAsTool`, with its own
 * instructions, its own tool-calling loop, its own Zod output schema, its own
 * budget and its own `AgentRun` row.
 *
 * What the orchestrator decides, and what is decided for it:
 *
 *   - It decides **which specialists to run and in what order**, from the
 *     user's mode and from what the first specialist actually returned. A weak
 *     match score is a reason to also look at writing quality; a strong one is
 *     not. A verifier asking for revisions is a reason to rewrite again; a
 *     clean verification is not. Those decisions are made by the model from
 *     tool results, which is the part that makes this an orchestrator rather
 *     than a script.
 *   - It does **not** decide what it is allowed to look at. The pinned resume,
 *     the authenticated user, the available comparison target and whether
 *     rewriting was requested at all come from trusted context, enforced in
 *     code. Delegating matching with no job description, or rewriting on a
 *     run the user asked only to evaluate, is refused before a child starts
 *     rather than left to the prompt.
 *   - It does **not** decide what the numbers are, what the proposals say, or
 *     which of them are verified. Every figure and every proposal in the final
 *     report is copied off the shared blackboard, where the specialist that
 *     produced it published it. A model that misremembers a score, or claims a
 *     rejected rewrite was approved, cannot change what the user is shown.
 *   - It does **not** decide how many times to retry. The revision loop is
 *     bounded by counters in this file, not by the prompt that asks it to stop.
 *
 * Phase 3A adds the rewrite loop and changes nothing about the Phase 2B
 * analysis path: a run without `rewrite: true` registers the same two
 * specialists, under the same limits, and produces the same report.
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
import {
  editProposalSchema,
  REWRITE_AGENT_BUDGET,
  rewriteAgent,
  type RewriteAgentOutput,
  type RewriteContext,
} from './rewrite.agent';
import {
  SHARED_EVALUATION_KEY,
  SHARED_MATCHING_KEY,
  SHARED_PROPOSALS_KEY,
  SHARED_VERDICTS_KEY,
} from './shared-keys';
import { SELECTED_RESUME_META_KEY } from './tools';
import {
  VERIFICATION_AGENT_BUDGET,
  verificationAgent,
  verificationVerdictSchema,
  type VerificationAgentOutput,
} from './verification.agent';

import type { PriorVerdictSummary } from './rewrite-tools';
import type {
  AgentContext,
  AgentRunResult,
  AgentTool,
  AgentToolContext,
  ToolAgentDefinition,
} from '@/types/agents';

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
  /**
   * Whether this run may propose rewrites.
   *
   * Additive and defaulted to false, so every existing caller keeps the
   * Phase 2B behaviour exactly: an evaluation request stays an evaluation
   * request. Rewriting is a different thing to ask for — it produces text
   * that claims to describe the user's work — so it has to be asked for.
   */
  rewrite?: boolean;
}

export { SHARED_EVALUATION_KEY, SHARED_MATCHING_KEY, SHARED_PROPOSALS_KEY, SHARED_VERDICTS_KEY };

/**
 * Context key recording that the user asked for rewrites.
 *
 * In `meta` rather than in the model's prompt for the same reason the job
 * description is: `meta` comes from the API boundary, is inherited unchanged
 * by every child, and cannot be written by a model. A rewrite delegation on a
 * run without it is refused in code.
 */
export const REWRITE_REQUESTED_META_KEY = 'rewriteRequested';

/** Revisions allowed after the first rewrite attempt. Enforced below, in code. */
export const MAX_REWRITE_REVISIONS = 2;

/** Per-tool delegation ceilings for one orchestrator run. */
const DELEGATION_CALL_LIMITS: Record<string, number> = {
  delegate_evaluation: 2,
  delegate_matching: 2,
  // One first attempt plus the permitted revisions.
  delegate_rewrite: 1 + MAX_REWRITE_REVISIONS,
  // Every rewrite round must be verifiable, including the last one.
  delegate_verification: 1 + MAX_REWRITE_REVISIONS,
};

/** Run-memory key holding how often each delegation tool has been called. */
const MEMORY_DELEGATION_CALLS = 'delegationCalls';

// ── Result schema ───────────────────────────────────────────────────────────

/** One proposal as the user will see it: the edit, plus what verification said. */
const reviewedProposalSchema = editProposalSchema.extend({
  /** The verdict, when one was returned for this proposal. Computed. */
  verification: verificationVerdictSchema.optional(),
  /** True only for a proposal a verifier approved. Computed, never model-set. */
  verified: z.boolean(),
});

const rewriteOutcomeSchema = z.object({
  /**
   * complete       — every proposal reached a settled verdict.
   * incomplete     — revisions were still outstanding when the limit was hit.
   * unverified     — proposals exist but verification never produced verdicts.
   * failed         — rewriting was requested and produced nothing.
   */
  status: z.enum(['complete', 'incomplete', 'unverified', 'failed']),
  /** Rewrite rounds after the first. Counted in code. */
  revisionAttempts: z.number(),
  revisionLimit: z.number(),
  proposals: z.array(reviewedProposalSchema),
  verifiedCount: z.number(),
  rejectedCount: z.number(),
  revisionRequiredCount: z.number(),
  needsUserInputCount: z.number(),
  /** Proposals that reached no verdict at all. Never shown as verified. */
  unverifiedCount: z.number(),
  /** Questions only the user can answer. */
  openQuestions: z.array(z.string()),
  basis: z.string(),
});

export const orchestratorResultSchema = z.object({
  resumeId: z.string(),
  mode: z.enum(ORCHESTRATOR_MODES),
  /** Whether rewriting was authorised for this run. Computed from trusted input. */
  rewriteRequested: z.boolean(),
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
  /** Present only when rewriting was requested. Computed. */
  rewrite: rewriteOutcomeSchema.optional(),
  limitations: z.array(z.string()),
  /** Whether the run did everything that was asked of it. Computed. */
  executionStatus: z.enum(['complete', 'partial']),
});

export type OrchestratorOutput = z.infer<typeof orchestratorResultSchema>;

// ============================================================================
// DELEGATION GUARDS
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

/** Whether this run was authorised to rewrite. Trusted context only. */
function rewriteAuthorized(meta: Readonly<Record<string, unknown>> | undefined): boolean {
  return meta?.[REWRITE_REQUESTED_META_KEY] === true;
}

/** What the rewrite is aimed at, derived from what the run actually has. */
function rewriteContextFromMeta(
  meta: Readonly<Record<string, unknown>> | undefined
): RewriteContext {
  const target = matchTargetFromMeta(meta);
  return target ?? 'general';
}

/**
 * Cap how often one delegation tool may run within a single orchestrator run.
 *
 * The tree-wide `maxCallsPerTool` is one number shared by every tool, so
 * widening it to make room for three rewrite rounds would also hand the
 * analysis specialists two extra runs each. These per-tool caps keep each
 * tool's own allowance where it belongs, in code rather than in the prompt.
 *
 * This wraps `agentAsTool` directly, inside the cheaper guards above it, so
 * only a delegation that really reaches a child spends a slot. A refusal that
 * never starts a run costs nothing, which matters because the rewrite loop
 * needs all three of its attempts available after an early misfire. The
 * counter does advance before the child's own outcome is known, so a child
 * that starts and fails still spends its slot: a failing specialist retried
 * three times is the loop this exists to stop.
 */
function boundedDelegation(tool: AgentTool, max: number): AgentTool {
  return {
    ...tool,
    execute: async (input: unknown, ctx: AgentToolContext) => {
      const counts = ctx.memory.get<Record<string, number>>(MEMORY_DELEGATION_CALLS) ?? {};
      const used = counts[tool.name] ?? 0;

      if (used >= max) {
        // Worded like `assertCanDelegate`'s refusal on purpose: a model
        // should meet one refusal vocabulary, not two that mean the same
        // thing depending on which ceiling happened to be lower.
        return {
          error:
            `Delegation refused: "${tool.name}" has already been called ${used} times in this ` +
            `run (limit ${max}). Use what it returned instead of calling it again, and record ` +
            'anything still outstanding in limitations.',
        };
      }

      ctx.memory.set(MEMORY_DELEGATION_CALLS, { ...counts, [tool.name]: used + 1 });
      return tool.execute(input, ctx);
    },
  };
}

/** How often a delegation tool has run in this orchestrator run. */
function delegationCalls(ctx: AgentToolContext, toolName: string): number {
  return (ctx.memory.get<Record<string, number>>(MEMORY_DELEGATION_CALLS) ?? {})[toolName] ?? 0;
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

/**
 * Refuse rewriting on a run the user did not ask to have rewritten.
 *
 * This is the control that keeps "evaluate my resume" from quietly becoming
 * "and here is a new one". It reads trusted context, so no instruction in a
 * resume, a job description or a user message can turn it on.
 */
function requiresRewriteAuthorization(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (input, ctx) => {
      if (!rewriteAuthorized(ctx.meta)) {
        return {
          error:
            'This run was not authorised to rewrite the resume — the user asked for an ' +
            'analysis. Do not try again. Report what the analysis found instead.',
        };
      }
      return tool.execute(input, ctx);
    },
  };
}

/** Refuse rewriting before any specialist has produced findings to work from. */
function requiresAnalysisFindings(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (input, ctx) => {
      const evaluation = ctx.shared?.getFrom('resume-evaluation', SHARED_EVALUATION_KEY);
      const matching = ctx.shared?.getFrom('resume-jd-match', SHARED_MATCHING_KEY);
      if (!evaluation && !matching) {
        return {
          error:
            'No analysis findings have been produced yet, so a rewrite would have nothing to ' +
            'ground itself in. Delegate an analysis specialist first, then come back.',
        };
      }
      return tool.execute(input, ctx);
    },
  };
}

/**
 * Refuse a second or third rewrite round that is not answering a verifier.
 *
 * A revision is defined as a response to verification feedback. Letting the
 * model re-roll the rewrite without one would make the loop unbounded in
 * substance even while the counters held, and the second attempt would have
 * no more reason to be right than the first.
 */
function requiresVerificationBeforeRevision(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (input, ctx) => {
      const calls = delegationCalls(ctx, tool.name);
      if (calls === 0) return tool.execute(input, ctx);

      const verification = ctx.shared?.getFrom<VerificationAgentOutput>(
        'resume-verification',
        SHARED_VERDICTS_KEY
      );
      if (!verification) {
        return {
          error:
            'The previous proposals have not been verified yet, so there is nothing to revise ' +
            'towards. Delegate verification first.',
        };
      }

      const outstanding = (verification.verdicts ?? []).filter(
        (verdict) => verdict.status === 'revision_required'
      );
      if (outstanding.length === 0) {
        return {
          error:
            'Verification asked for no revisions, so there is nothing to rewrite again. ' +
            'Finish the run with the proposals you have.',
        };
      }

      return tool.execute(input, ctx);
    },
  };
}

/** Refuse verification when no proposals exist to verify. */
function requiresProposals(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (input, ctx) => {
      const rewrite = ctx.shared?.getFrom<RewriteAgentOutput>(
        'resume-rewrite',
        SHARED_PROPOSALS_KEY
      );
      if (!rewrite || (rewrite.proposals ?? []).length === 0) {
        return {
          error:
            'There are no edit proposals to verify. Delegate the rewrite specialist first, or ' +
            'finish the run if it produced nothing.',
        };
      }
      return tool.execute(input, ctx);
    },
  };
}

// ============================================================================
// DELEGATION TOOLS
// ============================================================================

const delegateEvaluationTool = boundedDelegation(
  agentAsTool({
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
  }),
  DELEGATION_CALL_LIMITS.delegate_evaluation
);

const delegateMatchingTool = requiresMatchTarget(
  boundedDelegation(
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
    }),
    DELEGATION_CALL_LIMITS.delegate_matching
  )
);

/** The verifier's outstanding objections, as a revision run receives them. */
function priorVerdictsFor(verification: VerificationAgentOutput | undefined): {
  verdicts: PriorVerdictSummary[];
  round: number;
} {
  if (!verification) return { verdicts: [], round: 0 };

  const verdicts = (verification.verdicts ?? [])
    .filter((verdict) => verdict.status !== 'approved')
    .map((verdict) => ({
      proposalId: verdict.proposalId,
      targetRef: verdict.targetRef,
      status: verdict.status,
      reason: verdict.reason,
      questionableClaims: verdict.questionableClaims ?? [],
      requiredRevisions: verdict.requiredRevisions ?? [],
    }));

  return { verdicts, round: (verification.revisionRound ?? 0) + 1 };
}

const delegateRewriteTool = requiresRewriteAuthorization(
  requiresAnalysisFindings(
    requiresVerificationBeforeRevision(
      boundedDelegation(
        agentAsTool({
          agent: rewriteAgent,
          name: 'delegate_rewrite',
          description:
            'Hand the resume to the Resume Rewrite Agent, which proposes stronger wording for ' +
            'specific bullets, highlights and the summary, grounded in the analysis findings. ' +
            'It proposes only — nothing is applied. Call it again after verification only when ' +
            'the verifier asked for revisions; the feedback is passed to it automatically.',
          inputSchema: z.object({
            focus: z
              .string()
              .optional()
              .describe('What the rewrite should concentrate on, in your words. Optional.'),
          }),
          buildInput: (args, trusted) => {
            const jd = trusted.meta[JOB_DESCRIPTION_META_KEY];
            const role = trusted.meta[TARGET_ROLE_META_KEY];

            // Revision feedback comes off the blackboard, where the verifier
            // published it — not from the model's retelling of what it said.
            const verification = trusted.shared?.getFrom<VerificationAgentOutput>(
              'resume-verification',
              SHARED_VERDICTS_KEY
            );
            const prior = priorVerdictsFor(verification);

            return {
              resumeId: trusted.resumeId ?? '',
              context: rewriteContextFromMeta(trusted.meta),
              jobDescriptionLength: typeof jd === 'string' ? jd.length : undefined,
              targetRole: typeof role === 'string' ? role : undefined,
              focus: args.focus,
              revisionRound: prior.round,
              priorVerdicts: prior.verdicts,
            };
          },
          budget: REWRITE_AGENT_BUDGET,
          publishAs: SHARED_PROPOSALS_KEY,
          // A compact view. The full proposals are read off the blackboard by
          // the result tool, so there is no reason to spend the orchestrator's
          // context on every original and replacement string — and no way for
          // it to garble one on the way through.
          summarize: (output, run) => ({
            _agent: 'resume-rewrite',
            _runId: run.id,
            revisionRound: output.revisionRound,
            proposalCount: output.proposals.length,
            proposals: output.proposals.map((proposal) => ({
              proposalId: proposal.proposalId,
              label: proposal.label,
              section: proposal.section,
              explanation: proposal.explanation,
              hasUncertainties: proposal.uncertainties.length > 0,
            })),
            openQuestions: output.openQuestions,
            rationale: output.rationale,
            limitations: output.limitations,
            next: 'Proposals are unverified. Delegate verification before treating any as usable.',
          }),
        }),
        DELEGATION_CALL_LIMITS.delegate_rewrite
      )
    )
  )
);

const delegateVerificationTool = requiresRewriteAuthorization(
  requiresProposals(
    boundedDelegation(
      agentAsTool({
        agent: verificationAgent,
        name: 'delegate_verification',
        description:
          'Hand the current edit proposals to the Resume Verification Agent, which checks each ' +
          'one against the live resume with deterministic guards and an independent review, and ' +
          'returns a verdict per proposal: approved, revision_required, rejected or ' +
          'needs_user_input. No proposal may be treated as verified until this has run.',
        inputSchema: z.object({
          focus: z
            .string()
            .optional()
            .describe('Anything you want looked at especially closely. Optional.'),
        }),
        buildInput: (_args, trusted) => {
          // The proposals come off the blackboard, filed under the agent that
          // produced them. The model cannot substitute a different set.
          const rewrite = trusted.shared?.getFrom<RewriteAgentOutput>(
            'resume-rewrite',
            SHARED_PROPOSALS_KEY
          );

          return {
            resumeId: trusted.resumeId ?? '',
            proposals: rewrite?.proposals ?? [],
            revisionRound: rewrite?.revisionRound ?? 0,
          };
        },
        budget: VERIFICATION_AGENT_BUDGET,
        publishAs: SHARED_VERDICTS_KEY,
        summarize: (output, run) => ({
          _agent: 'resume-verification',
          _runId: run.id,
          revisionRound: output.revisionRound,
          approvedCount: output.approvedCount,
          revisionRequiredCount: output.revisionRequiredCount,
          rejectedCount: output.rejectedCount,
          needsUserInputCount: output.needsUserInputCount,
          verdicts: output.verdicts.map((verdict) => ({
            proposalId: verdict.proposalId,
            status: verdict.status,
            reason: verdict.reason,
            requiredRevisions: verdict.requiredRevisions,
            decidedBy: verdict.decidedBy,
          })),
          summary: output.summary,
          next:
            'Only proposals with status "approved" are verified. Delegate the rewrite ' +
            'specialist again if and only if something is revision_required.',
        }),
      }),
      DELEGATION_CALL_LIMITS.delegate_verification
    )
  )
);

// ============================================================================
// RESULT TOOL
// ============================================================================

const REWRITE_BASIS =
  'Every proposal below names a stable resume element and quotes that element’s current text. ' +
  'None has been applied: the resume is exactly as the user left it, and an approved proposal ' +
  'is a suggestion awaiting their decision, not a change.';

/** Pair each proposal with its verdict, in code, by id. */
function reviewProposals(
  rewrite: RewriteAgentOutput | undefined,
  verification: VerificationAgentOutput | undefined
) {
  const verdicts = new Map(
    (verification?.verdicts ?? []).map((verdict) => [verdict.proposalId, verdict])
  );

  return (rewrite?.proposals ?? []).map((proposal) => {
    const verdict = verdicts.get(proposal.proposalId);
    return {
      ...proposal,
      ...(verdict ? { verification: verdict } : {}),
      // The only place `verified` is set, and it is set from the verdict, not
      // from anything the orchestrator's model said about it.
      verified: verdict?.status === 'approved',
    };
  });
}

export const submitOrchestratedReportTool = defineTool({
  name: 'submit_orchestrated_report',
  description:
    'Finish the run and return the combined report. Call this once the specialists you needed ' +
    'have returned. Their findings, the edit proposals and the verification verdicts are filled ' +
    'in from what they produced — you supply only the summary, the combined recommendations ' +
    'and any limitations.',
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
    const rewriteRequested = rewriteAuthorized(ctx.meta);

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
    const rewrite = ctx.shared?.getFrom<RewriteAgentOutput>('resume-rewrite', SHARED_PROPOSALS_KEY);
    const verification = ctx.shared?.getFrom<VerificationAgentOutput>(
      'resume-verification',
      SHARED_VERDICTS_KEY
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
      ...(rewrite ? ['resume-rewrite'] : []),
      ...(verification ? ['resume-verification'] : []),
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

    // ── The rewrite block, assembled from what actually happened ──
    let rewriteOutcome: z.infer<typeof rewriteOutcomeSchema> | undefined;

    if (rewriteRequested) {
      const reviewed = reviewProposals(rewrite, verification);
      const statusCount = (status: string) =>
        reviewed.filter((proposal) => proposal.verification?.status === status).length;
      const unverifiedCount = reviewed.filter((proposal) => !proposal.verification).length;
      const revisionAttempts = Math.max(0, delegationCalls(ctx, 'delegate_rewrite') - 1);

      let status: z.infer<typeof rewriteOutcomeSchema>['status'];
      if (!rewrite || reviewed.length === 0) {
        status = 'failed';
      } else if (!verification || unverifiedCount === reviewed.length) {
        status = 'unverified';
      } else if (statusCount('revision_required') > 0 || unverifiedCount > 0) {
        status = 'incomplete';
      } else {
        status = 'complete';
      }

      rewriteOutcome = {
        status,
        revisionAttempts,
        revisionLimit: MAX_REWRITE_REVISIONS,
        proposals: reviewed,
        verifiedCount: statusCount('approved'),
        rejectedCount: statusCount('rejected'),
        revisionRequiredCount: statusCount('revision_required'),
        needsUserInputCount: statusCount('needs_user_input'),
        unverifiedCount,
        openQuestions: [
          ...new Set([
            ...(rewrite?.openQuestions ?? []),
            ...reviewed.flatMap((proposal) =>
              proposal.verification?.status === 'needs_user_input'
                ? proposal.verification.questionableClaims
                : []
            ),
          ]),
        ],
        basis: REWRITE_BASIS,
      };

      if (status === 'failed') {
        notes.push(
          'Rewriting was requested but no proposals survived the checks, so nothing is offered ' +
            'here. Nothing was changed.'
        );
      }
      if (status === 'unverified') {
        notes.push(
          'Rewrite proposals were produced but verification did not return verdicts for them, ' +
            'so none of them is verified and none should be applied.'
        );
      }
      if (status === 'incomplete') {
        notes.push(
          `Verification still wanted revisions after ${revisionAttempts} of ` +
            `${MAX_REWRITE_REVISIONS} permitted attempts, so some proposals are returned ` +
            'unapproved rather than being approved unverified.'
        );
      }
    } else if (input?.rewrite) {
      notes.push('Rewriting was not authorised for this run, so no edits were proposed.');
    }

    const executionStatus =
      notes.length === 0 && (!rewriteRequested || rewriteOutcome?.status === 'complete')
        ? 'complete'
        : 'partial';

    return {
      resumeId: input?.resumeId ?? '',
      mode,
      rewriteRequested,
      summary,
      recommendations,
      agentsUsed,
      ...(evaluation ? { evaluation } : {}),
      ...(matching ? { matching } : {}),
      ...(rewriteOutcome ? { rewrite: rewriteOutcome } : {}),
      limitations: notes,
      executionStatus,
    };
  },
});

// ============================================================================
// AGENT DEFINITION
// ============================================================================

const INSTRUCTIONS = [
  'You are the Follio Resume Orchestrator. You do not analyse or rewrite resumes yourself. You',
  'decide which specialist agents to run, read what they return, and combine their findings',
  'into one report. Nothing you or they do changes the resume.',
  '',
  'Your specialists:',
  '- delegate_evaluation → the Resume Evaluation Agent. How well the resume is *written*:',
  '  empty sections, thin bullets, missing measurable results, vague phrasing.',
  '- delegate_matching → the JD / Role Matching Agent. How well the resume *matches* the job',
  '  description or target role supplied for this run. Only works when one was supplied.',
  '- delegate_rewrite → the Resume Rewrite Agent. Proposes stronger wording for specific',
  '  elements. Only works when the user asked for rewrites, and only after an analysis ran.',
  '- delegate_verification → the Resume Verification Agent. Independently checks the proposals',
  '  against the resume. Only works once proposals exist.',
  '',
  'Rules:',
  '1. Never invent a finding, a score, a keyword, a count or a rewrite. Everything factual in',
  '   your report comes from a specialist. If no specialist ran, you have nothing to report.',
  '2. Never restate a specialist’s numbers or proposals as your own — they are filled in for you.',
  '3. A keyword missing from a resume means it is not written there, not that the user lacks',
  '   the experience. Never say or imply otherwise.',
  '4. Do not delegate the same specialist twice for the same question. If one refuses, record',
  '   that in limitations rather than retrying it.',
  '5. Recommend changes to the resume text, never claims about the user.',
  '6. A proposal is verified only when the Verification Agent approved it. Never describe an',
  '   unverified, rejected or revision_required proposal as ready, approved or safe.',
  '',
  'How to decide the analysis:',
  '- General review: delegate_evaluation. That is usually all you need.',
  '- Job description: delegate_matching first. Then look at what came back. If the score is',
  '  weak or fair, or many keywords are absent, the writing may be the real problem — delegate',
  '  _evaluation as well and combine both. If the match is strong and little is missing, do not',
  '  spend a second specialist; report what you have.',
  '- Target role: delegate_matching first. If competency coverage is thin or several',
  '  competencies have no evidence, delegate_evaluation as well to see whether the resume is',
  '  simply underwritten. If coverage is broad, report what you have.',
  '',
  'How to decide the rewrite:',
  '- Only when the task says rewriting was requested. An analysis request is not permission to',
  '  rewrite, and delegate_rewrite will refuse on a run that was not authorised.',
  '- Run the analysis first. The rewrite specialist grounds itself in those findings, and it',
  '  will refuse before any have been produced.',
  '- Then delegate_rewrite, then delegate_verification. Read the verdicts.',
  '- If nothing is revision_required, stop: report what the verifier approved, rejected and',
  '  sent to the user.',
  '- If something is revision_required, delegate_rewrite again — the verifier’s feedback is',
  '  passed to it for you — and then delegate_verification again. Never present a revised',
  '  proposal that has not been verified again.',
  `- You get at most ${MAX_REWRITE_REVISIONS} revision rounds. When they are spent, report the`,
  '  proposals as they stand. Returning an unapproved proposal honestly is the correct outcome;',
  '  describing it as verified is not.',
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
    input.rewrite
      ? 'Rewriting WAS requested for this run. After the analysis, propose edits and have them ' +
          'verified before you report them.'
      : 'Rewriting was NOT requested for this run. Report the analysis only; do not propose edits.'
  );

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
  version: 'resume-orchestrator-v2',
  // Choosing specialists from intermediate results is the judgement task this
  // whole phase exists for, so it runs on the heavy model.
  taskType: 'strategy',
  instructions: INSTRUCTIONS,
  buildUserMessage: (input) => buildUserMessage(input),
  tools: [
    delegateEvaluationTool,
    delegateMatchingTool,
    delegateRewriteTool,
    delegateVerificationTool,
    submitOrchestratedReportTool,
  ],
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
 * The budget for a run that may rewrite.
 *
 * A full rewrite flow is analysis → rewrite → verify → rewrite → verify →
 * report, which does not fit in the analysis-only budget. It is a separate
 * constant rather than a raised one so an analysis request keeps exactly the
 * ceiling it had before Phase 3A.
 */
export const REWRITE_ORCHESTRATOR_BUDGET = {
  maxSteps: 18,
  // Below the route's `maxDuration = 300`, so this fires first and the user
  // gets the agent's own budget message rather than an opaque platform
  // timeout. The measured worst case across live runs is 57s.
  maxDurationMs: 270_000,
  maxTokens: 160_000,
} as const;

/**
 * Tree-wide ceilings for one orchestrated analysis request. Unchanged from
 * Phase 2B.
 *
 * `maxDepth: 1` is the important one: the orchestrator may delegate to a
 * specialist, and a specialist may not delegate at all. No specialist
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

/**
 * Tree-wide ceilings for a request that may rewrite.
 *
 * Wider, because the rewrite loop legitimately needs more child runs:
 * evaluation and matching, then up to three rewrite rounds each followed by a
 * verification. `maxCallsPerTool` rises to match, which on its own would also
 * hand the analysis specialists extra runs — that is why each delegation tool
 * additionally carries its own per-run cap (`DELEGATION_CALL_LIMITS`). The
 * analysis-only path keeps the narrower ceilings above, so nothing about an
 * evaluation request is loosened to make room for rewriting.
 */
export const REWRITE_DELEGATION_LIMITS = {
  maxDepth: 1,
  maxChildRuns: 10,
  maxCallsPerTool: 1 + MAX_REWRITE_REVISIONS,
  maxTotalTokens: 400_000,
  /**
   * Below the route's `maxDuration = 300`, with margin to serialise a reply.
   *
   * It was 360_000, which is longer than the route deadline — so this ceiling
   * could never fire first and the clean "this request ran too long" path was
   * unreachable on the rewrite route. The platform killed the function
   * mid-run instead, which looks to the user like a crash rather than a
   * limit. Measured worst case across the live runs is 57s, so the headroom
   * here is still roughly fourfold.
   */
  maxTotalDurationMs: 270_000,
} as const;

// ============================================================================
// ENTRY POINT
// ============================================================================

/**
 * Run the orchestrated, multi-agent resume analysis for one authenticated user.
 *
 * `auth` comes from the session at the API boundary — never from a request
 * body and never from a model. The pinned resume, the job description, the
 * target role and the rewrite authorisation are validated here and placed in
 * `meta`, where only tools can read them; they are inherited unchanged by
 * every delegated child.
 *
 * Phase 3A changes nothing for a caller that does not pass `rewrite: true`.
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

  const rewrite = input.rewrite === true;

  return runAgent(
    resumeOrchestratorAgent,
    { ...input, resumeId, mode, rewrite },
    {
      ...ctx,
      // Spread last so a caller cannot slip a different userId in through ctx.
      userId,
      meta: {
        ...ctx.meta,
        [SELECTED_RESUME_META_KEY]: resumeId,
        ...(jobDescription ? { [JOB_DESCRIPTION_META_KEY]: jobDescription } : {}),
        ...(role ? { [TARGET_ROLE_META_KEY]: role.id } : {}),
        // Only ever true because the caller asked for it here.
        ...(rewrite ? { [REWRITE_REQUESTED_META_KEY]: true } : {}),
      },
      budget: {
        ...(rewrite ? REWRITE_ORCHESTRATOR_BUDGET : ORCHESTRATOR_BUDGET),
        ...ctx.budget,
      },
      // Starting the delegation ledger here is what makes delegation legal at
      // all: `agentAsTool` refuses outright on a run without one.
      delegation:
        ctx.delegation ??
        createDelegationState(rewrite ? REWRITE_DELEGATION_LIMITS : ORCHESTRATOR_DELEGATION_LIMITS),
    }
  );
}
