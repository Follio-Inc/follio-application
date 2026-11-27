import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { canRunDeveloperSuites } from '../../modules/developer/guard';
import { killProcessTree, treeKillableSpawnOptions } from '../../modules/developer/process-tree';
import type { ProcessControl } from '../../modules/developer/process-tree';
import { COVERAGE_MAP, FEATURE_CATEGORIES } from '../coverage-map';
import type { FeatureCategory, PlatformFeature } from '../coverage-map';
import { busyDetailFor, withRun } from './execution';
import type { RunLease } from './execution';
import { recordVitestRun } from './history';
import type { HistoryOptions } from './history';
import type {
  CategoryRunResult,
  RunnableCategory,
  TestCaseResult,
  TestFailure,
  TestFileResult,
  TestRunOutcome,
  TestRunTotals,
} from './run-types';

/**
 * Running one category's unit tests (PLATFORM_TODO item 12).
 *
 * Server-only: spawns a child process. The browser sends a **category id and
 * nothing else**; this module resolves it against the coverage map and derives
 * the file list itself, so no path, flag or command fragment can arrive from
 * outside. Item 12's own words: `vitest run --reporter=json --outputFile=<tmp>`
 * behind the existing `canRunDeveloperSuites()` gate, and parse the JSON —
 * never scrape stdout.
 *
 * Reuses what the first Developer Platform proved: the same gate, and the same
 * way of spawning Vitest (`process.execPath` on `vitest.mjs`, `CI=true`,
 * `FORCE_COLOR=0`). It does not import that runner, because that one reports
 * stdout and this one has to report structure, and item 25 retires it.
 *
 * Out of scope here, by item: no run-all, no second category, no history, no
 * persistence, no Live QA. Pathways are never passed to Vitest — they are
 * Playwright specs, and item 14 runs them.
 *
 * Item 15 wrapped the spawn in the console's one execution slot. The run takes
 * the lock through `withRun`, reports its lifecycle through the lease, and
 * hands over a way to stop its child process tree; a start while something
 * else runs returns `busy` without spawning anything. Item 16 records each
 * finished run in the local history store. Everything about how the report is
 * produced and parsed is as item 12 and 13 left it.
 */

/** Vitest's own entry point, as the first platform's runner found it. */
const VITEST_BIN = path.join('node_modules', 'vitest', 'vitest.mjs');

/**
 * Hard ceiling on a child process, under the route's `maxDuration` of 300s.
 *
 * Not the same thing as item 15's cancel: this is the difference between a hung
 * child and a request that never returns, and it reports `timed-out` rather
 * than `cancelled`. Both stop the whole process tree.
 */
const RUN_TIMEOUT_MS = 240_000;

/** Enough stderr to explain a failure to start, without pasting a whole log. */
const MAX_RUNNER_OUTPUT = 4_000;

/** Repo-relative POSIX path for an absolute one the reporter produced. */
function toRepoRelative(absolute: string, repoRoot: string): string {
  const normalized = absolute.replace(/\\/g, '/');
  const root = repoRoot.replace(/\\/g, '/').replace(/\/$/, '');

  return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized;
}

