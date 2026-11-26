/**
 * Local harness for Phase 3B.1 — persistence, approval and safe application.
 *
 * The rewrite harness (local-tests/resume-rewrite/run-live.ts) proves the
 * agents never touch a resume. This one proves the opposite half: that when a
 * person approves a verified suggestion, exactly the right field changes, and
 * that every way of getting it wrong is refused by the real database rather
 * than by a test double.
 *
 * The unit tests run against an in-memory interpreter. This runs against
 * Postgres, which is the only place the conditional `UPDATE … WHERE
 * bullets[n] = $original` can actually be shown to work.
 *
 * Safety, in the order it matters:
 *
 *   1. **It refuses a non-local database.** The host in DATABASE_URL must be
 *      localhost, so a stray `.env` pointing at a hosted database aborts
 *      rather than editing a real person's resume.
 *   2. **It never writes without `--write`.** Listing and inspecting are the
 *      default and are read-only. Every command that creates, approves,
 *      applies or deletes anything refuses without the flag.
 *   3. **It never touches your own resume.** The lifecycle demo runs on a
 *      disposable resume it creates itself, marked in the title, and it
 *      refuses to operate on any resume it did not create. Your real resumes
 *      can be *listed* and *inspected*, never modified.
 *   4. **It makes no billable call without `--run`.** Only `--generate` can
 *      spend tokens, and only with that flag.
 *
 * Usage (from the repo root):
 *
 *   # read-only
 *   npx tsx local-tests/resume-proposals/run-live.ts --email you@example.com
 *   npx tsx local-tests/resume-proposals/run-live.ts --list --resume <id>
 *   npx tsx local-tests/resume-proposals/run-live.ts --batch <batchId>
 *
 *   # the full lifecycle, on a disposable resume, no model calls
 *   npx tsx local-tests/resume-proposals/run-live.ts --demo --email you@example.com --write
 *   npx tsx local-tests/resume-proposals/run-live.ts --cleanup --write
 *
 *   # billable: a real rewrite run, persisted
 *   npx tsx local-tests/resume-proposals/run-live.ts --generate --resume <id> --run --write
 */

import { randomUUID } from 'node:crypto';

import { loadEnvConfig } from '@next/env';

// Load .env the way Next does before anything imports the Prisma client.
loadEnvConfig(process.cwd());

import { isAIAvailable } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { runResumeOrchestrator } from '@/services/agents/resume/orchestrator.agent';
import {
  applyProposal,
  decideProposal,
  listProposalBatches,
  loadBatch,
  persistProposalBatch,
} from '@/services/resume-proposals.service';

import type { OrchestratorOutput } from '@/services/agents/resume/orchestrator.agent';

/** Every disposable resume this harness creates carries this in its title. */
const FIXTURE_MARKER = '[3B.1 harness fixture]';

// ============================================================================
// CLI
// ============================================================================

interface Args {
  email?: string;
  resume?: string;
  batch?: string;
  list: boolean;
  demo: boolean;
  generate: boolean;
  cleanup: boolean;
  write: boolean;
  run: boolean;
  help: boolean;
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    list: false,
    demo: false,
    generate: false,
    cleanup: false,
    write: false,
    run: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const eq = token.indexOf('=');
    const name = eq === -1 ? token : token.slice(0, eq);
    const inline = eq === -1 ? undefined : token.slice(eq + 1);

    const value = () => {
      const next = inline ?? argv[++i];
      if (!next || next.startsWith('--')) fail(`${name} needs a value.`);
      return next.trim();
    };

    switch (name) {
      case '--email':
        args.email = value();
        break;
      case '--resume':
        args.resume = value();
        break;
      case '--batch':
        args.batch = value();
        break;
      case '--list':
        args.list = true;
        break;
      case '--demo':
        args.demo = true;
        break;
      case '--generate':
        args.generate = true;
        break;
      case '--cleanup':
        args.cleanup = true;
        break;
      case '--write':
        args.write = true;
        break;
      case '--run':
        args.run = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (token.startsWith('--')) fail(`Unknown flag: ${token}`);
    }
  }

  return args;
}

