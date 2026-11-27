/**
 * Phase 3B.1 — persistence, approval and safe application.
 *
 * The service runs against `__tests__/utils/fake-proposal-db.ts`, which is an
 * interpreter rather than a mock: it stores rows, evaluates `where` clauses,
 * rolls transactions back, and executes the real conditional `UPDATE` that
 * `lib/resume-proposals/apply-target.ts` builds against real in-memory arrays.
 * So "the bullet changed" and "two applies raced" are tested by letting the
 * statement match zero rows, which is exactly how Postgres answers them.
 *
 * What that buys, and what it does not: these tests prove the code implements
 * the compare-and-swap it claims. They do not prove Postgres isolation levels
 * behave as expected — the fake serialises transactions outright, which is
 * stricter than READ COMMITTED. The local harness exercises the real database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeDb, emptyStore, type FakeStore } from './utils/fake-proposal-db';

let store: FakeStore = emptyStore();
let onWrite: ((model: string, operation: string) => void) | undefined;
let client: Record<string, unknown> = {};

/**
 * One client per test, reached through a proxy.
 *
 * The proxy exists because `vi.mock` is hoisted above the fixtures, so the
 * module-level `db` has to resolve lazily. It delegates to whichever client
 * `beforeEach` built — building a new one per property access would reset the
 * id counter mid-test and hand two different batches the same id.
 */
vi.mock('@/lib/db', () => ({
  db: new Proxy({}, { get: (_target, property: string) => client[property] }),
}));

import {
  applyProposal,
  decideProposal,
  findBatchByIdempotencyKey,
  listProposalBatches,
  loadBatch,
  loadProposal,
  persistProposalBatch,
} from '@/services/resume-proposals.service';

import type { OrchestratorOutput } from '@/services/agents/resume/orchestrator.agent';

// ============================================================================
// FIXTURES
// ============================================================================

const USER_ID = 'user_1';
const OTHER_USER_ID = 'user_2';
const RESUME_ID = 'resume_1';
const OTHER_RESUME_ID = 'resume_2';

const SUMMARY = 'Builds APIs and data platforms.';
const BULLET_0 = 'Responsible for various backend services and worked on the platform';
const BULLET_1 = 'Migrated 12 services onto Kubernetes';
const HIGHLIGHT_0 = 'Cut deploy time in half';

const BETTER_BULLET = 'Built and maintained the backend services behind the platform';
const BETTER_SUMMARY = 'Builds and operates APIs and data platforms.';

function seed(): void {
  store = emptyStore();
  store.users.push({ id: USER_ID, clerkId: 'clerk_1' }, { id: OTHER_USER_ID, clerkId: 'clerk_2' });
  store.profiles.push(
    { id: RESUME_ID, userId: USER_ID, isArchived: false, summary: SUMMARY, updatedAt: new Date() },
    {
      id: OTHER_RESUME_ID,
      userId: OTHER_USER_ID,
      isArchived: false,
      summary: 'Someone else.',
      updatedAt: new Date(),
    }
  );
  store.experiences.push({
    id: 'exp1',
    profileId: RESUME_ID,
    bullets: [BULLET_0, BULLET_1],
    updatedAt: new Date(),
  });
  store.projects.push({
    id: 'proj1',
    profileId: RESUME_ID,
    description: 'Internal deploy tooling built with Docker.',
    highlights: [HIGHLIGHT_0],
    updatedAt: new Date(),
  });
}