/** The same substitution inside a stack trace, which holds several paths. */
function relativizeStack(text: string, repoRoot: string): string {
  const root = repoRoot.replace(/\\/g, '/');
  const encoded = encodeURI(`file:///${root}`);

  return text
    .split('\n')
    .map((line) =>
      line
        .replace(new RegExp(escapeForRegExp(encoded), 'g'), '')
        .replace(new RegExp(escapeForRegExp(`file:///${root}/`), 'g'), '')
        .replace(new RegExp(escapeForRegExp(`${root}/`), 'g'), '')
    )
    .join('\n');
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unit test files the map lists under a category, de-duplicated and sorted.
 *
 * De-duplication is the point: a test shared by two features in the same
 * category — the map has one — must be handed to Vitest once.
 */
export function resolveCategoryTestFiles(
  categoryId: string,
  features: PlatformFeature[] = COVERAGE_MAP
): string[] {
  return [
    ...new Set(
      features
        .filter((feature) => feature.category === categoryId)
        .flatMap((feature) => feature.unitTests)
    ),
  ].sort((a, b) => a.localeCompare(b));
}

/** True when the id is a category the coverage map declares. */
export function isKnownCategory(
  categoryId: string,
  categories: readonly FeatureCategory[] = FEATURE_CATEGORIES
): categoryId is FeatureCategory {
  return (categories as readonly string[]).includes(categoryId);
}

/** Every category and how many files it would run, for the UI's picker. */
export function listRunnableCategories(
  features: PlatformFeature[] = COVERAGE_MAP,
  categories: readonly FeatureCategory[] = FEATURE_CATEGORIES
): RunnableCategory[] {
  return categories.map((category) => ({
    id: category,
    fileCount: resolveCategoryTestFiles(category, features).length,
  }));
}

/** The exact argv handed to Vitest. Exported so a test can assert its shape. */
export function buildVitestArgs(reportPath: string, testFiles: string[]): string[] {
  // Positional arguments are filename filters. Each one is a full
  // repo-relative path, so a filter cannot reach a file the server did not
  // resolve; `filesReported` is compared against `filesRequested` afterwards
  // in case it ever does.
  return ['run', '--reporter=json', `--outputFile=${reportPath}`, ...testFiles];
}

/** Shape of the Vitest JSON reporter's output, limited to what is read. */
type VitestJsonReport = {
  success?: unknown;
  numTotalTestSuites?: unknown;
  numTotalTests?: unknown;
  numPassedTests?: unknown;
  numFailedTests?: unknown;
  numPendingTests?: unknown;
  numTodoTests?: unknown;
  testResults?: unknown;
};

const asNumber = (value: unknown): number => (typeof value === 'number' ? value : 0);
const asFiniteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;

function parseTotals(report: VitestJsonReport, fileCount: number): TestRunTotals {
  return {
    // Derived from the reported files, not from `numTotalTestSuites`: that
    // field counts `describe` blocks, so a single file with eight of them
    // reports eight. Labelling it "files" would be a number that means
    // something else.
    files: fileCount,
    tests: asNumber(report.numTotalTests),
    passed: asNumber(report.numPassedTests),
    failed: asNumber(report.numFailedTests),
    pending: asNumber(report.numPendingTests),
    todo: asNumber(report.numTodoTests),
  };
}

/** Matches a `path:line:column` frame at the end of a stack line. */
const STACK_FRAME = /\(?([\w./@[\]-]+\.(?:tsx?|jsx?|mjs|cjs):\d+:\d+)\)?\s*$/;

/**
 * The first stack frame inside the repository, as `path:line:column`.
 *
 * Read off a stack that has already been made repo-relative, so a frame in the
 * repository has no drive letter and no `file://` scheme. `node_modules`
 * frames are Vitest's own machinery and are skipped, which leaves the line the
 * test actually failed on. Null when nothing qualifies.
 */
function firstRepoFrame(stack: string): string | null {
  for (const line of stack.split('\n')) {
    const match = STACK_FRAME.exec(line.trim());
    if (!match) continue;

    const frame = match[1];
    if (frame.startsWith('node_modules/') || frame.includes('://') || /^[A-Za-z]:/.test(frame)) {
      continue;
    }
    return frame;
  }

  return null;
}

/**
 * One `failureMessages` entry split into its message and its stack.
 *
 * The first line is the error's own message, and that is where Vitest states
 * expected against actual. No further parsing: turning "expected 'a' to be
 * 'b'" into two fields would mean matching prose whose shape differs per
 * matcher, and the reporter offers no structured pair to use instead.
 */
function parseFailure(raw: string, repoRoot: string): TestFailure {
  const [message, ...rest] = raw.split('\n');
  const stack = rest.length > 0 ? relativizeStack(rest.join('\n'), repoRoot).trimEnd() : '';

  return {
    message: message?.trim() ? message.trim() : raw.trim(),
    stack: stack ? stack : null,
    location: stack ? firstRepoFrame(stack) : null,
  };
}

function parseCase(entry: Record<string, unknown>, repoRoot: string): TestCaseResult {
  const messages = Array.isArray(entry.failureMessages)
    ? entry.failureMessages.filter((message): message is string => typeof message === 'string')
    : [];

  return {
    name: typeof entry.title === 'string' ? entry.title : '',
    suite: Array.isArray(entry.ancestorTitles)
      ? entry.ancestorTitles.filter((title): title is string => typeof title === 'string')
      : [],
    status: typeof entry.status === 'string' ? entry.status : 'unknown',
    durationMs: asFiniteOrNull(entry.duration),
    // Every error the reporter attached, not just the first: a test can fail
    // more than once.
    failures: messages
      .filter((message) => message.trim().length > 0)
      .map((message) => parseFailure(message, repoRoot)),
  };
}

function parseFile(entry: Record<string, unknown>, repoRoot: string): TestFileResult {
  const startTime = asFiniteOrNull(entry.startTime);
  const endTime = asFiniteOrNull(entry.endTime);
  const message = typeof entry.message === 'string' ? entry.message.trim() : '';

  return {
    path: toRepoRelative(typeof entry.name === 'string' ? entry.name : '', repoRoot),
    status: typeof entry.status === 'string' ? entry.status : 'unknown',
    durationMs: startTime !== null && endTime !== null ? endTime - startTime : null,
    message: message ? relativizeStack(message, repoRoot) : null,
    tests: (Array.isArray(entry.assertionResults) ? entry.assertionResults : [])
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => parseCase(item, repoRoot)),
  };
}

