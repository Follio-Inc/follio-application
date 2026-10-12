/**
 * Test Console: history, last pass and flaky detection (PLATFORM_TODO item 16).
 *
 * Item 16's done condition is three things — each test shows a trend,
 * newly-failing is distinguished from already-failing, and a test that passes
 * and fails **on the same commit** is labelled flaky — so the assertions here
 * are about what gets written, what a reader makes of it, and what the view
 * says about it.
 *
 * Every test writes into a temporary directory of its own. Nothing here touches
 * the real store under `_admin-panel/platform/.runs/`, and the recorder refuses
 * to write under `NODE_ENV=test` unless a test asks it to, which is asserted
 * below rather than assumed.
 *
 * The commit probe is injected, because the point of the flaky rule is which
 * commit a run happened at, and a test that depended on this repository's HEAD
 * would prove nothing about the rule. The probe's real behaviour against git is
 * covered separately.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LIVE_QA_PATHWAYS } from '@/_admin-panel/modules/developer/live-qa/catalog';
import { FEATURE_CATEGORIES } from '@/_admin-panel/platform/coverage-map';
import type { PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import {
  buildHistoryView,
  buildTargetHistory,
  buildTrends,
  getActiveRun,
  HISTORY_FORMAT_VERSION,
  isRecordable,
  normalizeLiveQaStatus,
  normalizeVitestStatus,
  readCommit,
  readTargetRuns,
  recordLiveQaRun,
  recordVitestRun,
  RETAINED_PER_TARGET,
  runCategory,
  runPathway,
  targetSlug,
  testIdentity,
  type CategoryRunResult,
  type HistoryCommit,
  type PathwayRunResult,
  type RunHistoryRecord,
} from '@/_admin-panel/platform/tests';
import { TestHistory } from '@/_admin-panel/platform/ui';

const HISTORY = '_admin-panel/platform/tests/history.ts';
const HISTORY_TYPES = '_admin-panel/platform/tests/history-types.ts';
const HISTORY_VIEW = '_admin-panel/platform/ui/test-history.tsx';
const RUNNER = '_admin-panel/platform/tests/runner.ts';
const LIVE_QA_MODULE = '_admin-panel/platform/tests/live-qa.ts';
const TESTS_PAGE = 'app/admin/(dashboard)/platform/tests/page.tsx';
const CONSOLE_COMPONENT = '_admin-panel/platform/ui/test-console.tsx';
const PLATFORM_ROUTES_DIR = ['app', 'api', 'admin', 'platform'].join(path.sep);

const PATHWAY = 'public.landing';
const COMMIT_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const COMMIT_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const roots: string[] = [];
let root = '';
let runCounter = 0;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'follio-item16-'));
  roots.push(root);
  runCounter = 0;
});

afterEach(() => {
  const active = getActiveRun();
  if (active !== null) throw new Error(`a run was left active: ${active.targetId}`);
});

afterAll(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
});

/** A unique opaque run id, in the shape item 15 generates. */
function nextRunId(): string {
  runCounter += 1;
  return `0000000${runCounter}-1111-2222-3333-444444444444`;
}

function commit(sha: string | null, dirty = false): HistoryCommit {
  return { sha, dirty };
}

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'stub',
    name: 'Stub',
    userDescription: 'A stub feature used to exercise run history in isolation.',
    codeLocations: ['lib/utils.ts'],
    category: 'AI',
    status: 'shipped',
    unitTests: ['__tests__/example.test.ts'],
    pathways: [],
    ...overrides,
  };
}

type TestSpec = { file?: string; suite?: string[]; name: string; status: string };

function vitestResult({
  outcome = 'passed',
  ran = true,
  categoryId = 'AI',
  tests = [],
  durationMs = 1_234,
  ...rest
}: {
  outcome?: CategoryRunResult['outcome'];
  ran?: boolean;
  categoryId?: string;
  tests?: TestSpec[];
  durationMs?: number;
  runnerOutput?: string | null;
} = {}): CategoryRunResult {
  const files = [...new Set(tests.map((test) => test.file ?? '__tests__/example.test.ts'))];

  return {
    outcome,
    ran,
    categoryId,
    filesRequested: files,
    filesReported: ran ? files : [],
    filesNotReported: ran ? [] : files,
    totals: ran
      ? {
          files: files.length,
          tests: tests.length,
          passed: tests.filter((test) => test.status === 'passed').length,
          failed: tests.filter((test) => test.status === 'failed').length,
          pending: tests.filter((test) => test.status === 'skipped').length,
          todo: 0,
        }
      : null,
    files: files.map((file) => ({
      path: file,
      status: 'passed',
      durationMs: 4,
      message: null,
      tests: tests
        .filter((test) => (test.file ?? '__tests__/example.test.ts') === file)
        .map((test) => ({
          name: test.name,
          suite: test.suite ?? ['example'],
          status: test.status,
          durationMs: 2,
          failures:
            test.status === 'failed'
              ? [
                  {
                    message: 'AssertionError: expected 1 to be 2',
                    stack: '    at C:/repo/__tests__/example.test.ts:4:22',
                    location: '__tests__/example.test.ts:4:22',
                  },
                ]
              : [],
        })),
    })),
    durationMs,
    exitCode: outcome === 'passed' ? 0 : 1,
    detail: `${tests.length} tests.`,
    runnerOutput: null,
    ...rest,
  };
}