/** One proposal in the shape the orchestrator's validated output carries. */
function agentProposal(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: 'prop_experience_exp1_bullets_0',
    targetRef: 'experience:exp1:bullets:0',
    target: { section: 'experience', recordId: 'exp1', field: 'bullets', index: 0 },
    section: 'experience',
    label: 'Backend Engineer @ Acme — bullet 1',
    originalText: BULLET_0,
    proposedText: BETTER_BULLET,
    explanation: 'Replaces filler with a concrete action verb.',
    keywordsAddressed: [],
    sourceEvidence: [BULLET_0],
    uncertainties: [],
    revisionRound: 0,
    deterministicIssues: [],
    verified: true,
    verification: {
      proposalId: 'prop_experience_exp1_bullets_0',
      targetRef: 'experience:exp1:bullets:0',
      status: 'approved',
      claimAnalysis: [],
      reason: 'Preserves every fact.',
      questionableClaims: [],
      requiredRevisions: [],
      supportingEvidence: [BULLET_0],
      deterministicIssues: [],
      decidedBy: 'deterministic+model',
    },
    ...overrides,
  };
}

function orchestratorOutput(
  proposals: Array<Record<string, unknown>> = [agentProposal()],
  rewriteOverrides: Record<string, unknown> = {}
): OrchestratorOutput {
  return {
    resumeId: RESUME_ID,
    mode: 'general',
    rewriteRequested: true,
    summary: 'Evaluated and proposed edits.',
    recommendations: ['Replace filler openings.'],
    agentsUsed: ['resume-evaluation', 'resume-rewrite', 'resume-verification'],
    limitations: [],
    executionStatus: 'complete',
    rewrite: {
      status: 'complete',
      revisionAttempts: 0,
      revisionLimit: 2,
      proposals,
      verifiedCount: proposals.length,
      rejectedCount: 0,
      revisionRequiredCount: 0,
      needsUserInputCount: 0,
      unverifiedCount: 0,
      openQuestions: [],
      basis: 'None of these has been applied.',
      ...rewriteOverrides,
    },
  } as unknown as OrchestratorOutput;
}

async function storeBatch(
  proposals: Array<Record<string, unknown>> = [agentProposal()],
  rewriteOverrides: Record<string, unknown> = {}
) {
  return persistProposalBatch({
    userId: USER_ID,
    resumeId: RESUME_ID,
    output: orchestratorOutput(proposals, rewriteOverrides),
    rootRunId: 'run_root_1',
  });
}

/** The resume as it stands, for asserting what did and did not change. */
function resumeNow() {
  return {
    summary: store.profiles.find((p) => p.id === RESUME_ID)!.summary,
    bullets: [...store.experiences.find((e) => e.id === 'exp1')!.bullets],
    highlights: [...store.projects.find((p) => p.id === 'proj1')!.highlights],
    description: store.projects.find((p) => p.id === 'proj1')!.description,
  };
}

beforeEach(() => {
  seed();
  onWrite = undefined;
  client = createFakeDb(store, {
    onWrite: (model, operation) => onWrite?.(model, operation),
  }) as unknown as Record<string, unknown>;
});

// ============================================================================
// PERSISTENCE
// ============================================================================