/** Turns the reporter's JSON into the result model. Exported for tests. */
export function parseVitestReport(
  raw: string,
  repoRoot: string
): { totals: TestRunTotals; files: TestFileResult[]; success: boolean } | null {
  let report: VitestJsonReport;
  try {
    report = JSON.parse(raw) as VitestJsonReport;
  } catch {
    return null;
  }

  if (typeof report !== 'object' || report === null || !Array.isArray(report.testResults)) {
    return null;
  }

  const files = report.testResults
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => parseFile(item, repoRoot))
    .sort((a, b) => a.path.localeCompare(b.path));

  return { totals: parseTotals(report, files.length), files, success: report.success === true };
}

type SpawnOutcome = {
  exitCode: number | null;
  stderr: string;
  timedOut: boolean;
  spawnError: string | null;
};

/**
 * How a spawner reports what the run cannot know from its result alone
 * (PLATFORM_TODO item 15).
 *
 * Both are observations, not predictions: `onStarted` fires on Node's `spawn`
 * event, which means the child process actually exists, and `onProcess` hands
 * over the only way to stop it.
 */
export type SpawnHooks = {
  /** Called once, with a way to terminate the child and its descendants. */
  onProcess?: (control: ProcessControl) => void;
  /** Called when the child has started. */
  onStarted?: () => void;
};

/** Runs Vitest to completion. The seam a test replaces to avoid spawning. */
export type VitestSpawner = (
  args: string[],
  repoRoot: string,
  hooks: SpawnHooks
) => Promise<SpawnOutcome>;

const spawnVitest: VitestSpawner = (args, repoRoot, hooks) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, VITEST_BIN), ...args], {
      cwd: repoRoot,
      env: { ...process.env, FORCE_COLOR: '0', CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Vitest forks a worker per file, so stopping the run means stopping a
      // tree. On POSIX that needs its own process group.
      ...treeKillableSpawnOptions(),
    });

    let stderr = '';
    let timedOut = false;

    // The only way to stop this run, handed to the registry that holds the
    // lock. No pid leaves this function.
    hooks.onProcess?.({ stop: () => killProcessTree(child) });
    child.on('spawn', () => hooks.onStarted?.());

    // stdout is drained and discarded on purpose: the report is read from the
    // output file, never scraped from the console.
    child.stdout?.resume();
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    const timer = setTimeout(() => {
      timedOut = true;
      void killProcessTree(child).catch(() => {
        // Nothing left to escalate to; the close handler still resolves.
      });
    }, RUN_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stderr, timedOut, spawnError: error.message });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stderr, timedOut, spawnError: null });
    });
  });

