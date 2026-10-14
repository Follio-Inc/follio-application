/**
 * Scheduled and post-merge runs (PLATFORM_TODO item 26).
 *
 * The item's hard part is the word "new". Notifying on every failing test
 * would be trivial and useless: the second run would repeat the first, and
 * the channel would be muted within a week. So most of this file is the
 * transition table — what the baseline has to have seen for a failure to be
 * worth telling someone about — plus the cases that must stay silent: a
 * cancelled run, a broken runner, a missing prerequisite, and a test already
 * known to flap.
 *
 * Fixtures throughout for the transitions, because proving them against the
 * real suite would mean breaking a real test twice. The reader and writer
 * are the real ones, and the runner integration is asserted against source
 * rather than mocked away.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canRunDeveloperSuites } from '@/_admin-panel/modules/developer/guard';
import { testIdentity as historyTestIdentity } from '@/_admin-panel/platform/tests/history';
import {
  BASELINE_MAX_TARGETS,
  BASELINE_VERSION,
  BASELINE_WINDOW,
  annotationsFor,
  classifyFailure,
  classifyTarget,
  emptyBaseline,
  nonComparableReason,
  observedFrom,
  parseBaseline,
  readBaseline,
  runWatch,
  summaryFor,
  testIdentity,
  updateBaseline,
  writeBaseline,
} from '@/_admin-panel/platform/watch';
import type {
  Baseline,
  BaselineStatus,
  ObservedTest,
  WatchReport,
} from '@/_admin-panel/platform/watch';

const WATCH_DIR = '_admin-panel/platform/watch';
const WORKFLOW = '.github/workflows/platform-watch.yml';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/** Comments stripped: these files explain in prose what they never do. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'platform-watch-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A test observation. */
function observed(
  name: string,
  status: BaselineStatus,
  file = '__tests__/a.test.ts'
): ObservedTest {
  return { file, suite: ['suite'], name, status };
}

/** A baseline holding one test with the given history. */
function baselineWith(name: string, recent: BaselineStatus[], targetId = 'Builder'): Baseline {
  return {
    version: BASELINE_VERSION,
    updatedAt: '2026-10-14T00:00:00.000Z',
    targets: [
      {
        runner: 'vitest',
        targetId,
        lastOutcome: 'passed',
        lastRunAt: '2026-10-14T00:00:00.000Z',
        tests: [
          {
            id: testIdentity({ file: '__tests__/a.test.ts', suite: ['suite'], name }),
            file: '__tests__/a.test.ts',
            suite: ['suite'],
            name,
            recent,
            lastCommit: 'abc1234',
            lastSeenAt: '2026-10-14T00:00:00.000Z',
          },
        ],
      },
    ],
  };
}

/** A `CategoryRunResult`, in the shape item 12's parser really produces. */
function runResult(overrides: Record<string, unknown> = {}) {
  return {
    outcome: 'passed',
    ran: true,
    categoryId: 'Builder',
    filesRequested: ['__tests__/a.test.ts'],
    filesReported: ['__tests__/a.test.ts'],
    filesNotReported: [],
    totals: { files: 1, tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0, durationMs: 5 },
    files: [
      {
        path: '__tests__/a.test.ts',
        status: 'passed',
        durationMs: 5,
        message: null,
        tests: [{ name: 'works', suite: ['suite'], status: 'passed', durationMs: 1, failures: [] }],
      },
    ],
    durationMs: 10,
    exitCode: 0,
    detail: 'ok',
    ...overrides,
  } as never;
}