describe('persisting a batch is not approving it', () => {
  it('stores a verified proposal as pending review, not approved', async () => {
    const { batch, proposals } = await storeBatch();

    expect(batch.status).toBe('COMPLETE');
    expect(proposals).toHaveLength(1);

    const [proposal] = proposals;
    expect(proposal.verificationStatus).toBe('APPROVED');
    // The AI verdict and the human decision are separate facts.
    expect(proposal.decision).toBe('NONE');
    expect(proposal.state).toBe('PENDING_REVIEW');
    expect(proposal.applicable).toBe(false);

    // And nothing touched the resume.
    expect(resumeNow().bullets).toEqual([BULLET_0, BULLET_1]);
  });

  it.each([
    ['rejected', 'REJECTED'],
    ['revision_required', 'REVISION_REQUIRED'],
    ['needs_user_input', 'NEEDS_USER_INPUT'],
  ])('stores a %s proposal as unavailable', async (verdict, expected) => {
    const { proposals } = await storeBatch([
      agentProposal({
        verified: false,
        verification: { ...agentProposal().verification, status: verdict },
      }),
    ]);

    expect(proposals[0].verificationStatus).toBe(expected);
    expect(proposals[0].state).toBe('UNAVAILABLE');
    expect(proposals[0].stateReason).toBeTruthy();
  });

  it('stores a proposal the verifier never ruled on as unverified, not rejected', async () => {
    const { proposals } = await storeBatch([
      agentProposal({ verified: false, verification: undefined }),
    ]);

    expect(proposals[0].verificationStatus).toBe('UNVERIFIED');
    expect(proposals[0].state).toBe('UNAVAILABLE');
    expect(proposals[0].stateReason).toMatch(/never independently verified/i);
  });

  it('ignores a client-shaped "verified" flag entirely', async () => {
    // The agent output claims verified:true while the verdict says rejected.
    // The verdict is what is stored, because it is the only trusted field.
    const { proposals } = await storeBatch([
      agentProposal({
        verified: true,
        verification: { ...agentProposal().verification, status: 'rejected' },
      }),
    ]);

    expect(proposals[0].verificationStatus).toBe('REJECTED');
    expect(proposals[0].state).toBe('UNAVAILABLE');
  });

  it('refuses to store a proposal whose target it cannot parse', async () => {
    const { proposals } = await storeBatch([
      agentProposal({ targetRef: 'education:edu1:degree' }),
      agentProposal({
        proposalId: 'prop_ok',
        targetRef: 'experience:exp1:bullets:1',
        target: { section: 'experience', recordId: 'exp1', field: 'bullets', index: 1 },
        originalText: BULLET_1,
      }),
    ]);

    // Only the addressable one survived. A proposal that could never be
    // applied is not stored looking actionable.
    expect(proposals).toHaveLength(1);
    expect(proposals[0].targetRef).toBe('experience:exp1:bullets:1');
  });

  it('refuses a proposal whose targetRef disagrees with its target object', async () => {
    const { proposals } = await storeBatch([
      agentProposal({
        targetRef: 'experience:exp1:bullets:0',
        target: { section: 'experience', recordId: 'SOMEONE_ELSE', field: 'bullets', index: 0 },
      }),
    ]);

    expect(proposals).toEqual([]);
  });

  it('records a failed run as a batch with no proposals rather than nothing', async () => {
    const output = orchestratorOutput([], { status: 'failed' });
    const { batch, proposals } = await persistProposalBatch({
      userId: USER_ID,
      resumeId: RESUME_ID,
      output,
    });

    expect(batch.status).toBe('FAILED');
    expect(proposals).toEqual([]);
  });

  it('returns the first batch for a repeated idempotency key', async () => {
    const first = await persistProposalBatch({
      userId: USER_ID,
      resumeId: RESUME_ID,
      output: orchestratorOutput(),
      idempotencyKey: 'form-submit-abc123',
    });

    const found = await findBatchByIdempotencyKey(USER_ID, RESUME_ID, 'form-submit-abc123');
    expect(found?.batch.id).toBe(first.batch.id);

    // And a different user's identical key does not collide with it.
    expect(
      await findBatchByIdempotencyKey(OTHER_USER_ID, RESUME_ID, 'form-submit-abc123')
    ).toBeNull();
  });
});

// ============================================================================
// OWNERSHIP
// ============================================================================

