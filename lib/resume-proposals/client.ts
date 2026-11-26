/**
 * The client side of the rewrite-proposal API.
 *
 * Everything here is pure: request builders, response readers, and the rules
 * that decide which buttons a proposal may show. It is in `lib/` rather than
 * inside the dialog so the decisions that matter can be tested directly —
 * this repository has no DOM test environment, so logic left inside a
 * component is logic that is only checked by reading it.
 *
 * One rule shapes the whole module: **the server decides what is applicable.**
 * `canApply` reads the `applicable` boolean the service computed, not a
 * re-derivation of the state machine from the parts. The client may ask for
 * less than the server would allow; it must never ask for more. If this file
 * and the backend ever disagree, the backend refuses and the user sees a
 * conflict — which is the right failure, but the point is not to produce it.
 */

import type {
  ProposalBatchStatus,
  ProposalDecision,
  ProposalState,
  ProposalVerificationStatus,
} from '@prisma/client';

// ============================================================================
// WIRE TYPES
// ============================================================================

/**
 * Mirrors `ProposalState` in prisma/schema.prisma.
 *
 * Declared here rather than imported from `@prisma/client` so nothing in a
 * browser bundle has a path, even a type-only one, into the Prisma runtime.
 * `assertStatesMatchPrisma` below fails the typecheck if the two drift.
 */
export type ProposalStateName =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | 'STALE'
  | 'UNAVAILABLE';

export type VerificationStatusName =
  | 'APPROVED'
  | 'REVISION_REQUIRED'
  | 'REJECTED'
  | 'NEEDS_USER_INPUT'
  | 'UNVERIFIED';

export type DecisionName = 'NONE' | 'APPROVED' | 'REJECTED';

export type BatchStatusName = 'COMPLETE' | 'INCOMPLETE' | 'UNVERIFIED' | 'FAILED';

/** One proposal, exactly as `SerializedProposal` sends it. */
export interface ProposalView {
  id: string;
  batchId: string;
  agentProposalId: string;
  targetRef: string;
  section: string;
  targetRecordId: string;
  fieldName: string;
  arrayIndex: number | null;
  label: string;
  originalText: string;
  proposedText: string;
  explanation: string;
  sourceEvidence: string[];
  keywordsAddressed: string[];
  uncertainties: string[];
  verificationStatus: VerificationStatusName;
  verificationReason: string;
  deterministicIssues: unknown;
  revisionRound: number;
  decision: DecisionName;
  state: ProposalStateName;
  stateReason: string | null;
  stale: boolean;
  staleDetail: string | null;
  /** The server's verdict on whether Apply would succeed right now. */
  applicable: boolean;
  createdAt: string;
  decidedAt: string | null;
  appliedAt: string | null;
}

