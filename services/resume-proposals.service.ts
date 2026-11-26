/**
 * Persisting, reviewing and applying rewrite proposals.
 *
 * This module is the boundary between the agents and the user's resume, and
 * it is the only place in Phase 3B that writes resume text. The agents have
 * no database write tool and never did; a proposal reaches a resume only by
 * passing through `applyProposal` below, after a person asked for it twice.
 *
 * Four properties, each enforced here rather than assumed:
 *
 *   1. **Persisting is not approving.** A batch is a record of what an agent
 *      produced. Only a proposal the Verification Agent approved is even
 *      offered for review; everything else is stored `UNAVAILABLE` with the
 *      reason, so a rejected or unverified rewrite has no state it can reach
 *      that would let it be applied.
 *   2. **Verification is server-derived.** `verificationStatus` is copied from
 *      a validated agent output on this server. No request body contributes
 *      to it, and the routes' schemas do not accept a field that could.
 *   3. **Replacement text is never taken from a request.** `applyProposal`
 *      takes an id and nothing else. The text written is the stored
 *      `proposedText` the verifier saw.
 *   4. **An apply is a compare-and-swap, not a read-modify-write.** See
 *      lib/resume-proposals/apply-target.ts. There is no window in which a
 *      concurrent edit can be lost, because the condition and the write are
 *      one statement.
 */

import { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { interactiveTransactionOptions } from '@/lib/db-transaction';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  buildApplyStatement,
  readCurrentValue,
  resolveApplyTarget,
} from '@/lib/resume-proposals/apply-target';
import {
  batchStatusFromRun,
  initialState,
  staleCheckApplies,
  transition,
  unavailableReason,
  verificationStatusFromVerdict,
  type UserAction,
} from '@/lib/resume-proposals/state';
import { parseTargetRef } from '@/lib/resume-rewrite';

import type { OrchestratorOutput } from '@/services/agents/resume/orchestrator.agent';
import type { ProposalState, ResumeEditProposal, ResumeProposalBatch } from '@prisma/client';

const proposalLogger = logger.child({ source: 'resume-proposals' });

/** How many batches a list returns. A reviewer wants the recent ones. */
const MAX_BATCHES_LISTED = 20;

// ============================================================================
// SERIALIZATION
// ============================================================================

/** One proposal as the API returns it. */
export interface SerializedProposal {
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
  /** What the Verification Agent concluded. Never settable by a client. */
  verificationStatus: string;
  verificationReason: string;
  deterministicIssues: unknown;
  revisionRound: number;
  /** What the user said. Separate from the verdict above, on purpose. */
  decision: string;
  state: ProposalState;
  stateReason: string | null;
  /**
   * Whether the resume still reads the way this proposal expects. Computed on
   * read and not persisted: a GET never writes.
   */
  stale: boolean;
  staleDetail: string | null;
  /** Both conditions met and the target still matches. */
  applicable: boolean;
  createdAt: string;
  decidedAt: string | null;
  appliedAt: string | null;
}