describe('ownership is the query, not a check afterwards', () => {
  it('hides another user’s batch behind the same 404 as a missing one', async () => {
    const { batch } = await storeBatch();

    await expect(loadBatch(OTHER_USER_ID, RESUME_ID, batch.id)).rejects.toThrow(/not found/i);
    await expect(loadBatch(USER_ID, RESUME_ID, 'batch_does_not_exist')).rejects.toThrow(
      /not found/i
    );
  });

  it('refuses a real batch id addressed through the wrong resume', async () => {
    const { batch } = await storeBatch();
    await expect(loadBatch(USER_ID, OTHER_RESUME_ID, batch.id)).rejects.toThrow(/not found/i);
  });

  it('refuses a real proposal id addressed through the wrong batch', async () => {
    const { proposals } = await storeBatch();
    await expect(
      loadProposal(USER_ID, RESUME_ID, 'batch_not_mine', proposals[0].id)
    ).rejects.toThrow(/not found/i);
  });

  it('will not let another user decide on a proposal', async () => {
    const { batch, proposals } = await storeBatch();

    await expect(
      decideProposal(OTHER_USER_ID, RESUME_ID, batch.id, proposals[0].id, 'approve')
    ).rejects.toThrow(/not found/i);

    expect((await loadProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id)).state).toBe(
      'PENDING_REVIEW'
    );
  });

  it('will not let another user apply a proposal', async () => {
    const { batch, proposals } = await storeBatch();
    await decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'approve');

    await expect(
      applyProposal(OTHER_USER_ID, RESUME_ID, batch.id, proposals[0].id)
    ).rejects.toThrow(/not found/i);

    expect(resumeNow().bullets[0]).toBe(BULLET_0);
  });

  it('only lists batches belonging to the caller', async () => {
    await storeBatch();
    await persistProposalBatch({
      userId: OTHER_USER_ID,
      resumeId: OTHER_RESUME_ID,
      output: orchestratorOutput(),
    });

    const mine = await listProposalBatches(USER_ID, RESUME_ID);
    expect(mine).toHaveLength(1);
    expect(await listProposalBatches(USER_ID, OTHER_RESUME_ID)).toEqual([]);
  });
});

// ============================================================================
// THE STATE MACHINE
// ============================================================================

describe('approval and application are separate, and both are required', () => {
  it('refuses to apply a proposal the user has not approved', async () => {
    const { batch, proposals } = await storeBatch();

    await expect(applyProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id)).rejects.toThrow(
      /Approve this suggestion before applying/i
    );
    expect(resumeNow().bullets[0]).toBe(BULLET_0);
  });

  it('refuses to apply a proposal the verifier did not approve, even if approved by the user', async () => {
    const { batch, proposals } = await storeBatch([
      agentProposal({
        verification: { ...agentProposal().verification, status: 'needs_user_input' },
      }),
    ]);

    // The user cannot even approve it.
    await expect(
      decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'approve')
    ).rejects.toThrow(/needs information only you can give/i);

    await expect(applyProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id)).rejects.toThrow(
      /needs information only you can give/i
    );
    expect(resumeNow().bullets[0]).toBe(BULLET_0);
  });

  it('refuses to apply a rejected proposal', async () => {
    const { batch, proposals } = await storeBatch();
    await decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'reject');

    await expect(applyProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id)).rejects.toThrow(
      /was rejected/i
    );
    expect(resumeNow().bullets[0]).toBe(BULLET_0);
  });

  it('lets a user change their mind from rejected back to approved', async () => {
    const { batch, proposals } = await storeBatch();
    await decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'reject');
    const reapproved = await decideProposal(
      USER_ID,
      RESUME_ID,
      batch.id,
      proposals[0].id,
      'approve'
    );

    expect(reapproved.state).toBe('APPROVED');
    expect(reapproved.applicable).toBe(true);
  });

  it('rejecting a proposal never touches resume data', async () => {
    const before = resumeNow();
    const { batch, proposals } = await storeBatch();
    await decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'reject');
    expect(resumeNow()).toEqual(before);
  });

  it('listing and viewing never write anything at all', async () => {
    const { batch, proposals } = await storeBatch();

    const writes: string[] = [];
    onWrite = (model, operation) => writes.push(`${model}.${operation}`);

    await listProposalBatches(USER_ID, RESUME_ID);
    await loadBatch(USER_ID, RESUME_ID, batch.id);
    await loadProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id);

    expect(writes).toEqual([]);
  });
});

// ============================================================================
// APPLYING
// ============================================================================

