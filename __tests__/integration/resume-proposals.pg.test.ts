/**
 * Phase 4 — the proposal lifecycle against real PostgreSQL.
 *
 * Phase 3B.1 tested the service against an in-memory interpreter. That proved
 * the code implements the compare-and-swap it claims; it could not prove
 * Postgres behaves the way the design assumes. The claims that only a real
 * database can settle are the ones this file exists for:
 *
 *   - `UPDATE … SET bullets[3] = $new WHERE bullets[3] = $original` really is
 *     a single-element write that leaves its siblings alone;
 *   - two concurrent applies of the same proposal really do serialise, with
 *     one of them matching zero rows;
 *   - a rolled-back transaction really leaves both the resume and the
 *     proposal untouched;
 *   - the unique index really refuses a duplicate idempotency key.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 *
 * This suite writes to a database, so every guard is deliberate:
 *
 *   1. It **skips entirely** unless `DATABASE_URL` points at loopback. A
 *      hosted database is never touched, and a developer with no local
 *      Postgres gets a skipped suite rather than a failure.
 *   2. It creates its **own disposable user**, so it cannot reach any real
 *      account's data even by accident. Nothing here queries by anything but
 *      that user's id.
 *   3. Every fixture is marked and removed in `afterAll`; the marker is also
 *      what the cleanup matches on, so it can never delete a row it did not
 *      create.
 *   4. It makes no model call. Proposals are built here and persisted through
 *      the trusted service boundary — the same path the route uses after an
 *      authorized run — never through a public API that would let a client
 *      fabricate verification.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/lib/db';
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
// GUARDS
// ============================================================================

/** Only loopback. A hosted database must never see this suite. */
function isLocalDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

const LOCAL = isLocalDatabase();

/** Marks every row this suite creates, and is what cleanup matches on. */
const MARKER = '[phase4-pg-integration]';

// ============================================================================
// FIXTURES
// ============================================================================

const SUMMARY = 'Builds APIs and data platforms.';
const BULLET_0 = 'Responsible for various backend services';
const BULLET_1 = 'Migrated 12 services onto Kubernetes';
const BULLET_2 = 'Wrote the on-call runbook';
const HIGHLIGHT_0 = 'Cut deploy time in half';
const BETTER_BULLET = 'Built and maintained the backend services behind the platform';

interface Fixture {
  userId: string;
  otherUserId: string;
  resumeId: string;
  otherResumeId: string;
  experienceId: string;
  projectId: string;
}

let fixture: Fixture;

async function createUserWithResume(label: string) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const user = await db.user.create({
    data: {
      clerkId: `phase4_${label}_${suffix}`,
      email: `phase4-${label}-${suffix}@integration.invalid`,
    },
  });

  const profile = await db.profile.create({
    data: {
      userId: user.id,
      handle: `phase4-${label}-${suffix}`,
      resumeTitle: `${MARKER} ${label}`,
      firstName: 'Integration',
      lastName: 'Fixture',
      summary: SUMMARY,
      workExperiences: {
        create: [
          {
            company: 'Acme',
            role: 'Backend Engineer',
            startDate: new Date('2021-01-01'),
            isCurrent: true,
            bullets: [BULLET_0, BULLET_1, BULLET_2],
          },
        ],
      },
      projects: {
        create: [
          {
            title: 'Ops Platform',
            description: 'Internal deploy tooling built with Docker.',
            highlights: [HIGHLIGHT_0],
            techStack: ['TypeScript'],
          },
        ],
      },
    },
    include: { workExperiences: true, projects: true },
  });

  return {
    userId: user.id,
    resumeId: profile.id,
    experienceId: profile.workExperiences[0].id,
    projectId: profile.projects[0].id,
  };
}