function pathwayResult({
  outcome = 'passed',
  ran = true,
  pathwayId = PATHWAY,
  cases = [],
  durationMs = 2_400,
}: {
  outcome?: PathwayRunResult['outcome'];
  ran?: boolean;
  pathwayId?: string;
  cases?: { suite?: string[]; name: string; status: string }[];
  durationMs?: number;
} = {}): PathwayRunResult {
  return {
    outcome,
    ran,
    pathwayId,
    pathwayTitle: 'Marketing landing',
    requiresAuth: false,
    authConfigured: false,
    baseUrl: 'http://localhost:3000',
    startedAt: '2026-10-11T09:00:00.000Z',
    durationMs,
    exitCode: outcome === 'passed' ? 0 : 1,
    totals: {
      expected: cases.filter((entry) => entry.status === 'expected').length,
      unexpected: cases.filter((entry) => entry.status === 'unexpected').length,
      flaky: cases.filter((entry) => entry.status === 'flaky').length,
      skipped: cases.filter((entry) => entry.status === 'skipped').length,
      durationMs,
    },
    cases: cases.map((entry) => ({
      name: entry.name,
      suite: entry.suite ?? [pathwayId],
      status: entry.status,
      attemptStatus: entry.status === 'expected' ? 'passed' : 'failed',
      durationMs: 900,
      retries: entry.status === 'flaky' ? 1 : 0,
      error: null,
      stack: null,
      location: null,
      artifacts: [],
    })),
    reportErrors: [],
    detail: `${cases.length} cases.`,
    runnerOutput: null,
    artifactsDir: '.artifacts/2026-10-11T09-00-00-000Z',
  };
}

/** Writes one Vitest run into the temporary store. */
function writeVitest(
  at: string,
  sha: string | null,
  tests: TestSpec[],
  options: { outcome?: CategoryRunResult['outcome']; categoryId?: string; dirty?: boolean } = {}
): string | null {
  return recordVitestRun(
    vitestResult({
      tests,
      outcome: options.outcome ?? 'passed',
      categoryId: options.categoryId ?? 'AI',
    }),
    { runId: nextRunId(), startedAt: at },
    {
      root,
      enabled: true,
      commit: () => commit(sha, options.dirty ?? false),
      now: () => new Date(at),
    }
  );
}

/** Writes a run that executed and produced no report. */
function writeUnreported(
  at: string,
  sha: string | null,
  outcome: CategoryRunResult['outcome']
): string | null {
  return recordVitestRun(
    vitestResult({ outcome, ran: false, tests: [] }),
    { runId: nextRunId(), startedAt: at },
    { root, enabled: true, commit: () => commit(sha), now: () => new Date(at) }
  );
}

function trendFor(id: string, categoryId = 'AI') {
  const target = buildTargetHistory(
    'vitest',
    categoryId,
    readTargetRuns('vitest', categoryId, { root })
  );
  return target.tests.find((trend) => trend.id === id);
}

describe('what gets written', () => {
  it('records a finished passing run', () => {
    const file = writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [
      { name: 'works', status: 'passed' },
    ]);

    expect(file).not.toBeNull();
    expect(existsSync(file as string)).toBe(true);

    const record = JSON.parse(readFileSync(file as string, 'utf8')) as RunHistoryRecord;
    expect(record.version).toBe(HISTORY_FORMAT_VERSION);
    expect(record.runner).toBe('vitest');
    expect(record.targetId).toBe('AI');
    expect(record.outcome).toBe('passed');
    expect(record.ran).toBe(true);
    // Stored, not derived: the run's own timestamps, duration and totals.
    expect(record.startedAt).toBe('2026-10-11T09:00:00.000Z');
    expect(record.durationMs).toBe(1_234);
    expect(record.commit).toEqual({ sha: COMMIT_A, dirty: false });
    expect(record.summary).toEqual({ tests: 1, passed: 1, failed: 0, skipped: 0, files: 1 });
    expect(record.tests).toEqual([
      { file: '__tests__/example.test.ts', suite: ['example'], name: 'works', status: 'passed' },
    ]);
  });

  it('records a finished failing run', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'failed' }], {
      outcome: 'failed',
    });

    const [record] = readTargetRuns('vitest', 'AI', { root });
    expect(record.outcome).toBe('failed');
    expect(record.tests[0]?.status).toBe('failed');
    expect(record.summary.failed).toBe(1);
  });

  it('records a Live QA run, keeping the reporter’s own flaky word', () => {
    const file = recordLiveQaRun(
      pathwayResult({
        outcome: 'failed',
        cases: [
          { name: 'loads', status: 'expected' },
          { name: 'retried', status: 'flaky' },
        ],
      }),
      { runId: nextRunId(), startedAt: '2026-10-11T09:00:00.000Z' },
      { root, enabled: true, commit: () => commit(COMMIT_A) }
    );

    expect(file).not.toBeNull();
    const [record] = readTargetRuns('live-qa', PATHWAY, { root });
    expect(record.targetId).toBe(PATHWAY);
    expect(record.summary).toEqual({ tests: 2, passed: 1, failed: 1, skipped: 0, files: null });
    // A Live QA case has no test file of its own; its spec is implied by the
    // pathway, which is already the outermost suite title.
    expect(record.tests).toEqual([
      { file: null, suite: [PATHWAY], name: 'loads', status: 'passed' },
      { file: null, suite: [PATHWAY], name: 'retried', status: 'failed', reporterFlaky: true },
    ]);
  });

  it('records a run that executed and produced no report, with no tests in it', () => {
    const outcomes = ['cancelled', 'timed-out', 'runner-failed', 'report-unreadable'] as const;
    outcomes.forEach((outcome, index) => {
      writeUnreported(`2026-10-11T09:0${index}:00.000Z`, COMMIT_A, outcome);
    });

    const records = readTargetRuns('vitest', 'AI', { root });
    expect(records).toHaveLength(4);
    for (const record of records) {
      expect(record.ran).toBe(false);
      // Nothing in it to be evidence of, which is why such a run can never
      // make a test look flaky or failing.
      expect(record.tests).toEqual([]);
      expect(record.summary.tests).toBe(0);
    }
  });

  it('records nothing for a refusal', () => {
    const refusals: CategoryRunResult['outcome'][] = [
      'unknown-category',
      'no-tests',
      'gate-closed',
      'busy',
    ];

    for (const outcome of refusals) {
      expect(
        recordVitestRun(
          vitestResult({ outcome, ran: false }),
          { runId: nextRunId(), startedAt: '2026-10-11T09:00:00.000Z' },
          { root, enabled: true, commit: () => commit(COMMIT_A) }
        ),
        outcome
      ).toBeNull();
      expect(isRecordable(outcome), outcome).toBe(false);
    }

    for (const outcome of [
      'unknown-pathway',
      'gate-closed',
      'skipped-auth-not-configured',
    ] as const) {
      expect(
        recordLiveQaRun(
          pathwayResult({ outcome, ran: false }),
          { runId: nextRunId(), startedAt: '2026-10-11T09:00:00.000Z' },
          { root, enabled: true, commit: () => commit(COMMIT_A) }
        ),
        outcome
      ).toBeNull();
    }

    expect(existsSync(path.join(root, 'vitest'))).toBe(false);
    expect(existsSync(path.join(root, 'live-qa'))).toBe(false);
  });

  it('writes nothing at all under NODE_ENV=test unless asked', () => {
    // This suite runs with NODE_ENV=test, so the default is off and the
    // repository's own tests cannot write into the real store.
    expect(process.env.NODE_ENV).toBe('test');
    expect(
      recordVitestRun(
        vitestResult({ tests: [{ name: 'works', status: 'passed' }] }),
        { runId: nextRunId(), startedAt: '2026-10-11T09:00:00.000Z' },
        { root }
      )
    ).toBeNull();
    expect(existsSync(path.join(root, 'vitest'))).toBe(false);
  });
});