describe('applying an approved proposal', () => {
  async function approved() {
    const { batch, proposals } = await storeBatch();
    await decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'approve');
    return { batchId: batch.id, proposalId: proposals[0].id };
  }

  it('changes exactly the targeted bullet and nothing else', async () => {
    const { batchId, proposalId } = await approved();
    const before = resumeNow();

    const applied = await applyProposal(USER_ID, RESUME_ID, batchId, proposalId);

    expect(applied.state).toBe('APPLIED');
    expect(applied.appliedAt).toBeTruthy();

    const after = resumeNow();
    expect(after.bullets[0]).toBe(BETTER_BULLET);
    // The sibling bullet, the summary, the project: untouched.
    expect(after.bullets[1]).toBe(before.bullets[1]);
    expect(after.summary).toBe(before.summary);
    expect(after.highlights).toEqual(before.highlights);
    expect(after.description).toBe(before.description);
  });

  it('writes the stored verified text, not anything a caller could pass', async () => {
    const { batchId, proposalId } = await approved();
    // `applyProposal` takes ids only — there is no parameter for text.
    await applyProposal(USER_ID, RESUME_ID, batchId, proposalId);
    expect(resumeNow().bullets[0]).toBe(BETTER_BULLET);
  });

  it('cannot be applied twice', async () => {
    const { batchId, proposalId } = await approved();
    await applyProposal(USER_ID, RESUME_ID, batchId, proposalId);

    await expect(applyProposal(USER_ID, RESUME_ID, batchId, proposalId)).rejects.toThrow(
      /already been applied/i
    );
    // And the resume was not written a second time.
    expect(resumeNow().bullets).toEqual([BETTER_BULLET, BULLET_1]);
  });

  it('cannot be rejected after it has been applied', async () => {
    const { batchId, proposalId } = await approved();
    await applyProposal(USER_ID, RESUME_ID, batchId, proposalId);

    await expect(decideProposal(USER_ID, RESUME_ID, batchId, proposalId, 'reject')).rejects.toThrow(
      /already been applied/i
    );
  });

  it('applies a summary proposal to the resume row itself', async () => {
    const { batch, proposals } = await storeBatch([
      agentProposal({
        proposalId: 'prop_summary',
        targetRef: 'summary:profile:summary',
        target: { section: 'summary', recordId: 'profile', field: 'summary' },
        section: 'summary',
        originalText: SUMMARY,
        proposedText: BETTER_SUMMARY,
      }),
    ]);
    await decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'approve');
    await applyProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id);

    expect(resumeNow().summary).toBe(BETTER_SUMMARY);
    expect(resumeNow().bullets).toEqual([BULLET_0, BULLET_1]);
  });

  it('applies a project highlight by index', async () => {
    const { batch, proposals } = await storeBatch([
      agentProposal({
        proposalId: 'prop_highlight',
        targetRef: 'project:proj1:highlights:0',
        target: { section: 'project', recordId: 'proj1', field: 'highlights', index: 0 },
        section: 'project',
        originalText: HIGHLIGHT_0,
        proposedText: 'Halved deploy time for the research group',
      }),
    ]);
    await decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'approve');
    await applyProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id);

    expect(resumeNow().highlights).toEqual(['Halved deploy time for the research group']);
  });
});

// ============================================================================
// STALENESS
// ============================================================================