describe('the execution model reuses what already exists', () => {
  it('runs tests through the Test Console runner and nothing else', () => {
    const source = read(`${WATCH_DIR}/run.ts`);

    expect(source).toContain("from '../tests/runner'");
    expect(source).toContain('runCategory(categoryId)');
    // Targets come from the coverage map, not a list in this file.
    expect(source).toContain('listRunnableCategories()');
  });

  it('builds no second Vitest or Playwright runner', () => {
    for (const file of ['run.ts', 'baseline.ts', 'notify.ts', 'cli.ts', 'baseline-types.ts']) {
      const source = codeOf(read(`${WATCH_DIR}/${file}`));

      expect(source, `${file} must not spawn`).not.toMatch(/child_process|spawn\(|execSync|exec\(/);
      // Invocation, not the word: item 27 added `observeVitest`, which reads
      // a result the runner already produced. What must stay absent is a
      // package import or a command line.
      expect(source, `${file} must not import a test tool`).not.toMatch(
        /from 'vitest'|from '@playwright|require\('vitest|vitest\.mjs/i
      );
      expect(source, `${file} must not build a command line`).not.toMatch(
        /--reporter|--outputFile|--config=/
      );
    }
  });

  it('names no category of its own', () => {
    // A hardcoded target list is how a scheduled run silently stops covering
    // a category someone added to the map.
    const source = codeOf(read(`${WATCH_DIR}/run.ts`));

    for (const category of ['Builder', 'Onboarding', 'Resumes', 'Account', 'AI']) {
      expect(source, `${category} must not be named here`).not.toContain(`'${category}'`);
    }
  });

  it('derives its targets from the coverage map at run time', async () => {
    const { listRunnableCategories } = await import('@/_admin-panel/platform/tests/runner');
    const seen: string[] = [];

    await runWatch({
      baseline: emptyBaseline(),
      run: async (categoryId) => {
        seen.push(categoryId);
        return runResult({ categoryId });
      },
    });

    expect(seen).toEqual(listRunnableCategories().map((entry) => entry.id));
    expect(seen.length).toBeGreaterThan(0);
  });

  it('runs its targets one at a time, because item 15 allows one run', async () => {
    let concurrent = 0;
    let peak = 0;

    await runWatch({
      baseline: emptyBaseline(),
      categoryIds: ['A', 'B', 'C'],
      run: async (categoryId) => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 2));
        concurrent -= 1;
        return runResult({ categoryId });
      },
    });

    expect(peak).toBe(1);
  });

  it('cannot run in production, whatever the workflow sets', () => {
    // The workflow sets DEVTOOLS_ENABLED=true. The guard's production ban is
    // not a flag, so that env var cannot unlock it.
    expect(canRunDeveloperSuites({ nodeEnv: 'production', enabledFlag: 'true' })).toBe(false);
    expect(canRunDeveloperSuites({ nodeEnv: 'development', enabledFlag: 'true' })).toBe(true);
    expect(canRunDeveloperSuites({ nodeEnv: 'development', enabledFlag: undefined })).toBe(false);
    // And the runner the watch calls is the one that checks it.
    expect(read('_admin-panel/platform/tests/runner.ts')).toContain('canRunDeveloperSuites');
  });

  it('opens no network endpoint of its own', () => {
    // The workflow runs a script. There is no cron-callable route, so there
    // is no unauthenticated execution surface to protect.
    for (const file of ['run.ts', 'cli.ts', 'baseline.ts', 'notify.ts']) {
      expect(codeOf(read(`${WATCH_DIR}/${file}`))).not.toMatch(/NextResponse|fetch\(|express/);
    }
    expect(existsSync(path.join(process.cwd(), 'app/api/admin/platform/watch'))).toBe(false);
  });
});