describe('the runners record their own runs', () => {
  it('writes one entry for a real call, and none for the refusals around it', async () => {
    const features = [feature({ id: 'one', category: 'AI' })];
    const history = { root, enabled: true, commit: () => commit(COMMIT_A) };

    const closed = await runCategory('AI', { features, canRun: false, history });
    expect(closed.outcome).toBe('gate-closed');

    const unknown = await runCategory('Nonsense', { features, canRun: true, history });
    expect(unknown.outcome).toBe('unknown-category');

    const passed = await runCategory('AI', {
      features,
      canRun: true,
      history,
      spawner: async () => ({ exitCode: 0, stderr: '', timedOut: false, spawnError: null }),
      readReport: () =>
        JSON.stringify({
          success: true,
          numTotalTests: 1,
          numPassedTests: 1,
          numFailedTests: 0,
          numPendingTests: 0,
          numTodoTests: 0,
          testResults: [
            {
              name: `${process.cwd().replace(/\\/g, '/')}/__tests__/example.test.ts`,
              status: 'passed',
              startTime: 1,
              endTime: 3,
              assertionResults: [
                {
                  ancestorTitles: ['example'],
                  title: 'works',
                  status: 'passed',
                  duration: 2,
                  failureMessages: [],
                },
              ],
            },
          ],
        }),
    });
    expect(passed.outcome).toBe('passed');

    const records = readTargetRuns('vitest', 'AI', { root });
    expect(records, 'only the run that executed is recorded').toHaveLength(1);
    expect(records[0]?.outcome).toBe('passed');
    expect(records[0]?.tests).toEqual([
      { file: '__tests__/example.test.ts', suite: ['example'], name: 'works', status: 'passed' },
    ]);
    // The run id in history is the one item 15 generated, and it is a uuid.
    expect(records[0]?.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('writes nothing for a run refused as busy, and leaves the lock alone', async () => {
    const features = [feature({ id: 'one', category: 'AI' })];
    const history = { root, enabled: true, commit: () => commit(COMMIT_A) };
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = runCategory('AI', {
      features,
      canRun: true,
      history,
      spawner: async () => {
        await held;
        return { exitCode: 1, stderr: '', timedOut: false, spawnError: null };
      },
      readReport: () => {
        throw new Error('ENOENT');
      },
    });

    const busy = await runCategory('AI', { features, canRun: true, history });
    expect(busy.outcome).toBe('busy');

    release();
    expect((await first).outcome).toBe('report-unreadable');

    // Item 15's lock is untouched, and only the executed run is in history.
    expect(getActiveRun()).toBeNull();
    const records = readTargetRuns('vitest', 'AI', { root });
    expect(records).toHaveLength(1);
    expect(records[0]?.outcome).toBe('report-unreadable');
  });

  it('records a cancelled run without making it evidence', async () => {
    const features = [feature({ id: 'one', category: 'AI' })];

    const result = await runCategory('AI', {
      features,
      canRun: true,
      history: { root, enabled: true, commit: () => commit(COMMIT_A) },
      spawner: async (_args, _repoRoot, hooks) => {
        hooks.onProcess?.({ stop: async () => {} });
        hooks.onStarted?.();
        const { requestCancel } = await import('@/_admin-panel/platform/tests');
        await requestCancel(getActiveRun()!.runId);
        return { exitCode: 1, stderr: '', timedOut: false, spawnError: null };
      },
    });

    expect(result.outcome).toBe('cancelled');
    const [record] = readTargetRuns('vitest', 'AI', { root });
    expect(record.outcome).toBe('cancelled');
    expect(record.tests).toEqual([]);
  });

  it('records a Live QA run through the real entry point', async () => {
    const result = await runPathway(PATHWAY, {
      canRun: true,
      authConfigured: true,
      history: { root, enabled: true, commit: () => commit(COMMIT_A) },
      run: async () => ({
        ok: true,
        exitCode: 0,
        durationMs: 2_000,
        startedAt: '2026-10-11T09:00:00.000Z',
        finishedAt: '2026-10-11T09:00:02.000Z',
        baseUrl: 'http://localhost:3000',
        pathwayIds: [PATHWAY],
        results: [],
        stdout: '',
        stderr: '',
        artifactsDir: 'C:/repo/_admin-panel/modules/developer/live-qa/.artifacts/run',
      }),
      readReport: () =>
        JSON.stringify({
          stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0, duration: 900 },
          errors: [],
          suites: [
            {
              title: 'public-landing.spec.ts',
              suites: [
                {
                  title: PATHWAY,
                  specs: [
                    {
                      title: 'marketing landing loads',
                      tests: [
                        { status: 'expected', results: [{ status: 'passed', duration: 900 }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
    });

    expect(result.outcome).toBe('passed');
    const [record] = readTargetRuns('live-qa', PATHWAY, { root });
    expect(record.tests).toEqual([
      { file: null, suite: [PATHWAY], name: 'marketing landing loads', status: 'passed' },
    ]);
  });
});

describe('the store on disk', () => {
  it('survives being read again, because every read goes to the files', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'passed' }]);

    expect(readTargetRuns('vitest', 'AI', { root })).toHaveLength(2);

    // Deleting a file changes what the next read returns, which is what makes
    // it a read of the disk and not of a cache that outlives a dev server.
    const dir = path.join(root, 'vitest', 'ai');
    rmSync(path.join(dir, readdirSync(dir).sort()[0]));
    expect(readTargetRuns('vitest', 'AI', { root })).toHaveLength(1);
    expect(read(HISTORY)).not.toMatch(/^(const|let) cache/m);
  });

  it('answers an empty history for a target that has never run', () => {
    expect(readTargetRuns('vitest', 'AI', { root })).toEqual([]);
    expect(readTargetRuns('vitest', 'AI', { root: path.join(root, 'nope') })).toEqual([]);
  });

  it('skips a file it cannot read and keeps the rest', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'passed' }]);
    const dir = path.join(root, 'vitest', 'ai');
    writeFileSync(path.join(dir, '2026-10-11T10-00-00-000Z-broken.json'), '{ not json', 'utf8');
    writeFileSync(
      path.join(dir, '2026-10-11T11-00-00-000Z-future.json'),
      JSON.stringify({ version: 99, runId: 'x', runner: 'vitest', targetId: 'AI', tests: [] }),
      'utf8'
    );

    const records = readTargetRuns('vitest', 'AI', { root });
    expect(records).toHaveLength(1);
    expect(records[0]?.startedAt).toBe('2026-10-11T09:00:00.000Z');
  });

  it('keeps only the newest runs per target', () => {
    for (let hour = 0; hour < RETAINED_PER_TARGET + 4; hour += 1) {
      writeVitest(`2026-10-11T${String(hour).padStart(2, '0')}:00:00.000Z`, COMMIT_A, [
        { name: 'works', status: 'passed' },
      ]);
    }

    const records = readTargetRuns('vitest', 'AI', { root });
    expect(records).toHaveLength(RETAINED_PER_TARGET);
    // Newest first, and the four oldest are gone from the disk.
    expect(records[0]?.startedAt).toBe(
      `2026-10-11T${String(RETAINED_PER_TARGET + 3).padStart(2, '0')}:00:00.000Z`
    );
    expect(records.at(-1)?.startedAt).toBe('2026-10-11T04:00:00.000Z');
    expect(readdirSync(path.join(root, 'vitest', 'ai'))).toHaveLength(RETAINED_PER_TARGET);
  });

  it('prunes per target, so one busy target cannot evict another', () => {
    for (let hour = 0; hour < RETAINED_PER_TARGET + 2; hour += 1) {
      writeVitest(`2026-10-11T${String(hour).padStart(2, '0')}:00:00.000Z`, COMMIT_A, [
        { name: 'works', status: 'passed' },
      ]);
    }
    writeVitest('2026-10-11T08:00:00.000Z', COMMIT_A, [{ name: 'other', status: 'passed' }], {
      categoryId: 'Builder',
    });

    expect(readTargetRuns('vitest', 'AI', { root })).toHaveLength(RETAINED_PER_TARGET);
    expect(readTargetRuns('vitest', 'Builder', { root })).toHaveLength(1);
  });

  it('orders runs deterministically', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'passed' }]);
    writeVitest('2026-10-11T11:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'passed' }]);

    const once = readTargetRuns('vitest', 'AI', { root });
    expect(once.map((record) => record.startedAt)).toEqual([
      '2026-10-11T11:00:00.000Z',
      '2026-10-11T10:00:00.000Z',
      '2026-10-11T09:00:00.000Z',
    ]);
    expect(readTargetRuns('vitest', 'AI', { root })).toEqual(once);
    expect(buildTrends(once)).toEqual(buildTrends(once));
  });

  it('puts a target id in a path safely, and gives every real target its own', () => {
    expect(targetSlug('Public surfaces')).toBe('public-surfaces');
    expect(targetSlug('public.landing')).toBe('public-landing');
    // Nothing an id can spell becomes a separator, a parent or a drive letter.
    for (const nasty of ['../../etc/passwd', 'C:\\windows', '..', '/', './x']) {
      const slug = targetSlug(nasty);
      expect(slug, nasty).not.toMatch(/[\\/]/);
      expect(slug, nasty).not.toContain('..');
      expect(path.resolve(root, slug).startsWith(path.resolve(root)), nasty).toBe(true);
    }

    const slugs = [...FEATURE_CATEGORIES, ...LIVE_QA_PATHWAYS.map((entry) => entry.id)].map(
      targetSlug
    );
    expect(new Set(slugs).size, 'two targets must not share a directory').toBe(slugs.length);
  });
});

describe('last pass', () => {
  it('is the most recent recorded passing run, per target', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'passed' }]);
    writeVitest('2026-10-11T11:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'failed' }], {
      outcome: 'failed',
    });

    const target = buildTargetHistory('vitest', 'AI', readTargetRuns('vitest', 'AI', { root }));
    expect(target.lastRun?.outcome).toBe('failed');
    expect(target.lastRun?.startedAt).toBe('2026-10-11T11:00:00.000Z');
    expect(target.lastPassAt).toBe('2026-10-11T10:00:00.000Z');
  });

  it('is null when nothing has ever passed, rather than a borrowed time', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'works', status: 'failed' }], {
      outcome: 'failed',
    });
    writeUnreported('2026-10-11T10:00:00.000Z', COMMIT_A, 'cancelled');

    const target = buildTargetHistory('vitest', 'AI', readTargetRuns('vitest', 'AI', { root }));
    expect(target.lastPassAt).toBeNull();
    expect(target.runsRecorded).toBe(2);
  });

  it('is per test, from the runs that test appeared in', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [
      { name: 'a', status: 'passed' },
      { name: 'b', status: 'failed' },
    ]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [
      { name: 'a', status: 'failed' },
      { name: 'b', status: 'failed' },
    ]);

    expect(trendFor('__tests__/example.test.ts > example > a')?.lastPassedAt).toBe(
      '2026-10-11T09:00:00.000Z'
    );
    // Never passed in anything recorded, so there is no date to show.
    expect(trendFor('__tests__/example.test.ts > example > b')?.lastPassedAt).toBeNull();
  });
});