export type RunCategoryOptions = {
  features?: PlatformFeature[];
  categories?: readonly FeatureCategory[];
  repoRoot?: string;
  /** Gate result. Defaults to the real `canRunDeveloperSuites()`. */
  canRun?: boolean;
  /** Spawner seam, so tests exercise the parsing without running Vitest. */
  spawner?: VitestSpawner;
  /** Reads the report file. Defaults to `readFileSync`. */
  readReport?: (reportPath: string) => string;
  /**
   * Where and whether to record the run in local history (item 16).
   *
   * Writing is off under `NODE_ENV=test` by default, so the repository's own
   * tests cannot write into the real store.
   */
  history?: HistoryOptions;
};

function refuse(
  categoryId: string,
  outcome: TestRunOutcome,
  detail: string,
  filesRequested: string[] = []
): CategoryRunResult {
  return {
    outcome,
    ran: false,
    categoryId,
    filesRequested,
    filesReported: [],
    // Nothing ran, so nothing was reported: every requested file is missing
    // from the report, and saying so is more honest than an empty list.
    filesNotReported: filesRequested,
    totals: null,
    files: [],
    durationMs: 0,
    exitCode: null,
    detail,
    runnerOutput: null,
  };
}

/**
 * Runs the category, holding the console's one execution slot.
 *
 * Split out so `runCategory` reads as its sequence of refusals followed by one
 * guarded run. Every exit from here releases the lock, because the caller's
 * `withRun` releases it in a `finally`.
 */
async function runUnderLease(
  categoryId: string,
  filesRequested: string[],
  repoRoot: string,
  options: RunCategoryOptions,
  lease: RunLease
): Promise<CategoryRunResult> {
  const startedMs = Date.now();
  const reportDir = mkdtempSync(path.join(tmpdir(), 'follio-platform-tests-'));
  const reportPath = path.join(reportDir, 'vitest-report.json');

  try {
    const spawner = options.spawner ?? spawnVitest;

    lease.advance('starting');
    const outcome = await spawner(buildVitestArgs(reportPath, filesRequested), repoRoot, {
      onProcess: (control) => lease.attachProcess(control),
      // The child exists. Reported because it happened, not because a timer
      // said it probably had.
      onStarted: () => lease.advance('running'),
    });
    const durationMs = Date.now() - startedMs;
    const runnerOutput = outcome.stderr.trim()
      ? outcome.stderr.trim().slice(-MAX_RUNNER_OUTPUT)
      : null;

    // Checked first, and before the report is looked for: a cancelled run was
    // killed, so of course it wrote no report. Reporting that as a missing
    // report would turn someone pressing Cancel into an infrastructure fault.
    if (lease.cancelRequested()) {
      lease.advance('cancelled');

      return {
        ...refuse(
          categoryId,
          'cancelled',
          `Cancelled after ${Math.round(durationMs / 1000)}s. The runner and its workers were stopped, and no report was read.`,
          filesRequested
        ),
        durationMs,
        exitCode: outcome.exitCode,
      };
    }

    if (outcome.spawnError !== null) {
      lease.advance('failed');

      return {
        ...refuse(
          categoryId,
          'runner-failed',
          `Vitest could not start: ${outcome.spawnError}`,
          filesRequested
        ),
        durationMs,
        runnerOutput,
      };
    }

    if (outcome.timedOut) {
      lease.advance('failed');

      return {
        ...refuse(
          categoryId,
          'timed-out',
          `The run was stopped after ${Math.round(RUN_TIMEOUT_MS / 1000)}s. Nothing was reported.`,
          filesRequested
        ),
        durationMs,
        exitCode: outcome.exitCode,
        runnerOutput,
      };
    }

    lease.advance('reading-report');

    let raw: string;
    try {
      raw = (options.readReport ?? ((file) => readFileSync(file, 'utf8')))(reportPath);
    } catch {
      lease.advance('failed');

      return {
        ...refuse(
          categoryId,
          'report-unreadable',
          'Vitest exited but wrote no JSON report, so there is nothing to show. The run itself may still have happened.',
          filesRequested
        ),
        durationMs,
        exitCode: outcome.exitCode,
        runnerOutput,
      };
    }

    const parsed = parseVitestReport(raw, repoRoot);
    if (parsed === null) {
      lease.advance('failed');

      return {
        ...refuse(
          categoryId,
          'report-unreadable',
          'Vitest wrote a JSON report this version cannot read.',
          filesRequested
        ),
        durationMs,
        exitCode: outcome.exitCode,
        runnerOutput,
      };
    }

    const filesReported = parsed.files.map((file) => file.path).sort((a, b) => a.localeCompare(b));
    // A file that was asked for and never came back did not pass. Reported as
    // its own list so the UI never shows it as a silent absence.
    const filesNotReported = filesRequested.filter((file) => !filesReported.includes(file));
    const failed = parsed.totals.failed > 0 || !parsed.success;

    // Execution finished and produced a report. Whether the tests passed is
    // the result's verdict, not the lifecycle's.
    lease.advance('completed');

    return {
      // It ran: a failing suite is a result, not an infrastructure problem.
      outcome: failed ? 'failed' : 'passed',
      ran: true,
      categoryId,
      filesRequested,
      filesReported,
      filesNotReported,
      totals: parsed.totals,
      files: parsed.files,
      durationMs,
      exitCode: outcome.exitCode,
      detail: failed
        ? `${parsed.totals.failed} of ${parsed.totals.tests} tests failed.`
        : `${parsed.totals.tests} tests passed.`,
      runnerOutput: failed ? runnerOutput : null,
    };
  } finally {
    // The report is read once and is of no use afterwards. It lives in the OS
    // temp directory, so it is never in the repository and never collides with
    // the Live QA artifacts the sponsor keeps.
    rmSync(reportDir, { recursive: true, force: true });
  }
}