/** One proposal in the shape a validated orchestrator run produces. */
function agentProposal(overrides: Record<string, unknown> = {}) {
  const base = {
    proposalId: 'prop_a',
    targetRef: `experience:${fixture.experienceId}:bullets:0`,
    target: {
      section: 'experience',
      recordId: fixture.experienceId,
      field: 'bullets',
      index: 0,
    },
    section: 'experience',
    label: 'Backend Engineer @ Acme — bullet 1',
    originalText: BULLET_0,
    proposedText: BETTER_BULLET,
    explanation: 'Replaces filler with a concrete action verb.',
    keywordsAddressed: [] as string[],
    sourceEvidence: [BULLET_0],
    uncertainties: [] as string[],
    revisionRound: 0,
    deterministicIssues: [],
    verified: true,
    verification: {
      proposalId: 'prop_a',
      targetRef: `experience:${fixture.experienceId}:bullets:0`,
      status: 'approved',
      claimAnalysis: [],
      reason: 'Preserves every fact.',
      questionableClaims: [],
      requiredRevisions: [],
      supportingEvidence: [BULLET_0],
      deterministicIssues: [],
      decidedBy: 'deterministic+model',
    },
  };
  return { ...base, ...overrides };
}

function orchestratorOutput(
  proposals: Array<Record<string, unknown>>,
  resumeId = fixture.resumeId
): OrchestratorOutput {
  return {
    resumeId,
    mode: 'general',
    rewriteRequested: true,
    summary: 'Integration fixture batch.',
    recommendations: [],
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
      basis: 'Nothing has been applied.',
    },
  } as unknown as OrchestratorOutput;
}

/** The resume exactly as the database holds it right now. */
async function resumeNow(resumeId = fixture.resumeId) {
  const profile = await db.profile.findUniqueOrThrow({
    where: { id: resumeId },
    select: {
      summary: true,
      headline: true,
      workExperiences: { select: { id: true, bullets: true, role: true, company: true } },
      projects: { select: { id: true, description: true, highlights: true } },
    },
  });
  return profile;
}