describe('a trend is the recorded verdicts', () => {
  it('reads oldest to newest, one point per run the test appeared in', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'failed' }]);
    writeVitest('2026-10-11T11:00:00.000Z', COMMIT_B, [{ name: 'a', status: 'skipped' }]);

    const trend = trendFor('__tests__/example.test.ts > example > a');
    expect(trend?.recent.map((point) => point.status)).toEqual(['passed', 'failed', 'skipped']);
    expect(trend?.recent.map((point) => point.at)).toEqual([
      '2026-10-11T09:00:00.000Z',
      '2026-10-11T10:00:00.000Z',
      '2026-10-11T11:00:00.000Z',
    ]);
    expect(trend?.recent.at(-1)?.commit).toBe(COMMIT_B);
  });

  it('calls a failure newly failing only when the run before it passed', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [
      { name: 'was-green', status: 'passed' },
      { name: 'was-red', status: 'failed' },
    ]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [
      { name: 'was-green', status: 'failed' },
      { name: 'was-red', status: 'failed' },
      { name: 'brand-new', status: 'failed' },
      { name: 'green', status: 'passed' },
    ]);

    const id = (name: string) => `__tests__/example.test.ts > example > ${name}`;
    expect(trendFor(id('was-green'))?.state).toBe('newly-failing');
    expect(trendFor(id('was-red'))?.state).toBe('already-failing');
    // Its only recorded run failed: nothing to have regressed from, so it is
    // neither of the two.
    expect(trendFor(id('brand-new'))?.state).toBe('first-failure');
    expect(trendFor(id('green'))?.state).toBe('passing');
  });

  it('ignores a cancelled run between two real ones', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    writeUnreported('2026-10-11T10:00:00.000Z', COMMIT_A, 'cancelled');
    writeVitest('2026-10-11T11:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'failed' }]);

    const trend = trendFor('__tests__/example.test.ts > example > a');
    // Two points, not three: the cancelled run holds no verdict for this test.
    expect(trend?.recent.map((point) => point.status)).toEqual(['passed', 'failed']);
    expect(trend?.state).toBe('newly-failing');
  });

  it('sorts notable tests first, deterministically', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [
      { name: 'zebra-passing', status: 'passed' },
      { name: 'alpha-was-green', status: 'passed' },
    ]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [
      { name: 'zebra-passing', status: 'passed' },
      { name: 'alpha-was-green', status: 'failed' },
    ]);

    const target = buildTargetHistory('vitest', 'AI', readTargetRuns('vitest', 'AI', { root }));
    expect(target.tests[0]?.name).toBe('alpha-was-green');
    expect(target.tests[0]?.state).toBe('newly-failing');
  });
});