/** Runs one category's unit tests and returns the parsed report. */
export async function runCategory(
  categoryId: string,
  options: RunCategoryOptions = {}
): Promise<CategoryRunResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const features = options.features ?? COVERAGE_MAP;
  const categories = options.categories ?? FEATURE_CATEGORIES;

  if (!isKnownCategory(categoryId, categories)) {
    return refuse(
      categoryId,
      'unknown-category',
      'No category by that name is declared in the coverage map.'
    );
  }

  // Checked before anything is resolved or spawned, and again by the API route.
  const canRun = options.canRun ?? canRunDeveloperSuites();
  if (!canRun) {
    return refuse(
      categoryId,
      'gate-closed',
      'Running tests is local-only: it needs DEVTOOLS_ENABLED=true and is refused in production.'
    );
  }

  const filesRequested = resolveCategoryTestFiles(categoryId, features);
  if (filesRequested.length === 0) {
    return refuse(
      categoryId,
      'no-tests',
      'The coverage map lists no unit test for any feature in this category, so there is nothing to run.',
      filesRequested
    );
  }

  // Nothing above this line spawns anything, so an unknown category, a closed
  // gate or an empty category is answered without taking the lock.
  return withRun(
    { runner: 'vitest', targetId: categoryId },
    (active) => refuse(categoryId, 'busy', busyDetailFor(active), filesRequested),
    async (lease) => {
      const startedAt = new Date().toISOString();
      const result = await runUnderLease(categoryId, filesRequested, repoRoot, options, lease);

      // One place, after the run has a final outcome: every executed ending is
      // recorded and no refusal can be, because a refusal never gets here
      // (item 16). A store that cannot be written never fails a run.
      recordVitestRun(result, { runId: lease.runId, startedAt }, { repoRoot, ...options.history });

      return result;
    }
  );
}
