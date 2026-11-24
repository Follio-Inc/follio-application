/**
 * Live harness for the read-only Resume Agent.
 *
 * Runs `runResumeAgent()` against the resume stored in the local Docker
 * Postgres and checks what came back against the database rows it was built
 * from. This is a developer tool: it is not imported by the app, not part of
 * the test suite, and it changes nothing.
 *
 * Safety properties, in order of importance:
 *
 *   1. It refuses to run against a non-local database. The host in
 *      DATABASE_URL must be localhost/127.0.0.1, so a stray `.env` pointing at
 *      Neon aborts the run instead of reading production data.
 *   2. It makes no billable OpenAI request unless `--run` is passed. Without
 *      it, the script does every database-side check and then stops.
 *   3. It never writes. The agent runtime keeps its run record in memory, the
 *      agent's only data tool is read-only, and this script re-reads the
 *      profile afterwards to prove `updatedAt` and the row counts are
 *      unchanged.
 *
 * Usage (from the repo root):
 *
 *   npx tsx local-tests/resume-agent/run-live.ts --resume <resumeId>
 *   npx tsx local-tests/resume-agent/run-live.ts --resume <resumeId> --run
 *   npx tsx local-tests/resume-agent/run-live.ts --resume <resumeId> --run --show-output
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadEnvConfig } from '@next/env';

import type { AgentStepMeta } from '@/types/agents';

// ============================================================================
// CLI
// ============================================================================

interface Args {
  email?: string;
  resume?: string;
  showOutput: boolean;
  run: boolean;
  help: boolean;
}

const FLAGS_WITH_VALUES = new Set(['--email', '--resume']);

function parseArgs(argv: string[]): Args {
  const args: Args = { showOutput: false, run: false, help: false };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    // Accept both "--flag value" and "--flag=value".
    const eq = token.indexOf('=');
    const name = eq === -1 ? token : token.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : token.slice(eq + 1);

    switch (name) {
      case '--email':
      case '--resume': {
        const value = inlineValue ?? argv[++i];
        if (!value || value.startsWith('--')) {
          fail(`${name} needs a value, e.g. ${name} <value>`);
        }
        if (name === '--email') args.email = value.trim();
        else args.resume = value.trim();
        break;
      }
      case '--show-output':
        args.showOutput = true;
        break;
      case '--run':
        args.run = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        fail(
          `Unknown argument "${token}". Known: --email, --resume, --show-output, --run, --help.` +
            (FLAGS_WITH_VALUES.has(token) ? '' : '')
        );
    }
  }

  return args;
}

function printUsage(): void {
  console.log(
    [
      'Live Resume Agent harness (read-only)',
      '',
      'Usage:',
      '  npx tsx local-tests/resume-agent/run-live.ts --resume <resumeId> [options]',
      '',
      'Options:',
      '  --resume <id>    Resume (Profile) id to summarize. Required.',
      '  --email <email>  Development account that owns it. Optional when the',
      '                   local database holds exactly one user.',
      '  --run            Actually call the model. THIS COSTS MONEY. Without it',
      '                   the script stops after the database checks.',
      '  --show-output    Print the generated summary and highlights.',
      '  --help           Show this message.',
    ].join('\n')
  );
}

function fail(message: string): never {
  console.error(`\n  ERROR  ${message}\n`);
  process.exit(1);
}

// ============================================================================
// OUTPUT HELPERS
// ============================================================================

const PASS = 'PASS';
const FAIL = 'FAIL';
const checks: { ok: boolean; label: string; detail?: string }[] = [];

function check(ok: boolean, label: string, detail?: string): void {
  checks.push({ ok, label, detail });
  console.log(`  [${ok ? PASS : FAIL}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function heading(title: string): void {
  console.log(`\n${title}`);
  console.log('-'.repeat(Math.max(title.length, 56)));
}

function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

// ============================================================================
// ENVIRONMENT
// ============================================================================

/** Walk up from the working directory until package.json appears. */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return fail('Could not find package.json. Run this from the repo root.');
}

/**
 * Report the database target without revealing credentials, and refuse
 * anything that is not local. The agent reads real resume content, so pointing
 * this at a hosted database is never what you want.
 */
function assertLocalDatabase(): { host: string; port: string; database: string } {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return fail('DATABASE_URL is not set. Check .env / .env.development.local.');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail('DATABASE_URL is not a valid URL.');
  }

  const host = url.hostname;
  const port = url.port || '5432';
  const database = url.pathname.replace(/^\//, '') || '(none)';

  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    return fail(
      `Refusing to run against a non-local database (host "${host}"). ` +
        'This harness only runs against the local Docker Postgres.'
    );
  }

  return { host, port, database };
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const root = findRepoRoot();

  // Load env the way `next dev` does, so .env.development.local wins over
  // .env.local exactly as it does for the running app. This must happen before
  // importing anything that reaches @/lib/db, because that module builds its
  // PrismaClient from process.env at import time — hence the dynamic imports
  // further down rather than static ones at the top of the file.
  loadEnvConfig(root, true);

  const target = assertLocalDatabase();

  heading('Environment');
  console.log(`  database   : ${target.database}`);
  console.log(`  host:port  : ${target.host}:${target.port}`);
  console.log(`  OPENAI key : ${process.env.OPENAI_API_KEY ? 'present (not shown)' : 'ABSENT'}`);
  console.log(
    `  mode       : ${args.run ? 'LIVE — will call the model' : 'preflight (no model call)'}`
  );

  const { db } = await import('@/lib/db');

  try {
    await runChecks(args, db);
  } finally {
    await db.$disconnect();
  }
}