describe('flaky means a pass and a failure at one commit', () => {
  const id = '__tests__/example.test.ts > example > a';

  it('is not one failure', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'failed' }], {
      outcome: 'failed',
    });

    expect(trendFor(id)?.flaky).toBeNull();
    expect(trendFor(id)?.state).toBe('first-failure');
  });

  it('is not a failure after a pass at a different commit', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_B, [{ name: 'a', status: 'failed' }]);

    // A regression, which is a different thing and already has a name.
    expect(trendFor(id)?.flaky).toBeNull();
    expect(trendFor(id)?.state).toBe('newly-failing');
  });

  it('is a pass and a failure at the same commit', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'failed' }]);

    expect(trendFor(id)?.flaky).toEqual({
      commit: COMMIT_A,
      passes: 1,
      failures: 1,
      dirty: false,
    });
  });

  it('says when the evidence came from a dirty tree', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'failed' }], {
      dirty: true,
    });

    // The same sha with uncommitted changes is not necessarily the same code,
    // and the label says so rather than overclaiming.
    expect(trendFor(id)?.flaky?.dirty).toBe(true);
  });

  it('reports the most recent commit when more than one qualifies', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'failed' }]);
    writeVitest('2026-10-11T11:00:00.000Z', COMMIT_B, [{ name: 'a', status: 'failed' }]);
    writeVitest('2026-10-11T12:00:00.000Z', COMMIT_B, [{ name: 'a', status: 'passed' }]);

    expect(trendFor(id)?.flaky?.commit).toBe(COMMIT_B);
  });

  it('cannot be produced by a cancelled or broken run', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    const outcomes = ['cancelled', 'timed-out', 'runner-failed', 'report-unreadable'] as const;
    outcomes.forEach((outcome, index) => {
      writeUnreported(`2026-10-11T1${index}:00:00.000Z`, COMMIT_A, outcome);
    });

    expect(trendFor(id)?.flaky).toBeNull();
    expect(trendFor(id)?.state).toBe('passing');
  });

  it('cannot be produced without a commit to attribute it to', () => {
    writeVitest('2026-10-11T09:00:00.000Z', null, [{ name: 'a', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', null, [{ name: 'a', status: 'failed' }]);

    // Both runs happened, and nothing says they ran the same code.
    expect(trendFor(id)?.flaky).toBeNull();
    expect(trendFor(id)?.recent).toHaveLength(2);
  });

  it('keeps the reporter’s flaky apart from the history’s', () => {
    recordLiveQaRun(
      pathwayResult({ outcome: 'failed', cases: [{ name: 'retried', status: 'flaky' }] }),
      { runId: nextRunId(), startedAt: '2026-10-11T09:00:00.000Z' },
      { root, enabled: true, commit: () => commit(COMMIT_A) }
    );

    const target = buildTargetHistory(
      'live-qa',
      PATHWAY,
      readTargetRuns('live-qa', PATHWAY, { root })
    );
    const trend = target.tests[0];

    // Playwright retried and it passed: that is the reporter's observation, and
    // it is not the same claim as a pass and a failure at one commit.
    expect(trend?.reporterFlakyAt).toBe('2026-10-11T09:00:00.000Z');
    expect(trend?.flaky).toBeNull();
  });

  it('does not come from retries, durations or a slow run', () => {
    const source = read(HISTORY);

    // The rule reads two things and nothing else: the verdict and the commit.
    expect(source).not.toMatch(/durationMs[^\n]*flak/i);
    expect(source).not.toMatch(/retr(y|ies)\s*[>=]/i);
    expect(source).toContain('point.status');
  });
});

describe('test identity', () => {
  it('keeps the same name in two files apart', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [
      { file: '__tests__/one.test.ts', name: 'works', status: 'passed' },
      { file: '__tests__/two.test.ts', name: 'works', status: 'failed' },
    ]);

    const target = buildTargetHistory('vitest', 'AI', readTargetRuns('vitest', 'AI', { root }));
    expect(target.tests).toHaveLength(2);
    expect(target.tests.map((trend) => trend.id).sort()).toEqual([
      '__tests__/one.test.ts > example > works',
      '__tests__/two.test.ts > example > works',
    ]);
  });

  it('keeps the same name in two suites of one file apart', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [
      { suite: ['outer', 'first'], name: 'works', status: 'passed' },
      { suite: ['outer', 'second'], name: 'works', status: 'failed' },
    ]);

    const target = buildTargetHistory('vitest', 'AI', readTargetRuns('vitest', 'AI', { root }));
    expect(target.tests.map((trend) => trend.id).sort()).toEqual([
      '__tests__/example.test.ts > outer > first > works',
      '__tests__/example.test.ts > outer > second > works',
    ]);
  });

  it('is never an array position', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [
      { name: 'first', status: 'passed' },
      { name: 'second', status: 'passed' },
    ]);
    // The same two tests, reported in the other order.
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [
      { name: 'second', status: 'passed' },
      { name: 'first', status: 'failed' },
    ]);

    const id = (name: string) => `__tests__/example.test.ts > example > ${name}`;
    expect(trendFor(id('first'))?.recent.map((point) => point.status)).toEqual([
      'passed',
      'failed',
    ]);
    expect(trendFor(id('second'))?.recent.map((point) => point.status)).toEqual([
      'passed',
      'passed',
    ]);
  });

  it('builds an identity from identity, not from a count', () => {
    expect(testIdentity({ file: 'a.test.ts', suite: ['x', 'y'], name: 'z' })).toBe(
      'a.test.ts > x > y > z'
    );
    // A Live QA case has no file; its pathway is already the outer suite.
    expect(testIdentity({ file: null, suite: [PATHWAY], name: 'loads' })).toBe(
      `${PATHWAY} > loads`
    );
  });

  it('normalises both reporters into one vocabulary', () => {
    expect(normalizeVitestStatus('passed')).toBe('passed');
    expect(normalizeVitestStatus('failed')).toBe('failed');
    expect(normalizeVitestStatus('todo')).toBe('skipped');
    expect(normalizeVitestStatus('something-new')).toBe('unknown');

    expect(normalizeLiveQaStatus('expected')).toBe('passed');
    expect(normalizeLiveQaStatus('unexpected')).toBe('failed');
    expect(normalizeLiveQaStatus('skipped')).toBe('skipped');
    // The same judgement item 14 makes about a retried pass.
    expect(normalizeLiveQaStatus('flaky')).toBe('failed');
  });
});

