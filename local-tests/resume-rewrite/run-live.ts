/**
 * Live harness for the Phase 3A rewrite and verification loop.
 *
 * Runs `runResumeOrchestrator({ rewrite: true })` against a resume in the
 * local Docker Postgres and prints what the tree actually did: which agents
 * ran, which tools each executed, every proposed edit with its original and
 * replacement text, the verdict each one received and who decided it, and how
 * many revision rounds it took. This is a developer tool — not imported by
 * the app, not part of the test suite.
 *
 * It exists because Phase 3A is deliberately not wired to any route, so this
 * is the only way to exercise the loop end to end.
 *
 * Safety properties, in order of importance, matching the Phase 1 and Phase 2
 * harnesses:
 *
 *   1. It refuses to run against a non-local database. The host in
 *      DATABASE_URL must be localhost/127.0.0.1, so a stray `.env` pointing
 *      at a hosted database aborts the run rather than reading real user data.
 *   2. It makes no billable OpenAI request unless `--run` is passed. Without
 *      it, the script resolves the user and resume, prints what it would do,
 *      and stops.
 *   3. It never writes to the resume. Every agent in the tree is read-only;
 *      the only rows written are the `AgentRun` telemetry rows the runtime
 *      writes for any run. To prove rather than assert this, the harness
 *      fingerprints every rewritable field before the run and compares after,
 *      and reports the comparison.
 *
 * Usage (from the repo root):
 *
 *   npx tsx local-tests/resume-rewrite/run-live.ts --email you@example.com
 *   npx tsx local-tests/resume-rewrite/run-live.ts --resume <id> --run
 *   npx tsx local-tests/resume-rewrite/run-live.ts --resume <id> --mode jd \
 *       --jd-file ./posting.txt --run
 *   npx tsx local-tests/resume-rewrite/run-live.ts --resume <id> --mode role \
 *       --role technical-program-manager --run --show-output
 *
 *   --analysis-only reproduces the Phase 2B behaviour for comparison: the
 *   same command without authorising any rewriting.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { loadEnvConfig } from '@next/env';

// Load .env the way Next does before anything imports the Prisma client.
loadEnvConfig(process.cwd());

import { db } from '@/lib/db';
import { isAIAvailable } from '@/lib/ai-client';
import { toConnectorProfileView } from '@/lib/ai-connector/profile-view';
import { listRewriteTargets } from '@/lib/resume-rewrite';
import { ROLE_PROFILE_OPTIONS } from '@/lib/role-profiles/profiles';
import {
  ORCHESTRATOR_MODES,
  runResumeOrchestrator,
} from '@/services/agents/resume/orchestrator.agent';

import type { OrchestratorMode } from '@/services/agents/resume/orchestrator.agent';

// ============================================================================
// CLI
// ============================================================================

interface Args {
  email?: string;
  resume?: string;
  mode: OrchestratorMode;
  role?: string;
  jdFile?: string;
  run: boolean;
  analysisOnly: boolean;
  showOutput: boolean;
  help: boolean;
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: 'general',
    run: false,
    analysisOnly: false,
    showOutput: false,
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
      case '--mode': {
        const mode = value();
        if (!(ORCHESTRATOR_MODES as readonly string[]).includes(mode)) {
          fail(`--mode must be one of: ${ORCHESTRATOR_MODES.join(', ')}`);
        }
        args.mode = mode as OrchestratorMode;
        break;
      }
      case '--role':
        args.role = value();
        break;
      case '--jd-file':
        args.jdFile = value();
        break;
      case '--run':
        args.run = true;
        break;
      case '--analysis-only':
        args.analysisOnly = true;
        break;
      case '--show-output':
        args.showOutput = true;
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
  Multi-agent resume rewriting — local harness (Phase 3A)

    --email <email>     Resolve the user, then list their resumes and exit.
    --resume <id>       The resume to work on.
    --mode <mode>       general | jd | role   (default: general)
    --role <role>       Target role for --mode role. Supported:
                        ${ROLE_PROFILE_OPTIONS.map((r) => r.id).join(', ')}
    --jd-file <path>    File holding the job description for --mode jd.
    --analysis-only     Do not authorise rewriting (Phase 2B behaviour).
    --run               Actually call the model. BILLABLE. Omit for a dry run.
    --show-output       Print the full report as JSON.

  Nothing this harness does changes a resume. It verifies that claim by
  fingerprinting every rewritable field before and after the run.
`;

// ============================================================================
// GUARDS
// ============================================================================

/** Refuse anything that is not a local database. */
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