describe('a resume that moved on is never overwritten', () => {
  async function approved(proposal = agentProposal()) {
    const { batch, proposals } = await storeBatch([proposal]);
    await decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'approve');
    return { batchId: batch.id, proposalId: proposals[0].id };
  }

  it('refuses when the bullet was edited after the suggestion was written', async () => {
    const { batchId, proposalId } = await approved();

    const experience = store.experiences.find((item) => item.id === 'exp1')!;
    experience.bullets[0] = 'Something the user typed themselves';

    await expect(applyProposal(USER_ID, RESUME_ID, batchId, proposalId)).rejects.toThrow(
      /resume changed/i
    );

    // The user's own text survived, untouched.
    expect(resumeNow().bullets[0]).toBe('Something the user typed themselves');

    const after = await loadProposal(USER_ID, RESUME_ID, batchId, proposalId);
    expect(after.state).toBe('STALE');
    expect(after.stateReason).toMatch(/changed/i);
  });

  it('refuses after the bullets were reordered', async () => {
    const { batchId, proposalId } = await approved();

    const experience = store.experiences.find((item) => item.id === 'exp1')!;
    experience.bullets = [BULLET_1, BULLET_0];

    await expect(applyProposal(USER_ID, RESUME_ID, batchId, proposalId)).rejects.toThrow(
      /resume changed/i
    );
    // Crucially: it did not rewrite whatever happens to sit at index 0 now.
    expect(resumeNow().bullets).toEqual([BULLET_1, BULLET_0]);
  });

  it('refuses after the bullet was deleted', async () => {
    const { batchId, proposalId } = await approved();

    const experience = store.experiences.find((item) => item.id === 'exp1')!;
    experience.bullets = [BULLET_1];

    await expect(applyProposal(USER_ID, RESUME_ID, batchId, proposalId)).rejects.toThrow(
      /resume changed/i
    );
    expect(resumeNow().bullets).toEqual([BULLET_1]);
  });

  it('refuses after the whole work experience was deleted', async () => {
    const { batchId, proposalId } = await approved();
    store.experiences = store.experiences.filter((item) => item.id !== 'exp1');

    await expect(applyProposal(USER_ID, RESUME_ID, batchId, proposalId)).rejects.toThrow(
      /resume changed/i
    );
  });

  it('reports staleness on a read without recording it', async () => {
    const { batchId, proposalId } = await approved();
    store.experiences.find((item) => item.id === 'exp1')!.bullets[0] = 'Different now';

    const writes: string[] = [];
    onWrite = (model, operation) => writes.push(`${model}.${operation}`);

    const proposal = await loadProposal(USER_ID, RESUME_ID, batchId, proposalId);

    expect(proposal.stale).toBe(true);
    expect(proposal.staleDetail).toMatch(/changed/i);
    expect(proposal.applicable).toBe(false);
    // Still APPROVED in storage: a GET did not change the user's data.
    expect(proposal.state).toBe('APPROVED');
    expect(writes).toEqual([]);
  });

  it('leaves an applied proposal alone when the text later changes', async () => {
    const { batchId, proposalId } = await approved();
    await applyProposal(USER_ID, RESUME_ID, batchId, proposalId);

    store.experiences.find((item) => item.id === 'exp1')!.bullets[0] = 'Edited afterwards';

    const proposal = await loadProposal(USER_ID, RESUME_ID, batchId, proposalId);
    // Staleness is only meaningful for something that could still be applied.
    expect(proposal.state).toBe('APPLIED');
    expect(proposal.stale).toBe(false);
  });
});

// ============================================================================
// CONCURRENCY AND FAILURE
// ============================================================================