describe('nothing sensitive is written down', () => {
  it('stores identity and verdicts, and no secret, path or process detail', () => {
    process.env.FOLLIO_ITEM16_CANARY = 'super-secret-canary-value';
    try {
      const file = recordVitestRun(
        vitestResult({
          tests: [{ name: 'works', status: 'failed' }],
          outcome: 'failed',
          runnerOutput: 'FATAL: token=super-secret-canary-value at C:/Users/padma/.env',
        }),
        { runId: nextRunId(), startedAt: '2026-10-11T09:00:00.000Z' },
        { root, enabled: true, commit: () => commit(COMMIT_A) }
      );
      const raw = readFileSync(file as string, 'utf8');

      // The result carried a stack and runner output; neither is stored.
      expect(raw).not.toContain('super-secret-canary-value');
      expect(raw).not.toContain('AssertionError');
      expect(raw).not.toContain('C:/Users');
      expect(raw).not.toMatch(/sk-|Bearer |clerk|session|pid|taskkill|--reporter/i);

      const record = JSON.parse(raw) as RunHistoryRecord;
      expect(Object.keys(record).sort()).toEqual([
        'commit',
        'durationMs',
        'finishedAt',
        'outcome',
        'ran',
        'runId',
        'runner',
        'startedAt',
        'summary',
        'targetId',
        'tests',
        'version',
      ]);
      expect(Object.keys(record.tests[0]).sort()).toEqual(['file', 'name', 'status', 'suite']);
      // Paths stay repo-relative, as the reporters' output was already made.
      expect(record.tests[0].file).toBe('__tests__/example.test.ts');
    } finally {
      delete process.env.FOLLIO_ITEM16_CANARY;
    }
  });

  it('reads no environment beyond the one switch that keeps tests out of the store', () => {
    const matches = [...read(HISTORY).matchAll(/process\.env\.(\w+)/g)].map((match) => match[1]);

    expect([...new Set(matches)]).toEqual(['NODE_ENV']);
  });

  it('runs git read-only, for the commit alone', () => {
    const source = read(HISTORY);

    expect(source).toContain("git(['rev-parse', 'HEAD'])");
    expect(source).toContain("git(['status', '--porcelain'])");
    // Nothing that could change the repository, and no shell.
    expect(source).not.toMatch(/'(commit|checkout|add|push|reset|clean)'/);
    expect(source).not.toMatch(/shell:\s*true/);

    // And on this repository it really does read a commit.
    const probed = readCommit(process.cwd());
    expect(probed.sha === null || /^[0-9a-f]{40}$/.test(probed.sha)).toBe(true);
    expect(typeof probed.dirty).toBe('boolean');
  });

  it('keeps the store out of git', () => {
    expect(read('.gitignore')).toContain('_admin-panel/platform/.runs/');
  });
});