/** One batch, exactly as `SerializedBatch` sends it. */
export interface BatchView {
  id: string;
  resumeId: string;
  mode: string;
  status: BatchStatusName;
  rootRunId: string | null;
  summary: string;
  openQuestions: string[];
  limitations: string[];
  revisionAttempts: number;
  counts: {
    total: number;
    pendingReview: number;
    approved: number;
    rejected: number;
    applied: number;
    unavailable: number;
    stale: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BatchWithProposals {
  batch: BatchView;
  proposals: ProposalView[];
}

// ============================================================================
// REQUESTS
// ============================================================================

export type RewriteMode = 'general' | 'jd' | 'role';

export interface GenerateRequestInput {
  mode: RewriteMode;
  jobDescription?: string;
  targetRole?: string;
  idempotencyKey: string;
}

/**
 * The exact body `POST /api/resumes/[id]/rewrite-proposals` accepts.
 *
 * That route's schema is `.strict()`, so an extra key is a 400 rather than
 * something quietly dropped. Building the body here — rather than spreading
 * whatever the dialog is holding — is what keeps a stray piece of UI state
 * from becoming a rejected request.
 */
export function buildGenerateRequest(input: GenerateRequestInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    mode: input.mode,
    idempotencyKey: input.idempotencyKey,
  };

  if (input.mode === 'jd') body.jobDescription = input.jobDescription ?? '';
  if (input.mode === 'role') body.targetRole = input.targetRole ?? '';

  return body;
}

/**
 * A key that makes a retry free.
 *
 * Minted once when the user presses Generate and reused for every retry of
 * *that* attempt, so a timeout followed by a retry returns the batch the first
 * call already paid for. A new key is minted only when the user deliberately
 * starts another generation — which is why this is a plain function the caller
 * decides when to invoke, not something derived from the request.
 */
export function createIdempotencyKey(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `rewrite-${random}`;
}

// ============================================================================
// PATHS
// ============================================================================

export const proposalPaths = {
  collection: (resumeId: string) => `/api/resumes/${resumeId}/rewrite-proposals`,
  batch: (resumeId: string, batchId: string) =>
    `/api/resumes/${resumeId}/rewrite-proposals/${batchId}`,
  proposal: (resumeId: string, batchId: string, proposalId: string) =>
    `/api/resumes/${resumeId}/rewrite-proposals/${batchId}/proposals/${proposalId}`,
  decision: (resumeId: string, batchId: string, proposalId: string) =>
    `/api/resumes/${resumeId}/rewrite-proposals/${batchId}/proposals/${proposalId}/decision`,
  apply: (resumeId: string, batchId: string, proposalId: string) =>
    `/api/resumes/${resumeId}/rewrite-proposals/${batchId}/proposals/${proposalId}/apply`,
};

// ============================================================================
// ERRORS
// ============================================================================

export interface ApiFailure {
  status: number;
  message: string;
  /** `error.details` from `handleApiError`, when the server sent any. */
  details: Record<string, unknown> | null;
  /** True for the structured conflicts the apply path produces. */
  isConflict: boolean;
  /** The state the server says the proposal is now in, from `details`. */
  state: ProposalStateName | null;
  stale: boolean;
}

const KNOWN_STATES: readonly string[] = [
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'STALE',
  'UNAVAILABLE',
];

/**
 * Read a failure body.
 *
 * Two shapes exist and both are real: the routes' own early returns send
 * `{ error: 'message' }`, while anything thrown through `handleApiError`
 * sends `{ success: false, error: { code, message, details } }`. Parsing the
 * structured one is what lets a stale conflict be handled by its `details.state`
 * rather than by matching words in a sentence.
 */
export function readApiFailure(status: number, body: unknown): ApiFailure {
  let message = 'Something went wrong. Try again.';
  let details: Record<string, unknown> | null = null;

  if (body && typeof body === 'object') {
    const payload = body as { error?: unknown };
    if (typeof payload.error === 'string') {
      message = payload.error;
    } else if (payload.error && typeof payload.error === 'object') {
      const structured = payload.error as { message?: unknown; details?: unknown };
      if (typeof structured.message === 'string') message = structured.message;
      if (structured.details && typeof structured.details === 'object') {
        details = structured.details as Record<string, unknown>;
      }
    }
  }

  const rawState = details?.state;
  const state =
    typeof rawState === 'string' && KNOWN_STATES.includes(rawState)
      ? (rawState as ProposalStateName)
      : null;

  return {
    status,
    message,
    details,
    isConflict: status === 409,
    state,
    stale: details?.stale === true || state === 'STALE',
  };
}

/** A sentence for the user. Never exposes a stack, a prompt or a run id. */
export function failureMessage(failure: ApiFailure): string {
  if (failure.status === 429) {
    return `${failure.message} You can review suggestions you already have in the meantime.`;
  }
  if (failure.status === 503) {
    return failure.message;
  }
  if (failure.status === 401 || failure.status === 404) {
    return 'That resume is not available. Reload the Builder and try again.';
  }
  return failure.message;
}

// ============================================================================
// WHAT A PROPOSAL MAY DO
// ============================================================================

/**
 * Whether Apply may be offered.
 *
 * Reads the server's own `applicable`, which already requires the AI verdict,
 * the human decision, the lifecycle state and a target that still matches.
 * Re-deriving it here would create a second implementation of the state
 * machine that could drift from the one that actually guards the write.
 */
export function canApply(proposal: ProposalView): boolean {
  return proposal.applicable === true;
}

/** Approve is offered while a decision can still change the outcome. */
export function canApprove(proposal: ProposalView): boolean {
  if (proposal.verificationStatus !== 'APPROVED') return false;
  return (
    proposal.state === 'PENDING_REVIEW' ||
    proposal.state === 'REJECTED' ||
    (proposal.state === 'APPROVED' && proposal.decision !== 'APPROVED')
  );
}

export function canReject(proposal: ProposalView): boolean {
  if (proposal.verificationStatus !== 'APPROVED') return false;
  return (
    proposal.state === 'PENDING_REVIEW' ||
    proposal.state === 'APPROVED' ||
    (proposal.state === 'REJECTED' && proposal.decision !== 'REJECTED')
  );
}

/** What to show in the status chip. */
export interface StatusBadge {
  label: string;
  tone: 'pending' | 'approved' | 'rejected' | 'applied' | 'blocked';
}

export function statusBadge(proposal: ProposalView): StatusBadge {
  if (proposal.state === 'APPLIED') return { label: 'Applied', tone: 'applied' };
  if (proposal.state === 'REJECTED') return { label: 'You rejected this', tone: 'rejected' };
  if (proposal.state === 'STALE') return { label: 'Out of date', tone: 'blocked' };
  if (proposal.state === 'UNAVAILABLE') return { label: 'Not available', tone: 'blocked' };
  if (proposal.stale) return { label: 'Out of date', tone: 'blocked' };
  if (proposal.state === 'APPROVED') return { label: 'You approved this', tone: 'approved' };
  return { label: 'Needs your review', tone: 'pending' };
}

/**
 * How the AI verdict is described, separately from the user's decision.
 *
 * Deliberately worded so "the checks passed" never reads as "this is ready":
 * an approved verdict still says the user has to decide. The two are different
 * facts and the interface has to say so, because the whole safety argument
 * rests on a person agreeing before anything is written.
 */
export function verificationSummary(proposal: ProposalView): {
  label: string;
  detail: string;
  needsUserApproval: boolean;
} {
  switch (proposal.verificationStatus) {
    case 'APPROVED':
      return {
        label: 'AI checks passed',
        detail:
          'Automated checks found nothing this resume does not support. That is not approval — ' +
          'it is still your call.',
        needsUserApproval: true,
      };
    case 'NEEDS_USER_INPUT':
      return {
        label: 'Needs something from you',
        detail:
          proposal.verificationReason ||
          'This rewrite needs information only you can give before it could be checked.',
        needsUserApproval: false,
      };
    case 'REVISION_REQUIRED':
      return {
        label: 'Not settled',
        detail:
          proposal.verificationReason ||
          'Verification asked for changes that were not resolved, so this cannot be applied.',
        needsUserApproval: false,
      };
    case 'REJECTED':
      return {
        label: 'Rejected by verification',
        detail:
          proposal.verificationReason ||
          'This rewrite asserts something your resume does not support.',
        needsUserApproval: false,
      };
    case 'UNVERIFIED':
    default:
      return {
        label: 'Never verified',
        detail:
          proposal.verificationReason ||
          'No independent check was completed for this rewrite, so it cannot be applied.',
        needsUserApproval: false,
      };
  }
}

/** Why Apply is unavailable, in words a user can act on. */
export function applyBlockedReason(proposal: ProposalView): string | null {
  if (canApply(proposal)) return null;
  if (proposal.state === 'APPLIED') return 'Already applied to your resume.';
  if (proposal.state === 'REJECTED') return 'You rejected this. Approve it to apply it.';
  if (proposal.stale || proposal.state === 'STALE') {
    return (
      proposal.staleDetail ??
      proposal.stateReason ??
      'Your resume changed after this suggestion was written.'
    );
  }
  if (proposal.verificationStatus !== 'APPROVED') {
    return proposal.stateReason ?? verificationSummary(proposal).detail;
  }
  if (proposal.decision !== 'APPROVED') return 'Approve this suggestion first.';
  return proposal.stateReason ?? 'This suggestion cannot be applied right now.';
}

/** Human location, preferring the server's label. */
export function proposalLocation(proposal: ProposalView): string {
  if (proposal.label && proposal.label !== proposal.targetRef) return proposal.label;
  const position = proposal.arrayIndex === null ? '' : ` ${proposal.arrayIndex + 1}`;
  return `${proposal.section} · ${proposal.fieldName}${position}`;
}

// ============================================================================
// ORDERING
// ============================================================================

/** Review order: what needs a decision first, settled things last. */
const STATE_ORDER: Record<ProposalStateName, number> = {
  PENDING_REVIEW: 0,
  APPROVED: 1,
  STALE: 2,
  REJECTED: 3,
  APPLIED: 4,
  UNAVAILABLE: 5,
};

export function sortForReview(proposals: ProposalView[]): ProposalView[] {
  return [...proposals].sort((a, b) => {
    const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (byState !== 0) return byState;
    return a.targetRef.localeCompare(b.targetRef);
  });
}

/** Replace one proposal in a list, keeping order. Used after every mutation. */
export function replaceProposal(proposals: ProposalView[], updated: ProposalView): ProposalView[] {
  return proposals.map((proposal) => (proposal.id === updated.id ? updated : proposal));
}

/** Recount a batch locally after a decision, so the header stays truthful. */
export function recountBatch(batch: BatchView, proposals: ProposalView[]): BatchView {
  const count = (state: ProposalStateName) =>
    proposals.filter((proposal) => proposal.state === state).length;

  return {
    ...batch,
    counts: {
      total: proposals.length,
      pendingReview: count('PENDING_REVIEW'),
      approved: count('APPROVED'),
      rejected: count('REJECTED'),
      applied: count('APPLIED'),
      unavailable: count('UNAVAILABLE'),
      stale: proposals.filter((proposal) => proposal.stale || proposal.state === 'STALE').length,
    },
  };
}

// ============================================================================
// DRIFT CHECK
// ============================================================================

/**
 * The string unions above are hand-written so no browser bundle has a path
 * into the Prisma runtime. These assignments are erased at compile time and
 * exist only to fail `tsc` the moment the schema and this file disagree —
 * which would otherwise show up as a status chip that silently never renders.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

export type _StatesMatchPrisma = Exact<ProposalStateName, ProposalState>;
export type _VerificationMatchesPrisma = Exact<VerificationStatusName, ProposalVerificationStatus>;
export type _DecisionMatchesPrisma = Exact<DecisionName, ProposalDecision>;
export type _BatchStatusMatchesPrisma = Exact<BatchStatusName, ProposalBatchStatus>;

const _assertSchemaAlignment: [
  _StatesMatchPrisma,
  _VerificationMatchesPrisma,
  _DecisionMatchesPrisma,
  _BatchStatusMatchesPrisma,
] = [true, true, true, true];
void _assertSchemaAlignment;