export interface SerializedBatch {
  id: string;
  resumeId: string;
  mode: string;
  status: string;
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

/** A human-readable location, rebuilt from the stored target. */
function labelFor(proposal: ResumeEditProposal): string {
  const position = proposal.arrayIndex === null ? '' : ` #${proposal.arrayIndex + 1}`;
  return `${proposal.section} · ${proposal.fieldName}${position}`;
}

function serializeBatch(
  batch: ResumeProposalBatch,
  proposals: SerializedProposal[]
): SerializedBatch {
  const count = (state: ProposalState) =>
    proposals.filter((proposal) => proposal.state === state).length;

  return {
    id: batch.id,
    resumeId: batch.profileId,
    mode: batch.mode,
    status: batch.status,
    rootRunId: batch.rootRunId,
    summary: batch.summary,
    openQuestions: batch.openQuestions,
    limitations: batch.limitations,
    revisionAttempts: batch.revisionAttempts,
    counts: {
      total: proposals.length,
      pendingReview: count('PENDING_REVIEW'),
      approved: count('APPROVED'),
      rejected: count('REJECTED'),
      applied: count('APPLIED'),
      unavailable: count('UNAVAILABLE'),
      stale: proposals.filter((proposal) => proposal.stale).length,
    },
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}

// ============================================================================
// STALENESS (read-only)
// ============================================================================

interface ResumeSnapshot {
  profile: { id: string; summary: string | null };
  experiences: Array<{ id: string; bullets: string[] }>;
  projects: Array<{ id: string; description: string | null; highlights: string[] }>;
}

/** Load just enough of the resume to tell whether each target still matches. */
async function loadResumeSnapshot(resumeId: string): Promise<ResumeSnapshot | null> {
  const profile = await db.profile.findUnique({
    where: { id: resumeId },
    select: {
      id: true,
      summary: true,
      workExperiences: { select: { id: true, bullets: true } },
      projects: { select: { id: true, description: true, highlights: true } },
    },
  });

  if (!profile) return null;

  return {
    profile: { id: profile.id, summary: profile.summary },
    experiences: profile.workExperiences,
    projects: profile.projects,
  };
}

/** Is this proposal's target still the text the user reviewed? */
function evaluateStaleness(
  proposal: ResumeEditProposal,
  snapshot: ResumeSnapshot | null
): { stale: boolean; detail: string | null } {
  if (!snapshot || !staleCheckApplies(proposal.state)) {
    return { stale: false, detail: null };
  }

  const resolution = resolveApplyTarget(proposal.targetRef);
  if (!resolution.ok) {
    return { stale: true, detail: resolution.reason };
  }

  const current = readCurrentValue(resolution.resolved, snapshot);
  if (!current.ok) {
    return { stale: true, detail: current.detail };
  }

  if (current.text !== proposal.originalText) {
    return {
      stale: true,
      detail: 'This part of your resume changed after the suggestion was written.',
    };
  }

  return { stale: false, detail: null };
}

function serializeProposal(
  proposal: ResumeEditProposal,
  snapshot: ResumeSnapshot | null
): SerializedProposal {
  const { stale, detail } = evaluateStaleness(proposal, snapshot);

  return {
    id: proposal.id,
    batchId: proposal.batchId,
    agentProposalId: proposal.agentProposalId,
    targetRef: proposal.targetRef,
    section: proposal.section,
    targetRecordId: proposal.targetRecordId,
    fieldName: proposal.fieldName,
    arrayIndex: proposal.arrayIndex,
    label: labelFor(proposal),
    originalText: proposal.originalText,
    proposedText: proposal.proposedText,
    explanation: proposal.explanation,
    sourceEvidence: proposal.sourceEvidence,
    keywordsAddressed: proposal.keywordsAddressed,
    uncertainties: proposal.uncertainties,
    verificationStatus: proposal.verificationStatus,
    verificationReason: proposal.verificationReason,
    deterministicIssues: proposal.deterministicIssues,
    revisionRound: proposal.revisionRound,
    decision: proposal.decision,
    state: proposal.state,
    stateReason: proposal.stateReason,
    stale,
    staleDetail: detail,
    applicable:
      proposal.verificationStatus === 'APPROVED' &&
      proposal.decision === 'APPROVED' &&
      proposal.state === 'APPROVED' &&
      !stale,
    createdAt: proposal.createdAt.toISOString(),
    decidedAt: proposal.decidedAt?.toISOString() ?? null,
    appliedAt: proposal.appliedAt?.toISOString() ?? null,
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/** The shape `persistProposalBatch` needs out of an orchestrator run. */
type RewriteBlock = NonNullable<OrchestratorOutput['rewrite']>;
type RewriteProposal = RewriteBlock['proposals'][number];

export interface PersistBatchInput {
  userId: string;
  resumeId: string;
  output: OrchestratorOutput;
  /** Root AgentRun id for the execution. Provenance, not authorization. */
  rootRunId?: string;
  /** Caller-supplied retry key, scoped to this resume. */
  idempotencyKey?: string;
}

/**
 * Store one authorized rewrite run.
 *
 * Everything written here is read off the orchestrator's **validated** output,
 * which was produced on this server. The one thing a caller contributes is the
 * idempotency key.
 *
 * A run that produced no rewrite block still records a batch, with status
 * `FAILED` and no proposals. That is deliberate: "we spent your rate-limit
 * slot and found nothing" is a fact the user is entitled to see, and a silent
 * absence looks identical to a bug.
 */
export async function persistProposalBatch(
  input: PersistBatchInput
): Promise<{ batch: SerializedBatch; proposals: SerializedProposal[] }> {
  const { userId, resumeId, output, rootRunId, idempotencyKey } = input;
  const rewrite = output.rewrite;

  const created = await db.$transaction(async (tx) => {
    const batch = await tx.resumeProposalBatch.create({
      data: {
        userId,
        profileId: resumeId,
        mode: output.mode,
        status: batchStatusFromRun(rewrite?.status),
        rootRunId: rootRunId ?? null,
        idempotencyKey: idempotencyKey ?? null,
        summary: output.summary ?? '',
        openQuestions: rewrite?.openQuestions ?? [],
        limitations: output.limitations ?? [],
        revisionAttempts: rewrite?.revisionAttempts ?? 0,
      },
    });

    for (const proposal of rewrite?.proposals ?? []) {
      const row = toProposalRow(proposal, { batchId: batch.id, userId, resumeId });
      if (!row) continue;
      // Created one at a time rather than with createMany so a malformed
      // target in one proposal cannot silently drop the whole batch.
      await tx.resumeEditProposal.create({ data: row });
    }

    return batch.id;
  }, interactiveTransactionOptions);

  proposalLogger.info('Persisted rewrite proposal batch', {
    userId,
    resumeId,
    batchId: created,
    status: batchStatusFromRun(rewrite?.status),
    proposalCount: rewrite?.proposals.length ?? 0,
  });

  return loadBatch(userId, resumeId, created);
}

/** Translate one validated agent proposal into a row. */
function toProposalRow(
  proposal: RewriteProposal,
  owner: { batchId: string; userId: string; resumeId: string }
): Prisma.ResumeEditProposalUncheckedCreateInput | null {
  // Re-parsed rather than trusted: the agent's own `target` object and its
  // `targetRef` string must agree, and only a ref this server can parse is
  // storable. A proposal that fails here could never be applied anyway, so
  // storing it would only create something that looks actionable and is not.
  const parsed = parseTargetRef(proposal.targetRef);
  if (!parsed) return null;
  if (
    parsed.section !== proposal.target.section ||
    parsed.recordId !== proposal.target.recordId ||
    parsed.field !== proposal.target.field
  ) {
    return null;
  }

  const verificationStatus = verificationStatusFromVerdict(proposal.verification?.status);
  const state = initialState(verificationStatus);

  return {
    batchId: owner.batchId,
    userId: owner.userId,
    profileId: owner.resumeId,
    agentProposalId: proposal.proposalId,
    agentRunId: null,
    targetRef: proposal.targetRef,
    section: parsed.section,
    targetRecordId: parsed.recordId,
    fieldName: parsed.field,
    arrayIndex: parsed.index ?? null,
    originalText: proposal.originalText,
    proposedText: proposal.proposedText,
    explanation: proposal.explanation ?? '',
    sourceEvidence: proposal.sourceEvidence ?? [],
    keywordsAddressed: proposal.keywordsAddressed ?? [],
    uncertainties: proposal.uncertainties ?? [],
    verificationStatus,
    verificationReason: proposal.verification?.reason ?? '',
    deterministicIssues: (proposal.deterministicIssues ?? []) as Prisma.InputJsonValue,
    revisionRound: proposal.revisionRound ?? 0,
    decision: 'NONE',
    state,
    stateReason: state === 'UNAVAILABLE' ? unavailableReason(verificationStatus) : null,
  };
}

/** A batch already stored under this key, when the caller is retrying. */
export async function findBatchByIdempotencyKey(
  userId: string,
  resumeId: string,
  idempotencyKey: string
): Promise<{ batch: SerializedBatch; proposals: SerializedProposal[] } | null> {
  const existing = await db.resumeProposalBatch.findFirst({
    where: { userId, profileId: resumeId, idempotencyKey },
    select: { id: true },
  });
  if (!existing) return null;
  return loadBatch(userId, resumeId, existing.id);
}

// ============================================================================
// READS
// ============================================================================

/**
 * Ownership is the `where` clause on every read in this module, never a check
 * after the fact, and "not yours" and "does not exist" return the same 404 —
 * so these endpoints cannot be used to discover that another user's batch
 * exists.
 */
export async function listProposalBatches(
  userId: string,
  resumeId: string
): Promise<SerializedBatch[]> {
  const batches = await db.resumeProposalBatch.findMany({
    where: { userId, profileId: resumeId },
    orderBy: { createdAt: 'desc' },
    take: MAX_BATCHES_LISTED,
    include: { proposals: true },
  });

  const snapshot = batches.length > 0 ? await loadResumeSnapshot(resumeId) : null;

  return batches.map((batch) =>
    serializeBatch(
      batch,
      batch.proposals.map((proposal) => serializeProposal(proposal, snapshot))
    )
  );
}

export async function loadBatch(
  userId: string,
  resumeId: string,
  batchId: string
): Promise<{ batch: SerializedBatch; proposals: SerializedProposal[] }> {
  const batch = await db.resumeProposalBatch.findFirst({
    where: { id: batchId, userId, profileId: resumeId },
    include: { proposals: { orderBy: { createdAt: 'asc' } } },
  });

  if (!batch) throw Errors.notFound('Proposal batch');

  const snapshot = await loadResumeSnapshot(resumeId);
  const proposals = batch.proposals.map((proposal) => serializeProposal(proposal, snapshot));

  return { batch: serializeBatch(batch, proposals), proposals };
}

export async function loadProposal(
  userId: string,
  resumeId: string,
  batchId: string,
  proposalId: string
): Promise<SerializedProposal> {
  const proposal = await db.resumeEditProposal.findFirst({
    where: { id: proposalId, batchId, userId, profileId: resumeId },
  });

  if (!proposal) throw Errors.notFound('Proposal');

  const snapshot = await loadResumeSnapshot(resumeId);
  return serializeProposal(proposal, snapshot);
}

// ============================================================================
// DECISIONS
// ============================================================================

/**
 * Record what the user decided. Writes to the proposal only.
 *
 * Nothing in this function touches resume data, which is the reason approve
 * and apply are separate calls: deciding is cheap, reversible and safe, and
 * the only irreversible operation is the one that has to be asked for by
 * name.
 */
export async function decideProposal(
  userId: string,
  resumeId: string,
  batchId: string,
  proposalId: string,
  action: Extract<UserAction, 'approve' | 'reject'>
): Promise<SerializedProposal> {
  const proposal = await db.resumeEditProposal.findFirst({
    where: { id: proposalId, batchId, userId, profileId: resumeId },
  });

  if (!proposal) throw Errors.notFound('Proposal');

  const next = transition(
    {
      state: proposal.state,
      decision: proposal.decision,
      verificationStatus: proposal.verificationStatus,
    },
    action
  );

  if (!next.ok) {
    throw next.code === 'not_verified'
      ? Errors.forbidden(next.reason)
      : Errors.conflict(next.reason, { state: proposal.state });
  }

  // Conditional on the state we read, so two concurrent decisions cannot
  // interleave into a state neither asked for.
  const updated = await db.resumeEditProposal.updateMany({
    where: { id: proposal.id, userId, profileId: resumeId, state: proposal.state },
    data: { state: next.state, decision: next.decision, decidedAt: new Date() },
  });

  if (updated.count !== 1) {
    throw Errors.conflict('This suggestion changed while you were deciding. Reload and retry.');
  }

  return loadProposal(userId, resumeId, batchId, proposalId);
}

// ============================================================================
// APPLY
// ============================================================================

export class StaleProposalError extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(detail);
    this.name = 'StaleProposalError';
    this.detail = detail;
  }
}

/**
 * Write one approved proposal to the resume.
 *
 * The order inside the transaction matters and is the whole design:
 *
 *   1. **Claim the proposal** with a conditional update that requires
 *      `verificationStatus = APPROVED`, `decision = APPROVED` and
 *      `state = APPROVED`, flipping it to `APPLIED`. Postgres takes a row
 *      lock for that update, so a second concurrent request blocks, then
 *      re-evaluates the condition against the committed row, finds `APPLIED`,
 *      and matches nothing. That single statement is what makes a duplicate
 *      apply impossible — not an application-level check that two requests
 *      could both pass.
 *   2. **Write the resume** with the compare-and-swap in
 *      lib/resume-proposals/apply-target.ts. One row affected means the text
 *      was still exactly what the user reviewed.
 *   3. **Anything else rolls both back.** A failed write cannot leave a
 *      proposal marked applied, and a claimed proposal cannot leave a half
 *      written resume.
 *
 * What this does **not** promise: it does not stop the Builder's ordinary
 * PATCH from overwriting the same bullet a moment later. Those endpoints are
 * last-write-wins and always were. What it guarantees is that this write never
 * silently discards someone else's — if the text moved, the swap matches zero
 * rows and the proposal is reported stale instead.
 */
export async function applyProposal(
  userId: string,
  resumeId: string,
  batchId: string,
  proposalId: string
): Promise<SerializedProposal> {
  const proposal = await db.resumeEditProposal.findFirst({
    where: { id: proposalId, batchId, userId, profileId: resumeId },
  });

  if (!proposal) throw Errors.notFound('Proposal');

  // Checked before the transaction so the refusal is specific, and checked
  // again inside it by the claiming update so the specific message is never
  // what actually guards the write.
  const next = transition(
    {
      state: proposal.state,
      decision: proposal.decision,
      verificationStatus: proposal.verificationStatus,
    },
    'apply'
  );

  if (!next.ok) {
    throw next.code === 'not_verified'
      ? Errors.forbidden(next.reason)
      : Errors.conflict(next.reason, { state: proposal.state });
  }

  const resolution = resolveApplyTarget(proposal.targetRef);
  if (!resolution.ok) {
    await markUnavailable(proposal.id, resolution.reason);
    throw Errors.conflict(resolution.reason, { state: 'UNAVAILABLE' });
  }

  try {
    await db.$transaction(async (tx) => {
      // 1. Claim. Every precondition is in the WHERE, so this is the gate.
      const claimed = await tx.resumeEditProposal.updateMany({
        where: {
          id: proposal.id,
          batchId,
          userId,
          profileId: resumeId,
          state: 'APPROVED',
          decision: 'APPROVED',
          verificationStatus: 'APPROVED',
        },
        data: { state: 'APPLIED', appliedAt: new Date() },
      });

      if (claimed.count !== 1) {
        throw Errors.conflict('This suggestion has already been applied or is no longer approved.');
      }

      // 2. Write, conditional on the text still being the reviewed text.
      const statement = buildApplyStatement({
        resolved: resolution.resolved,
        resumeId,
        recordId: proposal.targetRecordId,
        originalText: proposal.originalText,
        // Read from storage. The route never accepts replacement text.
        proposedText: proposal.proposedText,
      });

      const rowsAffected = await tx.$executeRaw(statement);

      if (rowsAffected !== 1) {
        // Rolls back the claim too, so the proposal is not left `APPLIED`
        // over a resume that was never changed.
        throw new StaleProposalError(
          'Your resume changed after this suggestion was written, so it was not applied.'
        );
      }
    }, interactiveTransactionOptions);
  } catch (error) {
    if (error instanceof StaleProposalError) {
      // Recorded outside the rolled-back transaction, conditional on the
      // state we expected, so a concurrent decision is not overwritten.
      await db.resumeEditProposal.updateMany({
        where: { id: proposal.id, userId, profileId: resumeId, state: 'APPROVED' },
        data: { state: 'STALE', stateReason: error.detail },
      });

      proposalLogger.info('Refused a stale rewrite proposal', {
        userId,
        resumeId,
        proposalId: proposal.id,
      });

      throw Errors.conflict(error.detail, { state: 'STALE', stale: true });
    }
    throw error;
  }

  proposalLogger.info('Applied a rewrite proposal', {
    userId,
    resumeId,
    batchId,
    proposalId: proposal.id,
    targetRef: proposal.targetRef,
  });

  return loadProposal(userId, resumeId, batchId, proposalId);
}

async function markUnavailable(proposalId: string, reason: string): Promise<void> {
  await db.resumeEditProposal.updateMany({
    where: { id: proposalId, state: { in: ['PENDING_REVIEW', 'APPROVED'] } },
    data: { state: 'UNAVAILABLE', stateReason: reason },
  });
}