describe('the view', () => {
  it('lists a target that has never run without inventing history for it', () => {
    const view = buildHistoryView({
      root,
      categories: [{ id: 'AI' }, { id: 'Builder' }],
      pathways: [{ id: PATHWAY }],
      now: () => new Date('2026-10-11T12:00:00.000Z'),
    });

    expect(view.counts).toEqual({
      targetsWithHistory: 0,
      runsRecorded: 0,
      testsWithHistory: 0,
      flaky: 0,
      newlyFailing: 0,
      alreadyFailing: 0,
      withoutRecordedPass: 0,
    });
    expect(view.targets).toHaveLength(3);
    for (const target of view.targets) {
      expect(target.lastRun).toBeNull();
      expect(target.lastPassAt).toBeNull();
      expect(target.tests).toEqual([]);
    }

    const html = renderToStaticMarkup(<TestHistory view={view} />);
    expect(html).toContain('Nothing has been run here yet');
    expect(html).toContain('Never run here');
    // No borrowed time, no invented verdict, no bar and no chart.
    expect(html).not.toMatch(/Last passed \d/);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('%');
  });

  it('shows a target with history, its last pass and each test’s trend', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'failed' }], {
      outcome: 'failed',
    });

    const view = buildHistoryView({
      root,
      categories: [{ id: 'AI' }],
      now: () => new Date('2026-10-11T12:00:00.000Z'),
    });
    const html = renderToStaticMarkup(<TestHistory view={view} />);

    expect(view.counts.flaky).toBe(1);
    expect(view.counts.newlyFailing).toBe(1);
    expect(html).toContain('AI');
    expect(html).toContain('Last passed 2026-10-11T09:00:00.000Z');
    expect(html).toContain('newly failing');
    expect(html).toContain(`flaky · ${COMMIT_A.slice(0, 8)}`);
    expect(html).toContain('Flaky or newly failing (1)');
    // The trend marks themselves, in order, with the run behind each one.
    expect(html).toContain('✓');
    expect(html).toContain('✕');
    expect(html).toContain('title="passed · 2026-10-11T09:00:00.000Z');
    expect(html).toContain('2 runs recorded');
  });

  it('says a test has never passed rather than leaving it blank', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'failed' }], {
      outcome: 'failed',
    });

    const html = renderToStaticMarkup(
      <TestHistory view={buildHistoryView({ root, categories: [{ id: 'AI' }] })} />
    );

    expect(html).toContain('No recorded pass yet');
  });

  it('shows no flaky badge without evidence', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    writeVitest('2026-10-11T10:00:00.000Z', COMMIT_B, [{ name: 'a', status: 'failed' }], {
      outcome: 'failed',
    });

    const html = renderToStaticMarkup(
      <TestHistory view={buildHistoryView({ root, categories: [{ id: 'AI' }] })} />
    );

    expect(html).toContain('newly failing');
    expect(html).not.toContain('flaky · ');
  });

  it('lists recent runs across targets, newest first, with stored values only', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }]);
    writeVitest('2026-10-11T11:00:00.000Z', COMMIT_A, [{ name: 'b', status: 'passed' }], {
      categoryId: 'Builder',
    });

    const view = buildHistoryView({
      root,
      categories: [{ id: 'AI' }, { id: 'Builder' }],
    });

    expect(view.recentRuns.map((run) => run.targetId)).toEqual(['Builder', 'AI']);
    expect(view.recentRuns[0]?.durationMs).toBe(1_234);

    const html = renderToStaticMarkup(<TestHistory view={view} />);
    expect(html).toContain('1234 ms');
    expect(html).toContain(COMMIT_A.slice(0, 8));
  });

  it('keeps a run with no report out of the counts it cannot support', () => {
    writeUnreported('2026-10-11T09:00:00.000Z', COMMIT_A, 'cancelled');

    const view = buildHistoryView({ root, categories: [{ id: 'AI' }] });
    const html = renderToStaticMarkup(<TestHistory view={view} />);

    expect(view.counts.runsRecorded).toBe(1);
    expect(view.counts.testsWithHistory).toBe(0);
    expect(view.targets[0]?.lastPassAt).toBeNull();
    expect(html).toContain('no report — nothing to count');
  });

  it('still shows a target whose history outlived the map', () => {
    writeVitest('2026-10-11T09:00:00.000Z', COMMIT_A, [{ name: 'a', status: 'passed' }], {
      categoryId: 'Retired',
    });

    const view = buildHistoryView({ root, categories: [{ id: 'AI' }] });

    // Discovered from the records, where the real id is stored — never
    // reconstructed from the directory name.
    expect(view.targets.map((target) => target.targetId)).toContain('Retired');
  });
});

