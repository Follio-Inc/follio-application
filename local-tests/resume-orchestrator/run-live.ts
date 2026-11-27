/**
 * Live harness for the Phase 2B multi-agent resume analysis.
 *
 * Runs `runResumeOrchestrator()` against a resume in the local Docker Postgres
 * and then prints the execution tree it produced: which agents ran, which
 * tools each of them executed, and how the `AgentRun` rows correlate. This is
 * a developer tool — not imported by the app, not part of the test suite, and
 * it changes nothing about the resume.
 *
 * It exists because the orchestrator is deliberately not wired to any route
 * yet, so this is the only way to exercise it end to end without touching the
 * frontend.
 *
 * Safety properties, in order of importance, matching the Phase 1 harness:
 *
 *   1. It refuses to run against a non-local database. The host in
 *      DATABASE_URL must be localhost/127.0.0.1, so a stray `.env` pointing at
 *      a hosted database aborts the run rather than reading real user data.
 *   2. It makes no billable OpenAI request unless `--run` is passed. Without
 *      it, the script resolves the user and resume, prints what it would do,
 *      and stops.
 *   3. It never writes to the resume. Every agent in the tree is read-only;
 *      the only rows written are the `AgentRun` telemetry rows the runtime
 *      writes for any run.
 *
 * Usage (from the repo root):
 *
 *   npx tsx local-tests/resume-orchestrator/run-live.ts --email you@example.com
 *   npx tsx local-tests/resume-orchestrator/run-live.ts --resume <id> --mode general --run
 *   npx tsx local-tests/resume-orchestrator/run-live.ts --resume <id> --mode role \
 *       --role technical-program-manager --run
 *   npx tsx local-tests/resume-orchestrator/run-live.ts --resume <id> --mode jd \
 *       --jd-file ./posting.txt --run --show-output
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadEnvConfig } from '@next/env';

// Load .env the way Next does before anything imports the Prisma client.
loadEnvConfig(process.cwd());

import { db } from '@/lib/db';
import { isAIAvailable } from '@/lib/ai-client';
import {
  ORCHESTRATOR_MODES,
  runResumeOrchestrator,
} from '@/services/agents/resume/orchestrator.agent';
import { ROLE_PROFILE_OPTIONS } from '@/lib/role-profiles/profiles';

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
  showOutput: boolean;
  help: boolean;
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: 'general', run: false, showOutput: false, help: false };

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
  Multi-agent resume analysis — local harness

    --email <email>     Resolve the user, then list their resumes and exit.
    --resume <id>       The resume to analyse.
    --mode <mode>       general | jd | role   (default: general)
    --role <role>       Target role for --mode role. Supported:
                        ${ROLE_PROFILE_OPTIONS.map((r) => r.id).join(', ')}
    --jd-file <path>    File holding the job description for --mode jd.
    --run               Actually call the model. BILLABLE. Omit for a dry run.
    --show-output       Print the full report as JSON.
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

  console.log(`\n  user    ${user.email}`);
  console.log(`  resume  ${args.resume}`);
  console.log(`  mode    ${args.mode}`);
  if (jobDescription) console.log(`  jd      ${jobDescription.length} characters`);
  if (args.role) console.log(`  role    ${args.role}`);

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
    },
    { userId: user.id }
  );

  // ── Report the execution tree, which is the point of the harness ──
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

  console.log(`  Finished in ${Date.now() - startedAt}ms. Execution tree:\n`);

  for (const row of rows) {
    const isRoot = row.parentRunId === null;
    const steps = (row.stepMetas as Array<{ kind: string; stepId: string }>) ?? [];
    const tools = steps
      .filter((step) => step.kind === 'tool')
      .map((step) => step.stepId.replace(/^tool:/, ''));
    const tokens = row.totalTokensUsed as { input: number; output: number };

    console.log(`  ${isRoot ? '┌─' : '├──'} ${row.agentId}  (${row.status})`);
    console.log(`  ${isRoot ? '│ ' : '│  '}   run    ${row.id}`);
    if (row.parentRunId) console.log(`  │     parent ${row.parentRunId}`);
    console.log(`  ${isRoot ? '│ ' : '│  '}   tools  ${tools.join(' → ') || '(none)'}`);
    console.log(`  ${isRoot ? '│ ' : '│  '}   tokens ${tokens.input + tokens.output}`);
  }

  console.log(`\n  Agents that produced findings: ${output.agentsUsed.join(', ') || '(none)'}`);
  if (output.matching?.jdMatch) {
    console.log(
      `  JD score: ${output.matching.jdMatch.score}/100 (${output.matching.jdMatch.band})`
    );
  }
  if (output.matching?.roleCoverage) {
    const coverage = output.matching.roleCoverage;
    console.log(`  Role coverage: ${coverage.coveredCount}/${coverage.totalCompetencies}`);
  }
  if (output.evaluation) {
    console.log(
      `  Metric coverage: ${output.evaluation.metricCoveragePercent}% of ` +
        `${output.evaluation.counts.totalBullets} bullets`
    );
  }

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