const RESUME_INCLUDE = {
  contactInfo: true,
  workExperiences: { orderBy: { sortOrder: 'asc' } },
  educations: { orderBy: { sortOrder: 'asc' } },
  skills: { orderBy: { sortOrder: 'asc' } },
  skillGroups: {
    include: { skills: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  },
  projects: { orderBy: { sortOrder: 'asc' } },
} as const;

/**
 * A hash of every field a rewrite could possibly address.
 *
 * Taken before and after, so "the resume was not modified" is something the
 * harness checks rather than something it claims.
 */
async function fingerprintResume(resumeId: string): Promise<{ digest: string; fields: number }> {
  const profile = await db.profile.findUnique({
    where: { id: resumeId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    include: RESUME_INCLUDE as any,
  });
  if (!profile) fail(`No resume ${resumeId}.`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const view = toConnectorProfileView(profile as any);
  const targets = listRewriteTargets(view);
  const payload = JSON.stringify(targets.map((target) => [target.targetRef, target.text]));

  return {
    digest: crypto.createHash('sha256').update(payload).digest('hex'),
    fields: targets.length,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printExecutionTree(rows: Array<Record<string, unknown>>): void {
  console.log('  Execution tree:\n');

  for (const row of rows) {
    const isRoot = row.parentRunId === null;
    const steps = (row.stepMetas as Array<{ kind: string; stepId: string }>) ?? [];
    const tools = steps
      .filter((step) => step.kind === 'tool')
      .map((step) => step.stepId.replace(/^tool:/, ''));
    const tokens = row.totalTokensUsed as { input: number; output: number };

    console.log(`  ${isRoot ? '┌─' : '├──'} ${row.agentId}  (${row.status})`);
    console.log(`  │     run    ${row.id}`);
    if (row.parentRunId) console.log(`  │     parent ${row.parentRunId}`);
    console.log(`  │     tools  ${tools.join(' → ') || '(none)'}`);
    console.log(`  │     tokens ${tokens.input + tokens.output}`);
  }
  console.log('');
}

function wrap(text: string, indent: string, width = 86): string {
  const words = String(text ?? '').split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.map((item) => `${indent}${item}`).join('\n');
}

const VERDICT_MARK: Record<string, string> = {
  approved: '✓ approved',
  revision_required: '~ revision required',
  rejected: '✗ rejected',
  needs_user_input: '? needs your input',
};

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

  // ── Resolve the user ──
  const user = args.email
    ? await db.user.findFirst({ where: { email: args.email }, select: { id: true, email: true } })
    : args.resume
      ? await db.profile
          .findUnique({
            where: { id: args.resume },
            select: { user: { select: { id: true, email: true } } },
          })
          .then((profile) => profile?.user ?? null)
      : null;

  if (!user) {
    fail('Could not resolve a user. Pass --email <email> or a --resume <id> that exists.');
  }

  // ── List mode ──
  if (!args.resume) {
    const resumes = await db.profile.findMany({
      where: { userId: user.id, isArchived: false },
      select: { id: true, resumeTitle: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    console.log(`\n  Resumes for ${user.email}:\n`);
    for (const resume of resumes) {
      console.log(`    ${resume.id}  ${resume.resumeTitle}`);
    }
    console.log('\n  Re-run with --resume <id> --run\n');
    return;
  }

  // ── Validate the mode's input before spending anything ──
  let jobDescription: string | undefined;
  if (args.mode === 'jd') {
    if (!args.jdFile) fail('--mode jd needs --jd-file <path>.');
    const file = path.resolve(process.cwd(), args.jdFile);
    if (!fs.existsSync(file)) fail(`No such file: ${file}`);
    jobDescription = fs.readFileSync(file, 'utf8');
  }
  if (args.mode === 'role' && !args.role) {
    fail(
      `--mode role needs --role. Supported: ${ROLE_PROFILE_OPTIONS.map((r) => r.id).join(', ')}`
    );
  }

  const before = await fingerprintResume(args.resume);

  console.log(`\n  user     ${user.email}`);
  console.log(`  resume   ${args.resume}`);
  console.log(`  mode     ${args.mode}`);
  console.log(`  rewrite  ${args.analysisOnly ? 'NOT requested (--analysis-only)' : 'requested'}`);
  if (jobDescription) console.log(`  jd       ${jobDescription.length} characters`);
  if (args.role) console.log(`  role     ${args.role}`);
  console.log(`  fields   ${before.fields} rewritable, fingerprint ${before.digest.slice(0, 12)}`);

  if (!args.run) {
    console.log('\n  Dry run. Nothing was sent to the model. Add --run to execute.\n');
    return;
  }

  if (!isAIAvailable()) fail('OPENAI_API_KEY is not configured.');

  // ── Run ──
  console.log('\n  Running the orchestrator (this spends tokens)…\n');
  const startedAt = Date.now();

  const { output, run } = await runResumeOrchestrator(
    {
      resumeId: args.resume,
      mode: args.mode,
      jobDescription,
      targetRole: args.role,
      rewrite: !args.analysisOnly,
    },
    { userId: user.id }
  );

  const rows = await db.agentRun.findMany({
    where: { rootRunId: run.id },
    select: {
      id: true,
      agentId: true,
      parentRunId: true,
      status: true,
      stepMetas: true,
      totalTokensUsed: true,
    },
    orderBy: { startedAt: 'asc' },
  });

  console.log(`  Finished in ${Date.now() - startedAt}ms.\n`);
  printExecutionTree(rows as Array<Record<string, unknown>>);

  console.log(`  Agents that produced findings: ${output.agentsUsed.join(', ') || '(none)'}`);
  console.log(`  Execution status: ${output.executionStatus}`);

  if (output.matching?.jdMatch) {
    console.log(
      `  JD score: ${output.matching.jdMatch.score}/100 (${output.matching.jdMatch.band})`
    );
  }
  if (output.evaluation) {
    console.log(
      `  Metric coverage: ${output.evaluation.metricCoveragePercent}% of ` +
        `${output.evaluation.counts.totalBullets} bullets`
    );
  }

  // ── The proposals, which are the point of this harness ──
  if (output.rewrite) {
    const rewrite = output.rewrite;
    console.log(
      `\n  Rewrite: ${rewrite.status} after ${rewrite.revisionAttempts} of ` +
        `${rewrite.revisionLimit} permitted revision rounds`
    );
    console.log(
      `    verified ${rewrite.verifiedCount}  ·  revision ${rewrite.revisionRequiredCount}  ·  ` +
        `rejected ${rewrite.rejectedCount}  ·  needs you ${rewrite.needsUserInputCount}  ·  ` +
        `unverified ${rewrite.unverifiedCount}\n`
    );

    for (const proposal of rewrite.proposals) {
      const verdict = proposal.verification;
      const mark = verdict ? (VERDICT_MARK[verdict.status] ?? verdict.status) : '· not verified';

      console.log(`  ── ${proposal.label}   [${mark}]`);
      console.log(`     ref   ${proposal.targetRef}`);
      console.log('     from:');
      console.log(wrap(proposal.originalText, '       '));
      console.log('     to:');
      console.log(wrap(proposal.proposedText, '       '));
      console.log('     why:');
      console.log(wrap(proposal.explanation, '       '));

      if (proposal.keywordsAddressed.length > 0) {
        console.log(`     keywords: ${proposal.keywordsAddressed.join(', ')}`);
      }
      if (proposal.uncertainties.length > 0) {
        console.log(`     needs you: ${proposal.uncertainties.join(' | ')}`);
      }
      if (verdict) {
        console.log(`     verdict decided by: ${verdict.decidedBy}`);
        console.log(wrap(`reason: ${verdict.reason}`, '       '));
        for (const required of verdict.requiredRevisions) {
          console.log(wrap(`must fix: ${required}`, '       '));
        }
      }
      const blocking = proposal.deterministicIssues.filter((issue) => issue.severity !== 'info');
      if (blocking.length > 0) {
        console.log(
          `     guards: ${blocking.map((issue) => `${issue.code}(${issue.severity})`).join(', ')}`
        );
      }
      console.log('');
    }

    if (rewrite.openQuestions.length > 0) {
      console.log('  Questions for you (nothing was invented to answer these):');
      for (const question of rewrite.openQuestions) console.log(`    - ${question}`);
      console.log('');
    }
  } else {
    console.log('\n  No rewrite block: rewriting was not requested for this run.\n');
  }

  if (output.limitations.length > 0) {
    console.log('  Limitations:');
    for (const limitation of output.limitations) console.log(`    - ${limitation}`);
    console.log('');
  }

  // ── Prove the resume is untouched ──
  const after = await fingerprintResume(args.resume);
  const unchanged = after.digest === before.digest;
  console.log(
    `  Resume data: ${unchanged ? 'UNCHANGED' : 'CHANGED — this is a bug, investigate'} ` +
      `(${before.digest.slice(0, 12)} → ${after.digest.slice(0, 12)})`
  );
  if (!unchanged) process.exitCode = 1;

  if (args.showOutput) {
    console.log('\n  Full report:\n');
    console.log(JSON.stringify(output, null, 2));
  }

  console.log('');
}

main()
  .catch((error) => {
    console.error('\n  Failed:', error instanceof Error ? error.message : error, '\n');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