describe('the boundary holds', () => {
  it('keeps the filesystem out of the view', () => {
    const view = read(HISTORY_VIEW);

    expect(view).not.toMatch(/from 'node:/);
    expect(view).not.toMatch(/readFileSync\(|readdirSync\(|writeFileSync\(/);
    expect(view).not.toMatch(/from '\.\.\/tests\/history'/);
    expect(view).toMatch(/import type \{[\s\S]*?\} from '\.\.\/tests\/history-types'/);
    expect(view).not.toContain("'use client'");

    // And the client-safe types reach for nothing either.
    expect(read(HISTORY_TYPES)).not.toMatch(/from 'node:|process\./);
  });

  it('reads the store in the route and passes the view down as data', () => {
    const page = read(TESTS_PAGE);

    expect(page).toContain('buildHistoryView(');
    expect(page).toContain('historyPanel=');
    expect(page).toMatch(/await requireAdmin\(\)/);
    // Still a thin shim: no markup, no logic, no filesystem of its own.
    expect(page).not.toMatch(/className=/);
    expect(page).not.toMatch(/readFileSync|readdirSync/);
    // Admin-only, like every other platform surface, and server-side only.
    expect(read(CONSOLE_COMPONENT)).toContain('historyPanel');
    expect(read(CONSOLE_COMPONENT)).not.toMatch(/from '\.\.\/tests\/history'/);
  });

  it('exposes no route that serves the history file', () => {
    // Walked, not named: the directory comes from a variable so the drift
    // scan's `source-text` rule reads this for what it is — a test that
    // discovers files, not one asserting on a particular source file.
    const routes = path.join(process.cwd(), PLATFORM_ROUTES_DIR);
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else found.push(path.join(dir, entry.name));
      }
    };
    walk(routes);

    for (const file of found) {
      const source = readFileSync(file, 'utf8');
      // No route reads the store, and none takes a path from a caller.
      expect(source, `${file} must not read history from the filesystem`).not.toMatch(
        /\.runs|readTargetRuns|buildHistoryView/
      );
    }
  });

  it('leaves item 15 and the old developer panel as they were', async () => {
    // The lock still refuses a second run, and history did not get into it.
    // Matched against imports and calls, not prose: that module's comment says
    // why history is not its business.
    const execution = read('_admin-panel/platform/tests/execution.ts');
    expect(execution).not.toMatch(/from '\.\/history/);
    expect(execution).not.toMatch(/record(Vitest|LiveQa)Run|readTargetRuns|writeFileSync/);
    expect(read(RUNNER)).toContain('withRun(');
    expect(read(LIVE_QA_MODULE)).toContain('withRun(');

    for (const modulePath of [
      'app/api/admin/developer/test/route.ts',
      'app/api/admin/developer/live-qa/run/route.ts',
      '_admin-panel/modules/developer/suites.ts',
      '_admin-panel/modules/developer/ui/DevtoolsPanel.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), modulePath)), modulePath).toBe(true);
      expect(read(modulePath), `${modulePath} must not know about history`).not.toMatch(
        /platform\/tests|\.runs/
      );
    }

    // And the old runner still writes no history of its own.
    expect(read('_admin-panel/modules/developer/suites.ts')).not.toMatch(/history/i);
  });

  it('adds no dependency and no database', () => {
    const source = read(HISTORY);
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

    for (const specifier of imports) {
      expect(
        specifier.startsWith('.') || specifier.startsWith('node:'),
        `${specifier} is neither relative nor a node builtin`
      ).toBe(true);
    }
    // Matched against use, not prose: the module's own comment states that
    // this is the no-Prisma, no-production-persistence option.
    expect(source).not.toMatch(
      /\bPrismaClient\b|lib\/db|localStorage\.|sessionStorage\.|indexedDB/
    );
  });
});
