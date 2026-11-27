/**
 * Tools for the Resume Verification Agent.
 *
 * Read-only. Nothing here writes to the database, and nothing here can change
 * a proposal — the verifier judges, it does not edit.
 *
 * `run_deterministic_checks` is the load-bearing one. It re-runs every guard
 * in lib/resume-rewrite against the **live** resume rather than against the
 * copy of the original text the proposal carries, so a proposal built from a
 * stale read, or hand-assembled by something other than the Rewrite Agent,
 * is caught here even though it was never put through `propose_rewrite`.
 *
 * Its results are stored in run memory and the result tool reads them back
 * from there. That is what makes the deterministic layer unbypassable: the
 * model's verdicts are merged with the stored findings in code, and the merge
 * only ever takes the stricter of the two.
 */

import { z } from 'zod';

import { defineTool } from '@/lib/agents/define-tool';
import {
  blockingIssues,
  checkProposalBatch,
  verdictFloorFromIssues,
  type ProposalDraft,
  type ProposalIssue,
  type ResumeForRewrite,
  type VerificationStatus,
} from '@/lib/resume-rewrite';

import { resumeFromMemory, unsupportedKeywordsFor } from './rewrite-tools';

import type { AgentToolContext } from '@/types/agents';

// ============================================================================
// MEMORY
// ============================================================================

/** The deterministic findings, keyed by proposal id. Written by the tool below. */
export const MEMORY_DETERMINISTIC_CHECKS = 'deterministicChecks';

/** One proposal's deterministic result, as stored and as returned. */
export interface DeterministicCheckResult {
  proposalId: string;
  targetRef: string;
  issues: ProposalIssue[];
  /** The strictest verdict these issues require. */
  verdictFloor: VerificationStatus;
}

/** The proposal shape the verifier receives. Structurally an `EditProposal`. */
export interface ProposalUnderReview extends ProposalDraft {
  label?: string;
  revisionRound?: number;
}

const resumeScopedInput = z.object({
  resumeId: z
    .string()
    .min(1)
    .describe('The id of the resume the user selected, exactly as given in the task.'),
});

function proposalsFromInput(ctx: AgentToolContext): ProposalUnderReview[] {
  const input = ctx.memory.get<{ proposals?: ProposalUnderReview[] }>('__input');
  return input?.proposals ?? [];
}

// ============================================================================
// get_proposals_to_verify
// ============================================================================

export const getProposalsToVerifyTool = defineTool({
  name: 'get_proposals_to_verify',
  description:
    'Read the edit proposals you were asked to verify: for each one, where it applies, the ' +
    'resume’s original text, the proposed replacement, the stated reason, the keywords it ' +
    'claims to address, the evidence it cites and anything its author flagged as uncertain.',
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const proposals = proposalsFromInput(ctx);

    if (proposals.length === 0) {
      return {
        proposals: [],
        error:
          'No proposals were handed to this run, so there is nothing to verify. Say so in your ' +
          'summary rather than inventing a verdict.',
      };
    }

    return {
      count: proposals.length,
      proposals: proposals.map((proposal) => ({
        proposalId: proposal.proposalId,
        targetRef: proposal.targetRef,
        label: proposal.label ?? proposal.targetRef,
        section: proposal.target.section,
        originalText: proposal.originalText,
        proposedText: proposal.proposedText,
        explanation: proposal.explanation,
        keywordsAddressed: proposal.keywordsAddressed ?? [],
        sourceEvidence: proposal.sourceEvidence ?? [],
        uncertainties: proposal.uncertainties ?? [],
        revisionRound: proposal.revisionRound ?? 0,
      })),
    };
  },
});

// ============================================================================
// run_deterministic_checks
// ============================================================================

export const runDeterministicChecksTool = defineTool({
  name: 'run_deterministic_checks',
  description:
    'Run Follio’s deterministic guards over every proposal against the live resume: does the ' +
    'target exist, does the original text match, and does the replacement introduce a figure, ' +
    'a company, a technology, a credential, a seniority, a management responsibility, or an ' +
    'outcome or benefit the resume does not establish — and does it drop one the original ' +
    'carried. Also finds duplicate and conflicting proposals. These findings are binding: your ' +
    'verdict can make one stricter but never softer. Call this before submitting.',
  inputSchema: resumeScopedInput,
  execute: async (_input, ctx) => {
    const lookup = resumeFromMemory(ctx);
    if (!lookup.ok) return { error: lookup.error };

    const proposals = proposalsFromInput(ctx);
    if (proposals.length === 0) {
      return { error: 'No proposals were handed to this run, so there is nothing to check.' };
    }

    // The live resume, not the text the proposal claims is there.
    const resume = lookup.resume as ResumeForRewrite;
    const byId = checkProposalBatch(proposals, {
      resume,
      unsupportedKeywords: unsupportedKeywordsFor(ctx, lookup.resume),
    });

    const results: DeterministicCheckResult[] = proposals.map((proposal) => {
      const issues = byId.get(proposal.proposalId) ?? [];
      return {
        proposalId: proposal.proposalId,
        targetRef: proposal.targetRef,
        issues,
        verdictFloor: verdictFloorFromIssues(issues),
      };
    });

    ctx.memory.set(MEMORY_DETERMINISTIC_CHECKS, results);

    return {
      checked: results.length,
      results: results.map((result) => ({
        proposalId: result.proposalId,
        targetRef: result.targetRef,
        verdictFloor: result.verdictFloor,
        issues: result.issues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          detail: issue.detail,
          ...(issue.evidence ? { evidence: issue.evidence } : {}),
        })),
      })),
      interpretation:
        'A verdictFloor is the least strict verdict a proposal may receive. "approved" here ' +
        'means only that no automated check objected — it is not an endorsement, and you must ' +
        'still judge whether the rewrite preserves the original meaning. Anything unsupported ' +
        'is unsupported *by this resume*; it is never evidence about the user.',
    };
  },
});

/** The stored findings, or an empty list when the tool never ran. */
export function deterministicChecksFromMemory(ctx: AgentToolContext): DeterministicCheckResult[] {
  return ctx.memory.get<DeterministicCheckResult[]>(MEMORY_DETERMINISTIC_CHECKS) ?? [];
}

/** Issue details a revision would have to address, as plain sentences. */
export function requiredRevisionsFrom(issues: ProposalIssue[]): string[] {
  return blockingIssues(issues).map((issue) => issue.detail);
}

/** Claims the checks could not support, as plain fragments. */
export function questionableClaimsFrom(issues: ProposalIssue[]): string[] {
  return issues
    .filter((issue) => issue.severity === 'blocking' || issue.severity === 'clarify')
    .map((issue) => issue.evidence ?? issue.detail);
}

export { proposalsFromInput };