describe('races and failures leave the resume alone', () => {
  async function approved() {
    const { batch, proposals } = await storeBatch();
    await decideProposal(USER_ID, RESUME_ID, batch.id, proposals[0].id, 'approve');
    return { batchId: batch.id, proposalId: proposals[0].id };
  }

  it('applies once when two requests race for the same proposal', async () => {
    const { batchId, proposalId } = await approved();

    const results = await Promise.allSettled([
      applyProposal(USER_ID, RESUME_ID, batchId, proposalId),
      applyProposal(USER_ID, RESUME_ID, batchId, proposalId),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    // The loser was told why, rather than silently succeeding.
    const rejected = results.find((result) => result.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason.message).toMatch(
      /already been applied|no longer approved/i
    );

    expect(resumeNow().bullets).toEqual([BETTER_BULLET, BULLET_1]);
  });

  it('rolls the proposal back when the resume write fails', async () => {
    const { batchId, proposalId } = await approved();

    onWrite = (model, operation) => {
      if (model === 'raw' && operation === 'execute') {
        throw new Error('connection lost');
      }
    };

    await expect(applyProposal(USER_ID, RESUME_ID, batchId, proposalId)).rejects.toThrow(
      /connection lost/i
    );

    onWrite = undefined;

    // Neither half of the change survived.
    expect(resumeNow().bullets[0]).toBe(BULLET_0);
    const proposal = await loadProposal(USER_ID, RESUME_ID, batchId, proposalId);
    expect(proposal.state).toBe('APPROVED');
    expect(proposal.appliedAt).toBeNull();
  });

  it('does not mark a proposal applied when the swap matched nothing', async () => {
    const { batchId, proposalId } = await approved();
    store.experiences.find((item) => item.id === 'exp1')!.bullets[0] = 'Moved on';

    await expect(applyProposal(USER_ID, RESUME_ID, batchId, proposalId)).rejects.toThrow();

    const proposal = await loadProposal(USER_ID, RESUME_ID, batchId, proposalId);
    expect(proposal.state).toBe('STALE');
    expect(proposal.appliedAt).toBeNull();
  });
});

// ============================================================================
// THE WHOLE LIFECYCLE
// ============================================================================

describe('a mixed batch, start to finish', () => {
  it('approves one, rejects another, applies the approved one only', async () => {
    const { batch, proposals } = await storeBatch([
      agentProposal(),
      agentProposal({
        proposalId: 'prop_experience_exp1_bullets_1',
        targetRef: 'experience:exp1:bullets:1',
        target: { section: 'experience', recordId: 'exp1', field: 'bullets', index: 1 },
        originalText: BULLET_1,
        proposedText: 'Migrated 12 production services onto Kubernetes',
      }),
      agentProposal({
        proposalId: 'prop_summary',
        targetRef: 'summary:profile:summary',
        target: { section: 'summary', recordId: 'profile', field: 'summary' },
        section: 'summary',
        originalText: SUMMARY,
        proposedText: BETTER_SUMMARY,
        verification: { ...agentProposal().verification, status: 'needs_user_input' },
      }),
    ]);

    expect(proposals).toHaveLength(3);

    // 1. Retrieve the batch.
    const retrieved = await loadBatch(USER_ID, RESUME_ID, batch.id);
    expect(retrieved.batch.counts).toMatchObject({
      total: 3,
      pendingReview: 2,
      unavailable: 1,
    });

    const [first, second, third] = retrieved.proposals;

    // 2. Approve one, reject one. The third cannot be decided at all.
    await decideProposal(USER_ID, RESUME_ID, batch.id, first.id, 'approve');
    await decideProposal(USER_ID, RESUME_ID, batch.id, second.id, 'reject');
    await expect(
      decideProposal(USER_ID, RESUME_ID, batch.id, third.id, 'approve')
    ).rejects.toThrow();

    // 3. Apply only the approved one.
    await applyProposal(USER_ID, RESUME_ID, batch.id, first.id);

    const after = resumeNow();
    expect(after.bullets[0]).toBe(BETTER_BULLET);
    // The rejected proposal's target is untouched.
    expect(after.bullets[1]).toBe(BULLET_1);
    // So is the one that needed user input.
    expect(after.summary).toBe(SUMMARY);

    // 4. The counts reflect what happened.
    const final = await loadBatch(USER_ID, RESUME_ID, batch.id);
    expect(final.batch.counts).toMatchObject({
      total: 3,
      applied: 1,
      rejected: 1,
      unavailable: 1,
      pendingReview: 0,
    });

    // 5. The applied one cannot be applied again.
    await expect(applyProposal(USER_ID, RESUME_ID, batch.id, first.id)).rejects.toThrow(
      /already been applied/i
    );
    expect(resumeNow()).toEqual(after);
  });
});