const HELP = `
  Rewrite proposals — local harness (Phase 3B.1)

  Read-only (the default):
    --email <email>     List your resumes and any stored proposal batches.
    --list --resume <id>  List stored batches for one resume.
    --batch <batchId>   Show one batch and every proposal in it.

  Writes, all requiring --write:
    --demo --email <e>  Create a disposable resume, store a synthetic verified
                        batch, then walk the whole lifecycle against the real
                        database: approve, reject, apply, prove the right field
                        changed, prove a second apply is refused, and prove a
                        stale target is refused. No model calls.
    --cleanup           Delete every disposable resume this harness created.
    --generate --resume <id> --run
                        Run the real five-agent rewrite and persist the batch.
                        BILLABLE. Both flags required.

  This harness never modifies a resume it did not create, except through
  --generate, which only ever writes proposal rows and never resume text.
`;

// ============================================================================
// GUARDS
// ============================================================================

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url) fail('DATABASE_URL is not set.');

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    fail('DATABASE_URL could not be parsed.');
  }

  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    fail(
      `Refusing to run against a non-local database (host "${host}"). ` +
        'This harness is for the local Docker Postgres only.'
    );
  }
}

function requireWrite(args: Args, what: string): void {
  if (!args.write) {
    fail(`${what} modifies database records. Re-run with --write if that is what you want.`);
  }
}

/** Refuse to touch anything this harness did not create. */
function assertFixture(resume: { id: string; resumeTitle: string }): void {
  if (!resume.resumeTitle.includes(FIXTURE_MARKER)) {
    fail(
      `Resume ${resume.id} is not a harness fixture. This command only operates on disposable ` +
        'resumes it created itself — your own resumes are never modified.'
    );
  }
}

// ============================================================================
// REPORTING
// ============================================================================

function line(label: string, value: unknown): void {
  console.log(`    ${label.padEnd(22)}${String(value)}`);
}

function printProposal(proposal: {
  id: string;
  targetRef: string;
  state: string;
  decision: string;
  verificationStatus: string;
  stale: boolean;
  applicable: boolean;
  originalText: string;
  proposedText: string;
  stateReason: string | null;
}): void {
  console.log(`\n  ── ${proposal.targetRef}`);
  line('proposal', proposal.id);
  line('verification', proposal.verificationStatus);
  line('your decision', proposal.decision);
  line('state', proposal.state + (proposal.stale ? '  (stale)' : ''));
  line('applicable now', proposal.applicable ? 'yes' : 'no');
  if (proposal.stateReason) line('reason', proposal.stateReason);
  console.log(`      from: ${proposal.originalText}`);
  console.log(`      to:   ${proposal.proposedText}`);
}

// ============================================================================
// FIXTURE
// ============================================================================

/**
 * A disposable resume with deliberately weak text.
 *
 * Created fresh each time with a random handle so repeated runs never collide,
 * and marked in the title so `--cleanup` and `assertFixture` can recognise it.
 */
async function createFixture(userId: string) {
  const suffix = randomUUID().slice(0, 8);

  const resume = await db.profile.create({
    data: {
      userId,
      handle: `harness-3b1-${suffix}`,
      resumeTitle: `${FIXTURE_MARKER} ${suffix}`,
      firstName: 'Harness',
      lastName: 'Fixture',
      summary: 'Builds APIs and data platforms.',
      workExperiences: {
        create: [
          {
            company: 'Acme',
            role: 'Backend Engineer',
            startDate: new Date('2021-01-01'),
            isCurrent: true,
            bullets: [
              'Responsible for various backend services and worked on the platform',
              'Migrated 12 services onto Kubernetes',
            ],
          },
        ],
      },
      projects: {
        create: [
          {
            title: 'Ops Platform',
            description: 'Internal deploy tooling built with Docker.',
            highlights: ['Cut deploy time in half'],
            techStack: ['TypeScript'],
          },
        ],
      },
    },
    include: { workExperiences: true, projects: true },
  });

  return resume;
}

/**
 * A synthetic orchestrator output.
 *
 * Shaped exactly like the real thing but assembled here, so the lifecycle can
 * be exercised end to end without spending a token. `--generate` is the path
 * that uses real agents.
 */