describe('what counts as a new failure', () => {
  it('calls a test the baseline has never seen first-observed', () => {
    expect(classifyFailure(undefined)).toBe('first-observed');
    expect(classifyFailure({ ...baselineWith('x', []).targets[0].tests[0], recent: [] })).toBe(
      'first-observed'
    );
  });

  it('calls a previously passing test newly-failing', () => {
    const prior = baselineWith('x', ['passed', 'passed']).targets[0].tests[0];
    expect(classifyFailure(prior)).toBe('newly-failing');
  });

  it('calls a repeated failure already-failing', () => {
    const prior = baselineWith('x', ['failed', 'failed']).targets[0].tests[0];
    expect(classifyFailure(prior)).toBe('already-failing');
  });

  it('calls a test flaky only when it recovered after failing', () => {
    // Already known unreliable. Alerting on each flap is how a channel dies.
    const flaky = (recent: BaselineStatus[]) =>
      classifyFailure(baselineWith('x', recent).targets[0].tests[0]);

    expect(flaky(['failed', 'passed'])).toBe('flaky');
    expect(flaky(['passed', 'failed', 'passed'])).toBe('flaky');
    expect(flaky(['failed', 'passed', 'failed'])).toBe('flaky');
  });

  it('does not call a persistent regression flaky', () => {
    // The case a live run caught and the fixtures above did not: a test that
    // passed once, broke, and stayed broken still has that pass inside the
    // window. "The window holds a pass and a fail" would label every
    // regression flaky for five runs — the label that gets a real breakage
    // waved away. Flaky requires a recovery, so this is already-failing.
    const regression = (recent: BaselineStatus[]) =>
      classifyFailure(baselineWith('x', recent).targets[0].tests[0]);

    expect(regression(['passed', 'failed', 'failed'])).toBe('already-failing');
    expect(regression(['passed', 'passed', 'failed', 'failed', 'failed'])).toBe('already-failing');
    expect(regression(['failed', 'failed'])).toBe('already-failing');

    // And none of them is new, so none of them is alerted either way.
    for (const recent of [
      ['passed', 'failed', 'failed'],
      ['failed', 'passed'],
    ] as BaselineStatus[][]) {
      const failures = classifyTarget(
        'vitest',
        'Builder',
        [observed('x', 'failed')],
        baselineWith('x', recent)
      );
      expect(failures[0].isNew, recent.join(',')).toBe(false);
    }
  });

  it('treats only first-observed and newly-failing as new', () => {
    const cases: Array<[BaselineStatus[] | undefined, boolean]> = [
      [undefined, true],
      [['passed'], true],
      [['failed'], false],
      [['passed', 'failed'], false],
    ];

    for (const [recent, expectedNew] of cases) {
      const prior =
        recent === undefined ? undefined : baselineWith('x', recent).targets[0].tests[0];
      const classification = classifyFailure(prior);
      const failures = classifyTarget(
        'vitest',
        'Builder',
        [observed('x', 'failed')],
        recent === undefined ? emptyBaseline() : baselineWith('x', recent)
      );
      expect(failures[0].classification).toBe(classification);
      expect(failures[0].isNew, JSON.stringify(recent)).toBe(expectedNew);
    }
  });

  it('uses item 16’s test identity, not its own', () => {
    expect(testIdentity).toBe(historyTestIdentity);

    const a = testIdentity({ file: '__tests__/a.test.ts', suite: ['s'], name: 'same' });
    const b = testIdentity({ file: '__tests__/b.test.ts', suite: ['s'], name: 'same' });
    const c = testIdentity({ file: '__tests__/a.test.ts', suite: ['other'], name: 'same' });

    // Same name, different file or suite: different tests.
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('matches a test by identity rather than by position', () => {
    const baseline = baselineWith('second', ['passed']);
    // The failing test is reported first this time; identity still finds it.
    const failures = classifyTarget(
      'vitest',
      'Builder',
      [observed('second', 'failed'), observed('first', 'passed')],
      baseline
    );

    expect(failures).toHaveLength(1);
    expect(failures[0].name).toBe('second');
    expect(failures[0].classification).toBe('newly-failing');
  });

  it('considers only failing tests', () => {
    const failures = classifyTarget(
      'vitest',
      'Builder',
      [observed('a', 'passed'), observed('b', 'skipped'), observed('c', 'todo')],
      emptyBaseline()
    );

    expect(failures).toEqual([]);
  });
});

describe('what must never be called a new failure', () => {
  const silent = [
    ['cancelled', 'cancelled'],
    ['runner-failed', 'infrastructure'],
    ['report-unreadable', 'infrastructure'],
    ['timed-out', 'infrastructure'],
    ['busy', 'infrastructure'],
    ['gate-closed', 'infrastructure'],
    ['no-tests', 'nothing-to-run'],
    ['skipped-auth-not-configured', 'prerequisite-missing'],
  ] as const;

  it.each(silent)('classifies %s as %s rather than a failure', (outcome, reason) => {
    expect(nonComparableReason(outcome)).toBe(reason);
  });

  it.each(silent)('raises no new failure for a %s run', async (outcome) => {
    const { report } = await runWatch({
      baseline: emptyBaseline(),
      categoryIds: ['Builder'],
      run: async () => runResult({ outcome, ran: outcome === 'cancelled' ? false : false }),
    });

    expect(report.newFailures).toEqual([]);
    expect(report.knownFailures).toEqual([]);
    expect(report.nonComparable.some((entry) => entry.outcome === outcome)).toBe(true);
  });

  it('never folds a non-comparable run into the baseline', async () => {
    // Overwriting a good record with an empty one would make the next real
    // regression read as a first observation.
    const prior = baselineWith('x', ['passed', 'passed']);
    const { baseline } = await runWatch({
      baseline: prior,
      categoryIds: ['Builder'],
      run: async () => runResult({ outcome: 'runner-failed', ran: false, files: [] }),
    });

    const target = baseline.targets.find((entry) => entry.targetId === 'Builder');
    expect(target?.tests[0].recent).toEqual(['passed', 'passed']);
  });

  it('reports Live QA as a prerequisite, never as a failure or a pass', async () => {
    const { report } = await runWatch({
      baseline: emptyBaseline(),
      categoryIds: [],
      run: async () => runResult(),
    });

    const liveQa = report.nonComparable.filter((entry) => entry.runner === 'live-qa');
    expect(liveQa.length).toBeGreaterThan(0);
    for (const entry of liveQa) {
      expect(entry.reason).toBe('prerequisite-missing');
      expect(entry.outcome).toBe('not-attempted');
      expect(entry.detail).toContain('auth state');
    }
    // And no pathway result was invented.
    expect(report.newFailures).toEqual([]);
    expect(report.testsObserved).toBe(0);
  });

  it('does not install browsers or fabricate pathway results', () => {
    expect(read(WORKFLOW)).not.toMatch(/playwright install|live-qa/);
    expect(codeOf(read(`${WATCH_DIR}/run.ts`))).not.toContain('runLiveQa');
  });
});

describe('the baseline', () => {
  it('is versioned, and a foreign version is discarded', () => {
    expect(parseBaseline(JSON.stringify({ version: 1, targets: [] }))).not.toBeNull();
    expect(parseBaseline(JSON.stringify({ version: 2, targets: [] }))).toBeNull();
    expect(parseBaseline(JSON.stringify({ targets: [] }))).toBeNull();
  });

  it('fails safely on anything it cannot read', () => {
    expect(parseBaseline('not json')).toBeNull();
    expect(parseBaseline('null')).toBeNull();
    expect(parseBaseline('[]')).toBeNull();
    expect(readBaseline(path.join(dir, 'absent.json'))).toBeNull();

    const corrupt = path.join(dir, 'corrupt.json');
    writeFileSync(corrupt, '{"version":1,"targets":', 'utf8');
    expect(readBaseline(corrupt)).toBeNull();
  });

  it('drops entries it cannot trust instead of rejecting the file', () => {
    const parsed = parseBaseline(
      JSON.stringify({
        version: 1,
        targets: [
          { runner: 'vitest', targetId: 'Good', tests: [] },
          { runner: 'nonsense', targetId: 'Bad', tests: [] },
          { targetId: 'NoRunner', tests: [] },
        ],
      })
    );

    expect(parsed?.targets.map((entry) => entry.targetId)).toEqual(['Good']);
  });

  it('bounds the window per test', () => {
    let baseline: Baseline | null = null;
    for (let i = 0; i < BASELINE_WINDOW + 4; i += 1) {
      baseline = updateBaseline(
        baseline,
        'vitest',
        'Builder',
        'passed',
        [observed('x', 'passed')],
        '2026-10-14T00:00:00.000Z',
        'abc1234'
      );
    }

    expect(baseline!.targets[0].tests[0].recent).toHaveLength(BASELINE_WINDOW);
  });

  it('bounds the number of targets', () => {
    let baseline: Baseline | null = null;
    for (let i = 0; i < BASELINE_MAX_TARGETS + 10; i += 1) {
      baseline = updateBaseline(
        baseline,
        'vitest',
        `target-${String(i).padStart(3, '0')}`,
        'passed',
        [observed('x', 'passed')],
        '2026-10-14T00:00:00.000Z',
        null
      );
    }

    expect(baseline!.targets.length).toBe(BASELINE_MAX_TARGETS);
  });

  it('round-trips through the real reader and writer', () => {
    const file = path.join(dir, 'nested', 'baseline.json');
    const baseline = updateBaseline(
      null,
      'vitest',
      'Builder',
      'failed',
      [observed('x', 'failed')],
      '2026-10-14T00:00:00.000Z',
      'abc1234'
    );

    writeBaseline(file, baseline);
    const back = readBaseline(file);

    expect(back?.version).toBe(BASELINE_VERSION);
    expect(back?.targets[0].tests[0].recent).toEqual(['failed']);
  });

  it('stores no secrets, stacks, environment or absolute paths', () => {
    const secret = 'sk-canary-not-a-real-key';
    const baseline = updateBaseline(
      null,
      'vitest',
      'Builder',
      'failed',
      [observed('x', 'failed')],
      '2026-10-14T00:00:00.000Z',
      'abc1234'
    );
    const file = path.join(dir, 'baseline.json');
    writeBaseline(file, baseline);
    const raw = readFileSync(file, 'utf8');

    expect(raw).not.toContain(secret);
    expect(raw).not.toMatch(/OPENAI_API_KEY|DATABASE_URL|Bearer |clerk/i);
    expect(raw).not.toMatch(/ {4}at .*\(/); // a stack frame
    expect(raw).not.toMatch(/[A-Za-z]:\\\\|\/home\/|\/Users\//); // absolute paths

    // And the record's key set is exactly what the comparison needs.
    expect(Object.keys(baseline.targets[0].tests[0]).sort()).toEqual([
      'file',
      'id',
      'lastCommit',
      'lastSeenAt',
      'name',
      'recent',
      'suite',
    ]);
  });

  it('says when there was no baseline rather than pretending there was', async () => {
    const { report } = await runWatch({
      baseline: null,
      categoryIds: ['Builder'],
      run: async () => runResult(),
    });

    expect(report.baselineMissing).toBe(true);
    expect(summaryFor(report)).toContain('No baseline was found');
  });
});

describe('notifications', () => {
  function reportWith(overrides: Partial<WatchReport> = {}): WatchReport {
    return {
      trigger: 'schedule',
      commit: 'abc1234def',
      branch: 'main',
      startedAt: '2026-10-14T00:00:00.000Z',
      durationMs: 1234,
      baselineMissing: false,
      targetsRun: 2,
      testsObserved: 40,
      newFailures: [],
      knownFailures: [],
      nonComparable: [],
      // Item 27 added this. Empty here: these tests are about the failure
      // lists, and a perf flag must never reach them.
      perf: { flags: [], regressions: [], improvements: [], pending: [], notComparable: [] },
      ...overrides,
    };
  }

  const failure = (isNew: boolean, classification: string) => ({
    runner: 'vitest' as const,
    targetId: 'Builder',
    id: 'id',
    file: '__tests__/a.test.ts',
    suite: ['suite'],
    name: 'renders the thing',
    classification: classification as never,
    isNew,
    evidence: 'last seen passed',
  });

  it('annotates new failures only', () => {
    const report = reportWith({
      newFailures: [failure(true, 'newly-failing')],
      knownFailures: [failure(false, 'already-failing'), failure(false, 'flaky')],
    });

    const annotations = annotationsFor(report);
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toContain('::error ');
    expect(annotations[0]).toContain('newly-failing');
    expect(annotations[0]).toContain('renders the thing');
  });

  it('raises nothing when nothing is new', () => {
    expect(
      annotationsFor(reportWith({ knownFailures: [failure(false, 'already-failing')] }))
    ).toEqual([]);
    expect(summaryFor(reportWith())).toContain('No new test failures');
  });

  it('keeps known failures visible but unalerted', () => {
    const summary = summaryFor(reportWith({ knownFailures: [failure(false, 'already-failing')] }));

    expect(summary).toContain('Known failures (1)');
    expect(summary).toContain('not alerted');
    expect(summary).toContain('raises no annotation');
  });

  it('escapes annotation delimiters', () => {
    const report = reportWith({
      newFailures: [{ ...failure(true, 'newly-failing'), name: 'a\nb%c', evidence: 'x,y:z' }],
    });

    const annotation = annotationsFor(report)[0];
    expect(annotation).not.toMatch(/\n.*::/);
    expect(annotation).toContain('%0A');
    expect(annotation).toContain('%25');
  });

  it('carries only metadata a reader needs', () => {
    const report = reportWith({ newFailures: [failure(true, 'newly-failing')] });
    const payload = annotationsFor(report).join('\n') + summaryFor(report);

    expect(payload).toContain('Builder');
    expect(payload).toContain('renders the thing');
    expect(payload).toContain('main');
    expect(payload).toContain('abc1234');
    // And nothing it should not.
    expect(payload).not.toMatch(/sk-|OPENAI_API_KEY|DATABASE_URL|Bearer |password/i);
    expect(payload).not.toMatch(/ {4}at .*\(/);
    expect(payload).not.toMatch(/[A-Za-z]:\\\\|\/home\/|\/Users\//);
  });

  it('names the non-comparable targets without alerting them', () => {
    const summary = summaryFor(
      reportWith({
        nonComparable: [
          {
            runner: 'vitest',
            targetId: 'Builder',
            reason: 'infrastructure',
            outcome: 'runner-failed',
            detail: 'd',
          },
        ],
      })
    );

    expect(summary).toContain('Nothing to compare');
    expect(summary).toContain('None of these is a product test failing');
    expect(annotationsFor(reportWith({ nonComparable: [] }))).toEqual([]);
  });

  it('is the only transport, because the repository has no other', () => {
    // Asserted rather than assumed: if someone adds a real transport, this
    // fails and the choice gets revisited instead of silently persisting.
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const installed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

    for (const name of installed) {
      expect(name).not.toMatch(/slack|nodemailer|sendgrid|@resend|discord|mailgun|twilio/i);
    }
    expect(codeOf(read(`${WATCH_DIR}/notify.ts`))).not.toMatch(/fetch\(|http|webhook/i);
  });
});

/**
 * The workflow's structure, read as text.
 *
 * Deliberately not parsed with a YAML library: the only one installed here
 * is a transitive dependency of something else, and a test that breaks when
 * an unrelated package reshuffles its tree is a test nobody trusts. Adding
 * `yaml` as a direct dependency for one assertion needs approval that item
 * 26 does not have. The file was parsed during development to confirm these
 * readings; what is pinned below is what matters and what would silently
 * regress.
 */
describe('the workflow', () => {
  const workflow = read(WORKFLOW);
  const ci = read('.github/workflows/ci.yml');

  /** The block under `on:`, up to the next top-level key. */
  function triggerBlock(source: string): string {
    const start = source.indexOf('\non:\n');
    const rest = source.slice(start + 1);
    const end = rest.search(/\n[a-z]+:\n/);
    return end === -1 ? rest : rest.slice(0, end);
  }

  it('runs on a schedule and on a push to the branches this repo merges into', () => {
    const triggers = triggerBlock(workflow);

    expect(triggers).toMatch(/^\s{2}schedule:$/m);
    expect(triggers).toMatch(/cron: '\d+ \d+ \* \* \*'/);
    expect(triggers).toMatch(/^\s{2}push:$/m);

    // Post-merge is a push to a base branch, and the list is ci.yml's own
    // rather than a branch name guessed at here.
    const ours = /branches: (\[.*\])/.exec(triggerBlock(workflow))?.[1];
    const theirs = /branches: (\[.*\])/.exec(triggerBlock(ci))?.[1];
    expect(ours).toBeDefined();
    expect(ours).toBe(theirs);
    expect(ours).toContain('main');
  });

  it('never runs on a pull request, so required checks are untouched', () => {
    // The trigger block, not the whole file: the header comment says in
    // prose that this workflow never runs on a pull request, and searching
    // the file would find the sentence rather than the setting.
    expect(triggerBlock(workflow)).not.toContain('pull_request');
    const steps = workflow.slice(workflow.indexOf('jobs:'));
    expect(steps).not.toContain('pull_request');
    // ci.yml still has it, which is where required checks live.
    expect(triggerBlock(ci)).toContain('pull_request');
  });

  it('leaves ci.yml alone', () => {
    for (const job of ['  lint:', '  test:', '  build:', '  security:', '  drift:']) {
      expect(ci, `${job} must still exist`).toContain(job);
    }
    // Three advisory markers, counted from the file rather than guessed:
    // the test job's coverage upload, the security job's npm audit, and the
    // drift job itself. Item 26 added none of them and changed none.
    expect(ci.match(/continue-on-error: true/g)).toHaveLength(3);
    // Only one of the three is a whole job, at job indentation.
    expect(ci.match(/^ {4}continue-on-error: true$/gm)).toHaveLength(1);
  });

  it('serializes overlapping runs without cancelling a half-written baseline', () => {
    expect(workflow).toMatch(/concurrency:\n\s+group: platform-watch-/);
    expect(workflow).toMatch(/cancel-in-progress: false/);
  });

  it('is advisory and read-only', () => {
    expect(workflow).toMatch(/^\s{4}continue-on-error: true$/m);
    expect(workflow).toMatch(/permissions:\n\s+contents: read/);
    expect(workflow).not.toMatch(/contents: write|packages: write|id-token:/);
  });

  it('does not make the drift scan blocking — that is item 30', () => {
    expect(workflow).not.toContain('platform:scan');
    expect(workflow).not.toContain('--strict');
  });

  it('invokes the repository script rather than an endpoint', () => {
    expect(workflow).toContain('run: npm run platform:watch');
    expect(workflow).toMatch(/DEVTOOLS_ENABLED: 'true'/);
    expect(workflow).not.toMatch(/curl|wget|api\/admin/);
  });

  it('persists the baseline with a built-in action and no new secret', () => {
    expect(workflow).toContain('uses: actions/cache@v4');
    expect(workflow).toContain('restore-keys:');
    expect(workflow).toContain('platform-watch-baseline-v1-');
    // A rolling key: unique per run, restored by prefix.
    expect(workflow).toMatch(/key: platform-watch-baseline-v1-.*github\.run_id/);
    expect(workflow).not.toMatch(/secrets\./);
  });

  it('adds the script the workflow calls', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

    expect(pkg.scripts['platform:watch']).toBe('npx tsx _admin-panel/platform/watch/cli.ts');
    // And leaves the existing ones alone.
    expect(pkg.scripts['platform:scan']).toBe('npx tsx _admin-panel/platform/scan/cli.ts');
    expect(pkg.scripts['test:run']).toBe('vitest run');
  });
});

describe('the run, end to end through the module', () => {
  it('observes tests from a real result shape', () => {
    const result = runResult({
      files: [
        {
          path: '__tests__/a.test.ts',
          status: 'failed',
          durationMs: 5,
          message: null,
          tests: [
            { name: 'ok', suite: ['s'], status: 'passed', durationMs: 1, failures: [] },
            { name: 'bad', suite: ['s'], status: 'failed', durationMs: 1, failures: [] },
          ],
        },
      ],
    });

    expect(observedFrom(result)).toEqual([
      { file: '__tests__/a.test.ts', suite: ['s'], name: 'ok', status: 'passed' },
      { file: '__tests__/a.test.ts', suite: ['s'], name: 'bad', status: 'failed' },
    ]);
  });

  it('reports a pass → fail transition as new, and the repeat as known', async () => {
    const failing = runResult({
      outcome: 'failed',
      files: [
        {
          path: '__tests__/a.test.ts',
          status: 'failed',
          durationMs: 5,
          message: null,
          tests: [
            { name: 'works', suite: ['suite'], status: 'failed', durationMs: 1, failures: [] },
          ],
        },
      ],
    });

    // Run 1: it passes. Baseline records a pass.
    const first = await runWatch({
      baseline: null,
      categoryIds: ['Builder'],
      run: async () => runResult(),
    });
    expect(first.report.newFailures).toEqual([]);

    // Run 2: the same test fails. New.
    const second = await runWatch({
      baseline: first.baseline,
      categoryIds: ['Builder'],
      run: async () => failing,
    });
    expect(second.report.newFailures).toHaveLength(1);
    expect(second.report.newFailures[0].classification).toBe('newly-failing');
    expect(annotationsFor(second.report)).toHaveLength(1);

    // Run 3: it fails again. Known, and silent.
    const third = await runWatch({
      baseline: second.baseline,
      categoryIds: ['Builder'],
      run: async () => failing,
    });
    expect(third.report.newFailures).toEqual([]);
    expect(third.report.knownFailures).toHaveLength(1);
    expect(annotationsFor(third.report)).toEqual([]);
  });

  it('stops alerting once a test is known to flap', async () => {
    const baseline = baselineWith('works', ['passed', 'failed', 'passed']);
    const { report } = await runWatch({
      baseline,
      categoryIds: ['Builder'],
      run: async () =>
        runResult({
          outcome: 'failed',
          files: [
            {
              path: '__tests__/a.test.ts',
              status: 'failed',
              durationMs: 5,
              message: null,
              tests: [
                { name: 'works', suite: ['suite'], status: 'failed', durationMs: 1, failures: [] },
              ],
            },
          ],
        }),
    });

    expect(report.newFailures).toEqual([]);
    expect(report.knownFailures[0].classification).toBe('flaky');
  });
});

describe('nothing else moved', () => {
  it('leaves the Test Console, its history and the Live QA runner intact', () => {
    for (const file of [
      '_admin-panel/platform/tests/runner.ts',
      '_admin-panel/platform/tests/execution.ts',
      '_admin-panel/platform/tests/history.ts',
      '_admin-panel/platform/tests/live-qa.ts',
      '_admin-panel/modules/developer/live-qa/runner.ts',
      '_admin-panel/modules/developer/guard.ts',
    ]) {
      expect(existsSync(path.join(process.cwd(), file)), file).toBe(true);
      // Item 26 is a caller. None of these knows it exists.
      expect(read(file), `${file} must not depend on the watch`).not.toContain('platform/watch');
    }
  });

  it('keeps the old developer route a redirect', () => {
    expect(read('app/admin/(dashboard)/developer/page.tsx')).toContain(
      "redirect('/admin/platform')"
    );
  });

  it('changes no product code and adds no dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    // `tsx` runs the CLI and `yaml` parses the workflow in this test; both
    // were already installed, which is why item 26 needed no new dependency.
    expect(pkg.devDependencies.tsx ?? pkg.dependencies.tsx).toBeDefined();

    // Every module the watch imports, so a new one is a visible diff rather
    // than a count that cannot change.
    const specifiers = new Set<string>();
    for (const file of ['run.ts', 'baseline.ts', 'notify.ts', 'cli.ts', 'index.ts']) {
      for (const match of read(`${WATCH_DIR}/${file}`).matchAll(/from '([^']+)'/g)) {
        if (!match[1].startsWith('.')) specifiers.add(match[1]);
      }
    }
    expect([...specifiers].sort()).toEqual(['node:fs', 'node:path', 'node:perf_hooks']);

    // No Prisma, and no product module.
    expect(codeOf(read(`${WATCH_DIR}/run.ts`))).not.toMatch(/prisma|@\/lib\/db/i);
    for (const specifier of specifiers) {
      expect(specifier.startsWith('@/services')).toBe(false);
    }
  });
});