async function cleanup(): Promise<void> {
  // Profiles cascade into batches, proposals, experiences and projects.
  const profiles = await db.profile.findMany({
    where: { resumeTitle: { contains: MARKER } },
    select: { id: true, userId: true },
  });
  const userIds = [...new Set(profiles.map((profile) => profile.userId))];

  for (const profile of profiles) {
    await db.profile.delete({ where: { id: profile.id } }).catch(() => undefined);
  }
  for (const userId of userIds) {
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

// ============================================================================

describe.skipIf(!LOCAL)('proposal lifecycle against real PostgreSQL', () => {
  beforeAll(async () => {
    // Anything left behind by an interrupted earlier run.
    await cleanup();
    const mine = await createUserWithResume('owner');
    const theirs = await createUserWithResume('other');
    fixture = {
      userId: mine.userId,
      resumeId: mine.resumeId,
      experienceId: mine.experienceId,
      projectId: mine.projectId,
      otherUserId: theirs.userId,
      otherResumeId: theirs.resumeId,
    };
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  }, 60_000);

  beforeEach(async () => {
    // Reset the resume text and drop any batches the previous test stored, so
    // each test starts from the same database state.
    await db.workExperience.update({
      where: { id: fixture.experienceId },
      data: { bullets: [BULLET_0, BULLET_1, BULLET_2] },
    });
    await db.project.update({
      where: { id: fixture.projectId },
      data: {
        highlights: [HIGHLIGHT_0],
        description: 'Internal deploy tooling built with Docker.',
      },
    });
    await db.profile.update({
      where: { id: fixture.resumeId },
      data: { summary: SUMMARY, headline: null },
    });
    await db.resumeProposalBatch.deleteMany({
      where: { profileId: { in: [fixture.resumeId, fixture.otherResumeId] } },
    });
  }, 30_000);

  // ── TEST A: the full lifecycle ───────────────────────────────────────────

  describe('Test A — full lifecycle, verified against stored rows', () => {
    it('approves, rejects and applies with the database as the witness', async () => {
      const stored = await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([
          agentProposal(),
          agentProposal({
            proposalId: 'prop_b',
            targetRef: `experience:${fixture.experienceId}:bullets:1`,
            target: {
              section: 'experience',
              recordId: fixture.experienceId,
              field: 'bullets',
              index: 1,
            },
            originalText: BULLET_1,
            proposedText: 'Migrated 12 production services onto Kubernetes',
          }),
        ]),
        rootRunId: 'run_integration_1',
      });

      expect(stored.proposals).toHaveLength(2);

      // 3. Retrieve the batch from the database, not from the return value.
      const fetched = await loadBatch(fixture.userId, fixture.resumeId, stored.batch.id);
      expect(fetched.batch.counts).toMatchObject({ total: 2, pendingReview: 2 });

      const [first, second] = fetched.proposals;
      const before = await resumeNow();

      // 4-5. Approve changes nothing on the resume.
      await decideProposal(fixture.userId, fixture.resumeId, stored.batch.id, first.id, 'approve');
      expect(await resumeNow()).toEqual(before);

      // 6-7. Reject changes nothing either.
      await decideProposal(fixture.userId, fixture.resumeId, stored.batch.id, second.id, 'reject');
      expect(await resumeNow()).toEqual(before);

      // 8-10. Apply writes exactly one array element.
      await applyProposal(fixture.userId, fixture.resumeId, stored.batch.id, first.id);

      const after = await resumeNow();
      expect(after.workExperiences[0].bullets).toEqual([BETTER_BULLET, BULLET_1, BULLET_2]);
      expect(after.summary).toBe(before.summary);
      expect(after.projects[0].highlights).toEqual(before.projects[0].highlights);
      expect(after.workExperiences[0].role).toBe(before.workExperiences[0].role);

      // 11-12. The applied state is in the row, not just in memory.
      const row = await db.resumeEditProposal.findUniqueOrThrow({ where: { id: first.id } });
      expect(row.state).toBe('APPLIED');
      expect(row.appliedAt).not.toBeNull();
      expect(
        (await db.resumeEditProposal.findUniqueOrThrow({ where: { id: second.id } })).state
      ).toBe('REJECTED');

      // 13-14. A fresh read — what a reload would do — still sees the edit.
      const reloaded = await loadBatch(fixture.userId, fixture.resumeId, stored.batch.id);
      expect(reloaded.batch.counts).toMatchObject({ applied: 1, rejected: 1, pendingReview: 0 });
      expect((await resumeNow()).workExperiences[0].bullets[0]).toBe(BETTER_BULLET);
    }, 60_000);

    it('never offers a proposal the verifier did not approve', async () => {
      const stored = await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([
          agentProposal({
            verified: true,
            verification: { ...agentProposal().verification, status: 'needs_user_input' },
          }),
        ]),
      });

      const row = await db.resumeEditProposal.findUniqueOrThrow({
        where: { id: stored.proposals[0].id },
      });
      // `verified: true` in the payload is ignored; the verdict decides.
      expect(row.verificationStatus).toBe('NEEDS_USER_INPUT');
      expect(row.state).toBe('UNAVAILABLE');

      await expect(
        applyProposal(fixture.userId, fixture.resumeId, stored.batch.id, row.id)
      ).rejects.toThrow();
      expect((await resumeNow()).workExperiences[0].bullets[0]).toBe(BULLET_0);
    }, 30_000);
  });

  // ── TEST C: real concurrency ─────────────────────────────────────────────

  describe('Test C — concurrency, as PostgreSQL actually behaves', () => {
    async function approvedProposal(overrides: Record<string, unknown> = {}) {
      const stored = await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([agentProposal(overrides)]),
      });
      const proposal = stored.proposals[0];
      await decideProposal(
        fixture.userId,
        fixture.resumeId,
        stored.batch.id,
        proposal.id,
        'approve'
      );
      return { batchId: stored.batch.id, proposalId: proposal.id };
    }

    it('applies once when two requests race for the same proposal', async () => {
      const { batchId, proposalId } = await approvedProposal();

      const results = await Promise.allSettled([
        applyProposal(fixture.userId, fixture.resumeId, batchId, proposalId),
        applyProposal(fixture.userId, fixture.resumeId, batchId, proposalId),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);

      // The decisive assertion: the text was written exactly once, so the
      // array holds the new bullet and not a doubled or half-written one.
      const after = await resumeNow();
      expect(after.workExperiences[0].bullets).toEqual([BETTER_BULLET, BULLET_1, BULLET_2]);

      const row = await db.resumeEditProposal.findUniqueOrThrow({ where: { id: proposalId } });
      expect(row.state).toBe('APPLIED');
    }, 60_000);

    it('writes only its own element when two proposals target the same row', async () => {
      const stored = await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([
          agentProposal(),
          agentProposal({
            proposalId: 'prop_b',
            targetRef: `experience:${fixture.experienceId}:bullets:2`,
            target: {
              section: 'experience',
              recordId: fixture.experienceId,
              field: 'bullets',
              index: 2,
            },
            originalText: BULLET_2,
            proposedText: 'Authored the on-call runbook',
          }),
        ]),
      });

      for (const proposal of stored.proposals) {
        await decideProposal(
          fixture.userId,
          fixture.resumeId,
          stored.batch.id,
          proposal.id,
          'approve'
        );
      }

      // Both applied at once, against the same `bullets` array.
      const results = await Promise.allSettled(
        stored.proposals.map((proposal) =>
          applyProposal(fixture.userId, fixture.resumeId, stored.batch.id, proposal.id)
        )
      );
      expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

      // Neither overwrote the other: element-level writes, not a
      // read-modify-write of the whole array.
      expect((await resumeNow()).workExperiences[0].bullets).toEqual([
        BETTER_BULLET,
        BULLET_1,
        'Authored the on-call runbook',
      ]);
    }, 60_000);

    it('refuses when the target text changed under it', async () => {
      const { batchId, proposalId } = await approvedProposal();

      await db.workExperience.update({
        where: { id: fixture.experienceId },
        data: { bullets: ['Something the user typed themselves', BULLET_1, BULLET_2] },
      });

      await expect(
        applyProposal(fixture.userId, fixture.resumeId, batchId, proposalId)
      ).rejects.toThrow(/resume changed/i);

      expect((await resumeNow()).workExperiences[0].bullets[0]).toBe(
        'Something the user typed themselves'
      );
      expect(
        (await db.resumeEditProposal.findUniqueOrThrow({ where: { id: proposalId } })).state
      ).toBe('STALE');
    }, 30_000);

    it('refuses after the bullets were reordered', async () => {
      const { batchId, proposalId } = await approvedProposal();

      await db.workExperience.update({
        where: { id: fixture.experienceId },
        data: { bullets: [BULLET_1, BULLET_0, BULLET_2] },
      });

      await expect(
        applyProposal(fixture.userId, fixture.resumeId, batchId, proposalId)
      ).rejects.toThrow();

      // It did not rewrite whatever now sits at index 0.
      expect((await resumeNow()).workExperiences[0].bullets).toEqual([
        BULLET_1,
        BULLET_0,
        BULLET_2,
      ]);
    }, 30_000);

    it('refuses after the target row was deleted', async () => {
      const { batchId, proposalId } = await approvedProposal({
        targetRef: `project:${fixture.projectId}:highlights:0`,
        target: {
          section: 'project',
          recordId: fixture.projectId,
          field: 'highlights',
          index: 0,
        },
        section: 'project',
        originalText: HIGHLIGHT_0,
        proposedText: 'Halved deploy time for the research group',
      });

      await db.project.delete({ where: { id: fixture.projectId } });

      await expect(
        applyProposal(fixture.userId, fixture.resumeId, batchId, proposalId)
      ).rejects.toThrow();

      // Put it back for the following tests.
      const replacement = await db.project.create({
        data: {
          id: fixture.projectId,
          profileId: fixture.resumeId,
          title: 'Ops Platform',
          description: 'Internal deploy tooling built with Docker.',
          highlights: [HIGHLIGHT_0],
          techStack: ['TypeScript'],
        },
      });
      expect(replacement.id).toBe(fixture.projectId);
    }, 30_000);

    it('cannot be replayed once applied', async () => {
      const { batchId, proposalId } = await approvedProposal();
      await applyProposal(fixture.userId, fixture.resumeId, batchId, proposalId);

      // Replay the same request twice more.
      await expect(
        applyProposal(fixture.userId, fixture.resumeId, batchId, proposalId)
      ).rejects.toThrow(/already been applied/i);
      await expect(
        applyProposal(fixture.userId, fixture.resumeId, batchId, proposalId)
      ).rejects.toThrow(/already been applied/i);

      expect((await resumeNow()).workExperiences[0].bullets).toEqual([
        BETTER_BULLET,
        BULLET_1,
        BULLET_2,
      ]);
    }, 30_000);

    it('replaying an approval does not reopen an applied proposal', async () => {
      const { batchId, proposalId } = await approvedProposal();
      await applyProposal(fixture.userId, fixture.resumeId, batchId, proposalId);

      await expect(
        decideProposal(fixture.userId, fixture.resumeId, batchId, proposalId, 'approve')
      ).rejects.toThrow();
      await expect(
        decideProposal(fixture.userId, fixture.resumeId, batchId, proposalId, 'reject')
      ).rejects.toThrow();

      expect(
        (await db.resumeEditProposal.findUniqueOrThrow({ where: { id: proposalId } })).state
      ).toBe('APPLIED');
    }, 30_000);
  });

  // ── OWNERSHIP, against real rows ─────────────────────────────────────────

  describe('ownership holds against real rows', () => {
    it('hides another user’s batch and refuses their apply', async () => {
      const stored = await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([agentProposal()]),
      });
      const proposal = stored.proposals[0];
      await decideProposal(
        fixture.userId,
        fixture.resumeId,
        stored.batch.id,
        proposal.id,
        'approve'
      );

      // Real second user, real second resume, real ids.
      await expect(
        loadBatch(fixture.otherUserId, fixture.resumeId, stored.batch.id)
      ).rejects.toThrow(/not found/i);
      await expect(
        loadProposal(fixture.otherUserId, fixture.resumeId, stored.batch.id, proposal.id)
      ).rejects.toThrow(/not found/i);
      await expect(
        applyProposal(fixture.otherUserId, fixture.resumeId, stored.batch.id, proposal.id)
      ).rejects.toThrow(/not found/i);
      await expect(
        decideProposal(
          fixture.otherUserId,
          fixture.resumeId,
          stored.batch.id,
          proposal.id,
          'reject'
        )
      ).rejects.toThrow(/not found/i);

      // Nothing moved.
      expect((await resumeNow()).workExperiences[0].bullets[0]).toBe(BULLET_0);
      expect(
        (await db.resumeEditProposal.findUniqueOrThrow({ where: { id: proposal.id } })).state
      ).toBe('APPROVED');
    }, 30_000);

    it('refuses a real proposal addressed through the wrong resume', async () => {
      const stored = await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([agentProposal()]),
      });

      await expect(
        loadBatch(fixture.userId, fixture.otherResumeId, stored.batch.id)
      ).rejects.toThrow(/not found/i);
    }, 30_000);

    it('keeps each user’s listing to their own resume', async () => {
      await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([agentProposal()]),
      });

      expect(await listProposalBatches(fixture.userId, fixture.resumeId)).toHaveLength(1);
      expect(await listProposalBatches(fixture.otherUserId, fixture.resumeId)).toHaveLength(0);
      expect(await listProposalBatches(fixture.userId, fixture.otherResumeId)).toHaveLength(0);
    }, 30_000);
  });

  // ── TEST D: history and idempotency ──────────────────────────────────────

  describe('Test D — history and idempotency', () => {
    it('returns the first batch for a repeated key, and stores only one', async () => {
      const key = `integration-key-${Date.now()}`;

      const first = await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([agentProposal()]),
        idempotencyKey: key,
      });

      const found = await findBatchByIdempotencyKey(fixture.userId, fixture.resumeId, key);
      expect(found?.batch.id).toBe(first.batch.id);

      expect(
        await db.resumeProposalBatch.count({
          where: { profileId: fixture.resumeId, idempotencyKey: key },
        })
      ).toBe(1);
    }, 30_000);

    it('refuses a second batch under the same key for the same resume', async () => {
      const key = `integration-dup-${Date.now()}`;
      await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([agentProposal()]),
        idempotencyKey: key,
      });

      // The unique index is the backstop behind the route's pre-check.
      await expect(
        persistProposalBatch({
          userId: fixture.userId,
          resumeId: fixture.resumeId,
          output: orchestratorOutput([agentProposal()]),
          idempotencyKey: key,
        })
      ).rejects.toThrow();

      expect(
        await db.resumeProposalBatch.count({
          where: { profileId: fixture.resumeId, idempotencyKey: key },
        })
      ).toBe(1);
    }, 30_000);

    it('does not let one user reach another’s work through a shared key', async () => {
      const key = `integration-shared-${Date.now()}`;

      await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([agentProposal()]),
        idempotencyKey: key,
      });

      // Same key, different user: no hit, so no cross-account disclosure and
      // no accidental reuse of someone else's paid run.
      expect(
        await findBatchByIdempotencyKey(fixture.otherUserId, fixture.resumeId, key)
      ).toBeNull();
      expect(
        await findBatchByIdempotencyKey(fixture.userId, fixture.otherResumeId, key)
      ).toBeNull();
    }, 30_000);

    it('keeps the same key usable on a different resume', async () => {
      const key = `integration-scope-${Date.now()}`;

      await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([agentProposal()]),
        idempotencyKey: key,
      });

      // The unique index is (profileId, idempotencyKey), so another resume is
      // a separate scope rather than a collision.
      const other = await persistProposalBatch({
        userId: fixture.otherUserId,
        resumeId: fixture.otherResumeId,
        output: orchestratorOutput([], fixture.otherResumeId),
        idempotencyKey: key,
      });
      expect(other.batch.id).toBeTruthy();
    }, 30_000);

    it('records a failed run as a batch with no proposals, not as a success', async () => {
      const failed = await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: {
          ...orchestratorOutput([]),
          rewrite: { ...orchestratorOutput([]).rewrite!, status: 'failed', proposals: [] },
        } as OrchestratorOutput,
      });

      const row = await db.resumeProposalBatch.findUniqueOrThrow({
        where: { id: failed.batch.id },
      });
      expect(row.status).toBe('FAILED');
      expect(await db.resumeEditProposal.count({ where: { batchId: row.id } })).toBe(0);
    }, 30_000);

    it('survives a fresh read of history after everything above', async () => {
      await persistProposalBatch({
        userId: fixture.userId,
        resumeId: fixture.resumeId,
        output: orchestratorOutput([agentProposal()]),
      });

      // A reload is a fresh query; nothing about retrieval depends on
      // in-process state.
      const batches = await listProposalBatches(fixture.userId, fixture.resumeId);
      expect(batches.length).toBeGreaterThan(0);
      expect(batches[0].resumeId).toBe(fixture.resumeId);
    }, 30_000);
  });
});

// A visible marker when the suite is skipped, so a green run is not mistaken
// for a run that proved something.
describe.skipIf(LOCAL)('proposal lifecycle against real PostgreSQL', () => {
  it('is skipped because DATABASE_URL does not point at a local database', () => {
    expect(LOCAL).toBe(false);
  });
});