function syntheticOutput(resume: {
  id: string;
  summary: string | null;
  workExperiences: Array<{ id: string; bullets: string[] }>;
}): OrchestratorOutput {
  const experience = resume.workExperiences[0];

  const proposal = (
    targetRef: string,
    target: Record<string, unknown>,
    originalText: string,
    proposedText: string,
    status: string
  ) => ({
    proposalId: `prop_${targetRef.replace(/[^a-zA-Z0-9]+/g, '_')}`,
    targetRef,
    target,
    section: target.section,
    label: targetRef,
    originalText,
    proposedText,
    explanation: 'Replaces filler with a concrete action verb.',
    keywordsAddressed: [],
    sourceEvidence: [originalText],
    uncertainties: [],
    revisionRound: 0,
    deterministicIssues: [],
    verified: status === 'approved',
    verification: {
      proposalId: `prop_${targetRef.replace(/[^a-zA-Z0-9]+/g, '_')}`,
      targetRef,
      status,
      claimAnalysis: [],
      reason: 'Synthetic verdict from the local harness.',
      questionableClaims: [],
      requiredRevisions: [],
      supportingEvidence: [originalText],
      deterministicIssues: [],
      decidedBy: 'deterministic+model',
    },
  });

  return {
    resumeId: resume.id,
    mode: 'general',
    rewriteRequested: true,
    summary: 'Synthetic batch produced by the Phase 3B.1 harness.',
    recommendations: [],
    agentsUsed: ['resume-evaluation', 'resume-rewrite', 'resume-verification'],
    limitations: [],
    executionStatus: 'complete',
    rewrite: {
      status: 'complete',
      revisionAttempts: 0,
      revisionLimit: 2,
      proposals: [
        proposal(
          `experience:${experience.id}:bullets:0`,
          { section: 'experience', recordId: experience.id, field: 'bullets', index: 0 },
          experience.bullets[0],
          'Built and maintained the backend services behind the platform',
          'approved'
        ),
        proposal(
          `experience:${experience.id}:bullets:1`,
          { section: 'experience', recordId: experience.id, field: 'bullets', index: 1 },
          experience.bullets[1],
          'Migrated 12 production services onto Kubernetes',
          'approved'
        ),
        proposal(
          'summary:profile:summary',
          { section: 'summary', recordId: 'profile', field: 'summary' },
          resume.summary ?? '',
          'Builds and operates APIs and data platforms.',
          'needs_user_input'
        ),
      ],
      verifiedCount: 2,
      rejectedCount: 0,
      revisionRequiredCount: 0,
      needsUserInputCount: 1,
      unverifiedCount: 0,
      openQuestions: ['How many services did you run?'],
      basis: 'Nothing here has been applied.',
    },
  } as unknown as OrchestratorOutput;
}

// ============================================================================
// COMMANDS
// ============================================================================

async function resolveUser(args: Args) {
  if (args.email) {
    return db.user.findFirst({
      where: { email: args.email },
      select: { id: true, email: true },
    });
  }
  if (args.resume) {
    const profile = await db.profile.findUnique({
      where: { id: args.resume },
      select: { user: { select: { id: true, email: true } } },
    });
    return profile?.user ?? null;
  }
  return null;
}