type Db = (typeof import('@/lib/db'))['db'];

async function runChecks(args: Args, db: Db): Promise<void> {
  if (!args.resume) {
    fail('--resume <resumeId> is required. Pass the id of the resume to summarize.');
  }
  const resumeId = args.resume;

  // --------------------------------------------------------------------
  // 1. Resolve the development user from the database
  // --------------------------------------------------------------------
  heading('Development account');

  let user: { id: string; email: string } | null = null;

  if (args.email) {
    user = await db.user.findUnique({
      where: { email: args.email },
      select: { id: true, email: true },
    });
    if (!user) fail(`No user with email "${args.email}" in the local database.`);
  } else {
    const users = await db.user.findMany({ select: { id: true, email: true }, take: 10 });
    if (users.length === 0) {
      fail('The local database has no users yet. Sign in to the app once, then retry.');
    }
    if (users.length > 1) {
      console.log('  Multiple users found. Re-run with --email <one of these>:');
      for (const u of users) console.log(`    - ${u.email}`);
      fail('--email is required when the database holds more than one user.');
    }
    user = users[0];
    console.log('  (only one user in the database, using it)');
  }

  console.log(`  email      : ${user.email}`);
  console.log(`  user id    : ${user.id}`);

  // --------------------------------------------------------------------
  // 2. Ownership — scoped exactly like the agent's own query
  // --------------------------------------------------------------------
  heading('Resume ownership');
  console.log(`  requested  : ${resumeId}`);

  const profile = await db.profile.findFirst({
    where: { id: resumeId, userId: user.id, isArchived: false },
    include: {
      workExperiences: { select: { isVisible: true } },
      educations: { select: { isVisible: true } },
      projects: { select: { isVisible: true } },
      skills: { select: { name: true, isVisible: true } },
      skillGroups: { select: { skills: { select: { name: true, isVisible: true } } } },
    },
  });

  if (!profile) {
    const owned = await db.profile.findMany({
      where: { userId: user.id, isArchived: false },
      select: { id: true, resumeTitle: true },
      take: 10,
    });
    console.log('');
    if (owned.length) {
      console.log('  Resumes this account does own:');
      for (const p of owned) console.log(`    - ${p.id}  ${p.resumeTitle ?? '(untitled)'}`);
    } else {
      console.log('  This account owns no non-archived resumes.');
    }
    fail(`Resume "${resumeId}" is not owned by ${user.email} (or does not exist).`);
  }

  check(true, 'Resume belongs to the development account');
  console.log(`  title      : ${profile.resumeTitle ?? '(untitled)'}`);

  // --------------------------------------------------------------------
  // 3. Expected counts, mirroring lib/ai-connector/profile-view.ts
  // --------------------------------------------------------------------
  // The connector view keeps only isVisible rows, and de-duplicates skill
  // names across `skills` and `skillGroups[].skills`. Comparing against raw
  // row counts would report false mismatches, so mirror that logic here.
  const visibleSkillNames = new Set<string>([
    ...profile.skills.filter((s) => s.isVisible).map((s) => s.name),
    ...profile.skillGroups.flatMap((g) => g.skills.filter((s) => s.isVisible).map((s) => s.name)),
  ]);

  const expected = {
    experiences: profile.workExperiences.filter((r) => r.isVisible).length,
    education: profile.educations.filter((r) => r.isVisible).length,
    skills: visibleSkillNames.size,
    projects: profile.projects.filter((r) => r.isVisible).length,
  };

  heading('Database baseline (visible rows, as the connector view counts them)');
  console.log(
    `  experiences: ${expected.experiences}  (of ${profile.workExperiences.length} rows)`
  );
  console.log(`  education  : ${expected.education}  (of ${profile.educations.length} rows)`);
  console.log(`  skills     : ${expected.skills}  (unique visible names)`);
  console.log(`  projects   : ${expected.projects}  (of ${profile.projects.length} rows)`);

  const baselineUpdatedAt = profile.updatedAt.toISOString();

  // --------------------------------------------------------------------
  // 4. Stop here unless the model call was explicitly requested
  // --------------------------------------------------------------------
  if (!args.run) {
    heading('Preflight complete — no model call was made');
    console.log('  Every check that does not cost money has passed.');
    console.log('  To run the agent for real (this calls OpenAI and is billable):\n');
    console.log(
      `    npx tsx local-tests/resume-agent/run-live.ts --resume ${resumeId}` +
        `${args.email ? ` --email ${args.email}` : ''} --run\n`
    );
    summarize();
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    fail('OPENAI_API_KEY is not set, so the agent cannot run. Add it to .env.local.');
  }

  // --------------------------------------------------------------------
  // 5. Run the agent
  // --------------------------------------------------------------------
  heading('Running the agent');
  const { runResumeAgent } = await import('@/services/agents/resume/resume.agent');

  const startedAt = Date.now();
  const result = await runResumeAgent({ resumeId }, { userId: user.id });
  const wallClockMs = Date.now() - startedAt;

  const { output, run } = result;

  // --------------------------------------------------------------------
  // 6. Execution report
  // --------------------------------------------------------------------
  heading('Execution');
  console.log(`  status     : ${run.status}`);
  console.log(`  agent      : ${run.agentId} (${run.version})`);
  console.log(`  run id     : ${run.id}`);
  console.log(`  wall clock : ${ms(wallClockMs)}`);
  if (run.error) console.log(`  error      : ${run.error}`);

  const models = Array.from(
    new Set(run.stepMetas.map((s) => s.model).filter((m): m is string => Boolean(m)))
  );
  console.log(`  model(s)   : ${models.length ? models.join(', ') : '(none recorded)'}`);
  console.log(
    `  tokens     : ${run.totalTokensUsed.input} in + ${run.totalTokensUsed.output} out ` +
      `= ${run.totalTokensUsed.input + run.totalTokensUsed.output}`
  );

  heading('Steps');
  console.log(
    `  ${'#'.padEnd(4)}${'kind'.padEnd(8)}${'step'.padEnd(28)}${'duration'.padEnd(10)}model`
  );
  run.stepMetas.forEach((step: AgentStepMeta, i: number) => {
    const tokens = step.tokensUsed
      ? ` (${step.tokensUsed.input}+${step.tokensUsed.output} tok)`
      : '';
    console.log(
      `  ${String(i + 1).padEnd(4)}${step.kind.padEnd(8)}${step.stepId.padEnd(28)}` +
        `${ms(step.durationMs).padEnd(10)}${step.model ?? ''}${tokens}` +
        `${step.detail ? `  [${step.detail}]` : ''}`
    );
  });

  // --------------------------------------------------------------------
  // 7. Assertions
  // --------------------------------------------------------------------
  heading('Tool calls');
  const toolSteps = run.stepMetas.filter((s) => s.kind === 'tool').map((s) => s.stepId);
  check(toolSteps.includes('tool:get_resume'), 'Model called get_resume');
  check(toolSteps.includes('tool:submit_resume_summary'), 'Model called submit_resume_summary');

  heading('Result vs. database');
  check(run.status === 'succeeded', 'Run succeeded', run.status);
  check(
    output.resumeId === resumeId,
    'Returned resumeId matches the one requested',
    output.resumeId === resumeId ? undefined : `got "${output.resumeId}"`
  );
  check(
    output.resumeTitle === (profile.resumeTitle ?? ''),
    'Returned resumeTitle matches the stored row',
    `agent="${output.resumeTitle}" db="${profile.resumeTitle ?? ''}"`
  );

  for (const key of ['experiences', 'education', 'skills', 'projects'] as const) {
    const got = output.counts[key];
    const want = expected[key];
    check(got === want, `counts.${key} matches the database`, `agent=${got} db=${want}`);
  }

  // --------------------------------------------------------------------
  // 8. Prove nothing was written
  // --------------------------------------------------------------------
  heading('Read-only verification');
  const after = await db.profile.findUnique({
    where: { id: resumeId },
    select: {
      updatedAt: true,
      _count: { select: { workExperiences: true, educations: true, projects: true, skills: true } },
    },
  });
  check(
    after?.updatedAt.toISOString() === baselineUpdatedAt,
    'Profile.updatedAt unchanged by the run'
  );
  check(
    after?._count.workExperiences === profile.workExperiences.length &&
      after?._count.educations === profile.educations.length &&
      after?._count.projects === profile.projects.length &&
      after?._count.skills === profile.skills.length,
    'Row counts unchanged by the run'
  );

  // --------------------------------------------------------------------
  // 9. Generated text, only on request
  // --------------------------------------------------------------------
  if (args.showOutput) {
    heading('Generated summary');
    console.log(`  ${output.summary.replace(/\n/g, '\n  ')}`);
    if (output.highlights.length) {
      console.log('\n  Highlights:');
      for (const h of output.highlights) console.log(`    - ${h}`);
    }
    if (output.missingSections.length) {
      console.log(`\n  Missing sections: ${output.missingSections.join(', ')}`);
    }
    if (output.limitations.length) {
      console.log('\n  Limitations:');
      for (const l of output.limitations) console.log(`    - ${l}`);
    }
  } else {
    heading('Generated summary');
    console.log(`  ${output.summary.length} characters, ${output.highlights.length} highlights.`);
    console.log('  Re-run with --show-output to print it.');
  }

  summarize();
}

function summarize(): void {
  const failed = checks.filter((c) => !c.ok);
  heading('Summary');
  console.log(`  ${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAILED: ${f.label}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('\n  RUN FAILED');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack.split('\n').slice(1, 5).join('\n'));
  }
  process.exit(1);
});
