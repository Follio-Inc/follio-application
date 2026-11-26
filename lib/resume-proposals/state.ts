/**
 * The proposal lifecycle, as rules rather than as convention.
 *
 * Two independent judgements have to agree before a word of a resume changes:
 *
 *   - `verificationStatus` — what the Resume Verification Agent concluded.
 *     Copied from a validated agent run on the server; no request body can
 *     set it, and nothing here can raise it.
 *   - `decision` — what the person whose resume it is said.
 *
 * Keeping them in separate columns is the point. An agent approving a rewrite
 * is not a user accepting it, and collapsing the two into one "approved" flag
 * is exactly how an unreviewed suggestion ends up on somebody's resume.
 *
 * `state` is the lifecycle those two drive, and it is the only thing the apply
 * path reads. A proposal the verifier did not approve never enters
 * `PENDING_REVIEW` at all — it is born `UNAVAILABLE`, so "the verifier was
 * unsure" cannot drift into "the user may apply this" through a later bug.
 *
 * Pure: no Prisma, no I/O. The transitions are tested directly.
 */

import type {
  ProposalBatchStatus,
  ProposalDecision,
  ProposalState,
  ProposalVerificationStatus,
} from '@prisma/client';

/** The verdicts the Verification Agent can return, as it spells them. */
const AGENT_VERDICT_TO_STATUS: Record<string, ProposalVerificationStatus> = {
  approved: 'APPROVED',
  revision_required: 'REVISION_REQUIRED',
  rejected: 'REJECTED',
  needs_user_input: 'NEEDS_USER_INPUT',
};

/**
 * Translate an agent verdict into a stored status.
 *
 * Anything unrecognised — including a missing verdict, which is what a
 * proposal the verifier never ruled on has — becomes `UNVERIFIED`. That is
 * deliberately distinct from `REJECTED`: "nobody checked this" and "this was
 * checked and found wanting" are different facts, and only one of them means
 * the agent looked.
 */
export function verificationStatusFromVerdict(
  verdict: string | null | undefined
): ProposalVerificationStatus {
  if (!verdict) return 'UNVERIFIED';
  return AGENT_VERDICT_TO_STATUS[verdict] ?? 'UNVERIFIED';
}

/** Batch statuses, as the orchestrator spells them. */
const RUN_STATUS_TO_BATCH: Record<string, ProposalBatchStatus> = {
  complete: 'COMPLETE',
  incomplete: 'INCOMPLETE',
  unverified: 'UNVERIFIED',
  failed: 'FAILED',
};

export function batchStatusFromRun(status: string | null | undefined): ProposalBatchStatus {
  if (!status) return 'FAILED';
  return RUN_STATUS_TO_BATCH[status] ?? 'FAILED';
}

/**
 * Where a proposal starts life.
 *
 * The single rule that makes "persisting is not approving" true: only a
 * verifier-approved proposal is ever offered for review.
 */
export function initialState(verificationStatus: ProposalVerificationStatus): ProposalState {
  return verificationStatus === 'APPROVED' ? 'PENDING_REVIEW' : 'UNAVAILABLE';
}

/** Why a proposal is not reviewable, in words a user can act on. */
export function unavailableReason(verificationStatus: ProposalVerificationStatus): string | null {
  switch (verificationStatus) {
    case 'APPROVED':
      return null;
    case 'REJECTED':
      return 'Verification rejected this rewrite: it asserts something this resume does not support.';
    case 'REVISION_REQUIRED':
      return 'Verification asked for changes to this rewrite, and the revision limit was reached before it was settled.';
    case 'NEEDS_USER_INPUT':
      return 'This rewrite needs information only you can give before it could be checked.';
    case 'UNVERIFIED':
    default:
      return 'This rewrite was never independently verified, so it cannot be applied.';
  }
}

// ============================================================================
// TRANSITIONS
// ============================================================================

/** A decision a user may take on a proposal. */
export type UserAction = 'approve' | 'reject' | 'apply';

export interface ProposalFacts {
  state: ProposalState;
  decision: ProposalDecision;
  verificationStatus: ProposalVerificationStatus;
}

export type TransitionResult =
  | { ok: true; state: ProposalState; decision: ProposalDecision }
  | { ok: false; reason: string; code: 'not_verified' | 'bad_state' };

/**
 * Whether one action is legal, and what it produces.
 *
 * Approval and application are **two separate operations**, not one. The
 * reasons are practical: a user reviewing a batch wants to mark several
 * suggestions before writing any of them; "approved but not yet applied" is a
 * real state the interface needs to show; and keeping `apply` as its own call
 * means the only code path that writes to a resume is small enough to read in
 * one sitting. The cost is one extra round trip, which is the right trade for
 * the thing that edits somebody's resume.
 */
export function transition(facts: ProposalFacts, action: UserAction): TransitionResult {
  // Nothing the verifier did not approve can be acted on at all, whatever
  // state it somehow reached. Checked first so the message is about the real
  // reason rather than about the state it left behind.
  if (facts.verificationStatus !== 'APPROVED') {
    return {
      ok: false,
      code: 'not_verified',
      reason:
        unavailableReason(facts.verificationStatus) ??
        'This rewrite has not been verified, so it cannot be applied.',
    };
  }

  switch (action) {
    case 'approve':
      if (facts.state === 'PENDING_REVIEW' || facts.state === 'REJECTED') {
        return { ok: true, state: 'APPROVED', decision: 'APPROVED' };
      }
      if (facts.state === 'APPROVED') {
        // Idempotent: approving twice is not an error, it is a no-op.
        return { ok: true, state: 'APPROVED', decision: 'APPROVED' };
      }
      return {
        ok: false,
        code: 'bad_state',
        reason:
          facts.state === 'APPLIED'
            ? 'This suggestion has already been applied to your resume.'
            : 'This suggestion is no longer reviewable.',
      };

    case 'reject':
      if (
        facts.state === 'PENDING_REVIEW' ||
        facts.state === 'APPROVED' ||
        facts.state === 'REJECTED'
      ) {
        return { ok: true, state: 'REJECTED', decision: 'REJECTED' };
      }
      return {
        ok: false,
        code: 'bad_state',
        reason:
          facts.state === 'APPLIED'
            ? 'This suggestion has already been applied and cannot be rejected.'
            : 'This suggestion is no longer reviewable.',
      };

    case 'apply':
      if (facts.state !== 'APPROVED' || facts.decision !== 'APPROVED') {
        return {
          ok: false,
          code: 'bad_state',
          reason:
            facts.state === 'APPLIED'
              ? 'This suggestion has already been applied to your resume.'
              : facts.state === 'REJECTED'
                ? 'This suggestion was rejected. Approve it first if you changed your mind.'
                : facts.state === 'STALE'
                  ? 'Your resume changed since this suggestion was written, so it no longer applies.'
                  : 'Approve this suggestion before applying it.',
        };
      }
      return { ok: true, state: 'APPLIED', decision: 'APPROVED' };
  }
}

/** States from which a proposal could still reach the resume. */
export const LIVE_STATES: readonly ProposalState[] = ['PENDING_REVIEW', 'APPROVED'];

/** Is this proposal in a state where staleness is worth reporting? */
export function staleCheckApplies(state: ProposalState): boolean {
  return LIVE_STATES.includes(state);
}