async function commandOverview(userId: string, email: string): Promise<void> {
  const resumes = await db.profile.findMany({
    where: { userId, isArchived: false },
    select: { id: true, resumeTitle: true },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`\n  Resumes for ${email}:\n`);
  for (const resume of resumes) {
    const batches = await listProposalBatches(userId, resume.id);
    console.log(`    ${resume.id}  ${resume.resumeTitle}  (${batches.length} batch(es))`);
  }
  console.log('\n  Inspect one with --list --resume <id>\n');
}

async function commandList(userId: string, resumeId: string): Promise<void> {
  const batches = await listProposalBatches(userId, resumeId);

  if (batches.length === 0) {
    console.log('\n  No stored proposal batches for this resume.\n');
    return;
  }

  console.log(`\n  ${batches.length} batch(es):\n`);
  for (const batch of batches) {
    console.log(`  ── ${batch.id}   ${batch.status}   ${batch.createdAt}`);
    line('mode', batch.mode);
    line('revisions', `${batch.revisionAttempts}`);
    line(
      'counts',
      `pending ${batch.counts.pendingReview} · approved ${batch.counts.approved} · ` +
        `applied ${batch.counts.applied} · rejected ${batch.counts.rejected} · ` +
        `unavailable ${batch.counts.unavailable} · stale ${batch.counts.stale}`
    );
  }
  console.log('\n  Inspect one with --batch <batchId>\n');
}

async function commandBatch(userId: string, batchId: string): Promise<void> {
  const row = await db.resumeProposalBatch.findFirst({
    where: { id: batchId, userId },
    select: { profileId: true },
  });
  if (!row) fail(`No batch ${batchId} for this user.`);

  const { batch, proposals } = await loadBatch(userId, row.profileId, batchId);

  console.log(`\n  Batch ${batch.id}  (${batch.status})`);
  line('resume', batch.resumeId);
  line('summary', batch.summary);
  if (batch.openQuestions.length > 0) {
    console.log('\n  Questions for you:');
    for (const question of batch.openQuestions) console.log(`    - ${question}`);
  }
  for (const proposal of proposals) printProposal(proposal);
  console.log('');
}

/** The whole lifecycle against the real database, with no model calls. */
async function commandDemo(userId: string): Promise<void> {
  console.log('\n  Creating a disposable resume…');
  const resume = await createFixture(userId);
  const experienceId = resume.workExperiences[0].id;
  line('resume', resume.id);
  line('title', resume.resumeTitle);

  const before = await db.workExperience.findUniqueOrThrow({ where: { id: experienceId } });
  console.log('\n  Resume as created:');
  before.bullets.forEach((bullet, index) => console.log(`    [${index}] ${bullet}`));

  console.log('\n  Storing a synthetic verified batch…');
  const stored = await persistProposalBatch({
    userId,
    resumeId: resume.id,
    output: syntheticOutput(resume),
    // Synthetic batch: there is no agent run behind it, and saying so is
    // more useful than inventing an id that resolves to nothing.
    rootRunId: undefined,
  });
  line('batch', stored.batch.id);
  line('proposals', stored.proposals.length);
  for (const proposal of stored.proposals) {
    line(proposal.targetRef, `${proposal.verificationStatus} → ${proposal.state}`);
  }

  const [first, second, needsInput] = stored.proposals;

  // ── 1. Nothing is applicable before a human says so ──
  console.log('\n  1. Applying without approving…');
  await expectRefusal(() => applyProposal(userId, resume.id, stored.batch.id, first.id));

  // ── 2. A proposal the verifier did not approve cannot even be approved ──
  console.log('  2. Approving the one that needs your input…');
  await expectRefusal(() =>
    decideProposal(userId, resume.id, stored.batch.id, needsInput.id, 'approve')
  );

  // ── 3. Approve one, reject the other ──
  console.log('  3. Approving the first and rejecting the second…');
  await decideProposal(userId, resume.id, stored.batch.id, first.id, 'approve');
  await decideProposal(userId, resume.id, stored.batch.id, second.id, 'reject');

  // ── 4. Apply the approved one ──
  console.log('  4. Applying the approved one…');
  await applyProposal(userId, resume.id, stored.batch.id, first.id);

  const after = await db.workExperience.findUniqueOrThrow({ where: { id: experienceId } });
  console.log('\n  Resume after applying:');
  after.bullets.forEach((bullet, index) => console.log(`    [${index}] ${bullet}`));

  const changedIndexes = after.bullets
    .map((bullet, index) => (bullet === before.bullets[index] ? null : index))
    .filter((index): index is number => index !== null);
  line(
    'fields changed',
    changedIndexes.length === 1 ? `bullet ${changedIndexes[0]}` : 'UNEXPECTED'
  );
  if (changedIndexes.length !== 1 || changedIndexes[0] !== 0) {
    fail('Exactly one bullet should have changed. Investigate before trusting this path.');
  }

  const summaryNow = await db.profile.findUniqueOrThrow({
    where: { id: resume.id },
    select: { summary: true },
  });
  line('summary untouched', summaryNow.summary === resume.summary ? 'yes' : 'NO — investigate');

  // ── 5. A second apply is refused ──
  console.log('\n  5. Applying the same suggestion again…');
  await expectRefusal(() => applyProposal(userId, resume.id, stored.batch.id, first.id));

  // ── 6. A rejected proposal cannot be applied ──
  console.log('  6. Applying the rejected one…');
  await expectRefusal(() => applyProposal(userId, resume.id, stored.batch.id, second.id));

  // ── 7. Staleness, against the real conditional UPDATE ──
  console.log('  7. Editing the resume behind a second approved suggestion, then applying…');
  await decideProposal(userId, resume.id, stored.batch.id, second.id, 'approve');
  await db.workExperience.update({
    where: { id: experienceId },
    data: { bullets: [after.bullets[0], 'Something the user typed themselves'] },
  });
  await expectRefusal(() => applyProposal(userId, resume.id, stored.batch.id, second.id));

  const final = await db.workExperience.findUniqueOrThrow({ where: { id: experienceId } });
  line(
    'user text survived',
    final.bullets[1] === 'Something the user typed themselves' ? 'yes' : 'NO'
  );

  const { proposals: finalProposals } = await loadBatch(userId, resume.id, stored.batch.id);
  console.log('\n  Final states:');
  for (const proposal of finalProposals) {
    line(proposal.targetRef, `${proposal.state}${proposal.stale ? ' (stale)' : ''}`);
  }

  console.log(
    `\n  Done. Remove the fixture with:\n    npx tsx ${process.argv[1]} --cleanup --write\n`
  );
}

/** Run something that must fail, and report why it did. */
async function expectRefusal(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
    fail('That should have been refused. Investigate before trusting this path.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`     refused: ${message}`);
  }
}

async function commandCleanup(userId: string): Promise<void> {
  const fixtures = await db.profile.findMany({
    where: { userId, resumeTitle: { contains: FIXTURE_MARKER } },
    select: { id: true, resumeTitle: true },
  });

  if (fixtures.length === 0) {
    console.log('\n  No harness fixtures to remove.\n');
    return;
  }

  for (const fixture of fixtures) {
    assertFixture(fixture);
    // Batches and proposals cascade with the resume.
    await db.profile.delete({ where: { id: fixture.id } });
    console.log(`  removed ${fixture.id}  ${fixture.resumeTitle}`);
  }
  console.log('');
}

async function commandGenerate(userId: string, resumeId: string): Promise<void> {
  if (!isAIAvailable()) fail('OPENAI_API_KEY is not configured.');

  console.log('\n  Running the five-agent rewrite (this spends tokens)…\n');
  const startedAt = Date.now();

  const { output, run } = await runResumeOrchestrator(
    { resumeId, mode: 'general', rewrite: true },
    { userId }
  );

  const stored = await persistProposalBatch({
    userId,
    resumeId,
    output,
    rootRunId: run.rootRunId ?? run.id,
  });

  console.log(`  Finished in ${Date.now() - startedAt}ms.`);
  line('batch', stored.batch.id);
  line('status', stored.batch.status);
  line('proposals', stored.proposals.length);
  for (const proposal of stored.proposals) printProposal(proposal);
  console.log(
    '\n  Nothing was applied. Review with --batch, then approve and apply through the API.\n'
  );
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  assertLocalDatabase();

  // --batch resolves its own user, so it is handled before user resolution.
  if (args.batch) {
    const batch = await db.resumeProposalBatch.findUnique({
      where: { id: args.batch },
      select: { userId: true },
    });
    if (!batch) fail(`No batch ${args.batch}.`);
    await commandBatch(batch.userId, args.batch);
    return;
  }

  const user = await resolveUser(args);
  if (!user) fail('Could not resolve a user. Pass --email <email> or --resume <id>.');

  if (args.cleanup) {
    requireWrite(args, '--cleanup');
    await commandCleanup(user.id);
    return;
  }

  if (args.demo) {
    requireWrite(args, '--demo');
    await commandDemo(user.id);
    return;
  }

  if (args.generate) {
    if (!args.resume) fail('--generate needs --resume <id>.');
    requireWrite(args, '--generate');
    if (!args.run) {
      console.log('\n  Dry run. Nothing was sent to the model. Add --run to execute.\n');
      return;
    }
    await commandGenerate(user.id, args.resume);
    return;
  }

  if (args.list || args.resume) {
    if (!args.resume) fail('--list needs --resume <id>.');
    const owned = await db.profile.findFirst({
      where: { id: args.resume, userId: user.id },
      select: { id: true },
    });
    if (!owned) fail('That resume does not belong to the resolved user.');
    await commandList(user.id, args.resume);
    return;
  }

  await commandOverview(user.id, user.email ?? '(no email)');
}

main()
  .catch((error) => {
    console.error('\n  Failed:', error instanceof Error ? error.message : error, '\n');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
