/**
 * Test Console: running one category (PLATFORM_TODO item 12).
 *
 * Item 12's done condition is that a run returns per-test name, duration and
 * status, that a failing test shows its assertion, and that the action is
 * unavailable when `canRunDeveloperSuites()` is false. So the assertions here
 * are about three things: what the server resolves from a category id, what it
 * hands to Vitest, and what it makes of the JSON that comes back.
 *
 * Vitest is not spawned from inside Vitest. The runner takes a `spawner` seam
 * and the tests drive it with real reporter output, which exercises every
 * branch — including the ones a real run would not reach on a healthy tree, and
 * without a nested child process on a machine whose worker pool is already
 * capped for memory. The non-vacuity check is the argv assertion below: the
 * exact files it would hand Vitest are real files on disk that Vitest's own
 * config would collect.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { canRunDeveloperSuites } from '@/_admin-panel/modules/developer/guard';
import { COVERAGE_MAP, FEATURE_CATEGORIES } from '@/_admin-panel/platform/coverage-map';
import type { FeatureCategory, PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import {
  buildTestInventory,
  buildVitestArgs,
  isKnownCategory,
  listRunnableCategories,
  parseVitestReport,
  resolveCategoryTestFiles,
  runCategory,
  type VitestSpawner,
} from '@/_admin-panel/platform/tests';
import type { CategoryRunResult } from '@/_admin-panel/platform/tests';
import { TestRunPanel } from '@/_admin-panel/platform/ui';

const RUN_ROUTE = 'app/api/admin/platform/tests/run/route.ts';
const RUNNER = '_admin-panel/platform/tests/runner.ts';
const PANEL = '_admin-panel/platform/ui/test-run-panel.tsx';
const RUN_HOOK = '_admin-panel/platform/ui/use-run-execution.ts';
const TESTS_PAGE = 'app/admin/(dashboard)/platform/tests/page.tsx';
const REPO_ROOT = 'C:/repo';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'stub',
    name: 'Stub',
    userDescription: 'A stub feature used to exercise the category runner in isolation.',
    codeLocations: ['lib/utils.ts'],
    category: 'Builder',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    ...overrides,
  };
}

/**
 * Vitest JSON reporter output, in the shape the real reporter produces.
 *
 * Taken from an actual `vitest run --reporter=json` run: absolute file name,
 * `assertionResults` with `ancestorTitles`/`title`/`status`/`duration`, and a
 * failure whose first line is the assertion and whose remainder is a stack
 * carrying absolute paths and `file:///` URLs.
 */
function reportFixture({ failing }: { failing: boolean }): string {
  const failure = [
    'AssertionError: expected { a: 1 } to deeply equal { a: 2 }',
    `    at ${REPO_ROOT}/__tests__/example.test.ts:4:22`,
    `    at file:///${REPO_ROOT.replace(/:/g, ':')}/node_modules/@vitest/runner/dist/chunk.js:302:11`,
  ].join('\n');

  return JSON.stringify({
    numTotalTestSuites: 1,
    numPassedTestSuites: failing ? 0 : 1,
    numFailedTestSuites: failing ? 1 : 0,
    numTotalTests: 2,
    numPassedTests: failing ? 1 : 2,
    numFailedTests: failing ? 1 : 0,
    numPendingTests: 0,
    numTodoTests: 0,
    startTime: 1_700_000_000_000,
    success: !failing,
    testResults: [
      {
        name: `${REPO_ROOT}/__tests__/example.test.ts`,
        status: failing ? 'failed' : 'passed',
        startTime: 1_700_000_000_000,
        endTime: 1_700_000_000_450,
        message: '',
        assertionResults: [
          {
            ancestorTitles: ['Example', 'inner'],
            fullName: 'Example inner first case',
            title: 'first case',
            status: failing ? 'failed' : 'passed',
            duration: 7.9973,
            failureMessages: failing ? [failure] : [],
          },
          {
            ancestorTitles: ['Example'],
            fullName: 'Example second case',
            title: 'second case',
            status: 'passed',
            duration: 0.5237,
            failureMessages: [],
          },
        ],
      },
    ],
  });
}

/** A spawner that records its argv and reports a given outcome. */
function fakeSpawner(
  outcome: Partial<Awaited<ReturnType<VitestSpawner>>> = {},
  captured: { args?: string[]; repoRoot?: string } = {}
): VitestSpawner {
  return (args, repoRoot) => {
    captured.args = args;
    captured.repoRoot = repoRoot;
    return Promise.resolve({
      exitCode: 0,
      stderr: '',
      timedOut: false,
      spawnError: null,
      ...outcome,
    });
  };
}

describe('category resolution comes from the coverage map', () => {
  it('accepts only categories the map declares', () => {
    for (const category of FEATURE_CATEGORIES) {
      expect(isKnownCategory(category), category).toBe(true);
    }
    for (const bogus of ['', 'AI ', 'ai', 'Everything', '../../etc/passwd', 'AI;rm -rf /']) {
      expect(isKnownCategory(bogus), bogus).toBe(false);
    }
  });

  it('resolves a category to exactly the files the map lists under it', () => {
    for (const category of FEATURE_CATEGORIES) {
      const expected = [
        ...new Set(
          COVERAGE_MAP.filter((entry) => entry.category === category).flatMap(
            (entry) => entry.unitTests
          )
        ),
      ].sort((a, b) => a.localeCompare(b));

      expect(resolveCategoryTestFiles(category), category).toEqual(expected);
    }
  });

  it('de-duplicates a test two features in one category share', () => {
    const files = resolveCategoryTestFiles('AI', [
      feature({ id: 'one', category: 'AI', unitTests: ['a.test.ts', 'shared.test.ts'] }),
      feature({ id: 'two', category: 'AI', unitTests: ['shared.test.ts', 'b.test.ts'] }),
      feature({ id: 'other', category: 'Builder', unitTests: ['elsewhere.test.ts'] }),
    ]);

    // Handed to Vitest once, and nothing from another category.
    expect(files).toEqual(['a.test.ts', 'b.test.ts', 'shared.test.ts']);
  });

  it('agrees with the item-11 inventory for every category', () => {
    // One source of truth: what the console lists is what the runner runs.
    const inventory = buildTestInventory();

    for (const entry of inventory.categories) {
      const listed = [
        ...new Set(entry.features.flatMap((item) => item.unitTests.map((test) => test.path))),
      ].sort((a, b) => a.localeCompare(b));

      expect(resolveCategoryTestFiles(entry.category), entry.category).toEqual(listed);
    }
  });

  it('offers every category with a file count for the picker', () => {
    const offered = listRunnableCategories();

    expect(offered.map((entry) => entry.id)).toEqual([...FEATURE_CATEGORIES]);
    for (const entry of offered) {
      expect(entry.fileCount).toBe(resolveCategoryTestFiles(entry.id).length);
    }
  });
});

describe('the Vitest invocation', () => {
  it('uses the JSON reporter and an output file, never stdout', () => {
    const args = buildVitestArgs('/tmp/x/report.json', ['__tests__/a.test.ts']);

    expect(args[0]).toBe('run');
    expect(args).toContain('--reporter=json');
    expect(args).toContain('--outputFile=/tmp/x/report.json');
    expect(args).toContain('__tests__/a.test.ts');
    // No watch, no coverage, no shell: `run` plus the reporter plus paths.
    expect(args.filter((arg) => arg.startsWith('--'))).toEqual([
      '--reporter=json',
      '--outputFile=/tmp/x/report.json',
    ]);
  });

  it('would hand Vitest real files for a real category', () => {
    // The non-vacuity check: not a mock in sight. Every path the server would
    // pass for a real category is a file on disk that Vitest's own `include`
    // (`**/*.test.ts`, `**/*.test.tsx`) collects.
    const categoriesWithTests = FEATURE_CATEGORIES.filter(
      (category) => resolveCategoryTestFiles(category).length > 0
    );
    expect(categoriesWithTests.length).toBeGreaterThan(0);

    for (const category of categoriesWithTests) {
      const files = resolveCategoryTestFiles(category);
      const args = buildVitestArgs('/tmp/report.json', files);

      for (const file of files) {
        expect(existsSync(path.join(process.cwd(), file)), `${file} is not on disk`).toBe(true);
        expect(file, `${file} is not a Vitest file`).toMatch(/\.test\.tsx?$/);
        expect(args, `${file} is not in the argv`).toContain(file);
      }
    }
  });

  it('never hands Vitest a Live QA pathway', () => {
    // Pathways are Playwright specs; running them is item 14. Nothing in any
    // category's argv is a spec, and no `pathways` entry leaks into the files.
    const specs = new Set(COVERAGE_MAP.flatMap((entry) => entry.pathways));

    for (const category of FEATURE_CATEGORIES) {
      for (const file of resolveCategoryTestFiles(category)) {
        expect(file).not.toMatch(/\.spec\.ts$/);
        expect(file).not.toContain('live-qa');
        expect(specs).not.toContain(file);
      }
    }
  });

  it('passes the file list the server resolved, not anything from a caller', async () => {
    const captured: { args?: string[] } = {};
    await runCategory('AI', {
      features: [feature({ id: 'one', category: 'AI', unitTests: ['__tests__/a.test.ts'] })],
      canRun: true,
      spawner: fakeSpawner({}, captured),
      readReport: () => reportFixture({ failing: false }),
    });

    expect(captured.args).toEqual([
      'run',
      '--reporter=json',
      expect.stringMatching(/^--outputFile=/),
      '__tests__/a.test.ts',
    ]);
  });
});

describe('the report is parsed, not scraped', () => {
  it('reads per-test name, suite, status and duration', () => {
    const parsed = parseVitestReport(reportFixture({ failing: false }), REPO_ROOT)!;

    expect(parsed.success).toBe(true);
    expect(parsed.totals).toEqual({
      files: 1,
      tests: 2,
      passed: 2,
      failed: 0,
      pending: 0,
      todo: 0,
    });
    expect(parsed.files).toHaveLength(1);

    const file = parsed.files[0];
    // Absolute path from the reporter, repo-relative in the result.
    expect(file.path).toBe('__tests__/example.test.ts');
    expect(file.status).toBe('passed');
    expect(file.durationMs).toBe(450);
    expect(file.message).toBeNull();

    expect(file.tests.map((test) => test.name)).toEqual(['first case', 'second case']);
    expect(file.tests[0].suite).toEqual(['Example', 'inner']);
    expect(file.tests[0].status).toBe('passed');
    expect(file.tests[0].durationMs).toBe(8);
    expect(file.tests[0].failures).toEqual([]);
  });

  it('keeps a failing test\u2019s assertion apart from its stack', () => {
    const parsed = parseVitestReport(reportFixture({ failing: true }), REPO_ROOT)!;
    const failing = parsed.files[0].tests[0];

    expect(parsed.success).toBe(false);
    expect(parsed.totals.failed).toBe(1);
    expect(failing.status).toBe('failed');
    // Item 12's done condition: the assertion is shown.
    expect(failing.failures).toHaveLength(1);
    expect(failing.failures[0].message).toBe(
      'AssertionError: expected { a: 1 } to deeply equal { a: 2 }'
    );
    expect(failing.failures[0].stack).toContain('__tests__/example.test.ts:4:22');
    // And the operator's filesystem layout is not leaked into the UI.
    expect(failing.failures[0].stack).not.toContain(REPO_ROOT);
    expect(failing.failures[0].stack).not.toContain('file:///');
    // The test beside it is untouched.
    expect(parsed.files[0].tests[1].failures).toEqual([]);
  });

  it('counts files from the reported files, not from describe blocks', () => {
    // A real run of one file with eight `describe` blocks reports
    // `numTotalTestSuites: 8`. Reporting that as a file count would be a
    // number that means something else.
    const raw = JSON.parse(reportFixture({ failing: false })) as Record<string, unknown>;
    const parsed = parseVitestReport(JSON.stringify({ ...raw, numTotalTestSuites: 8 }), REPO_ROOT)!;

    expect(parsed.files).toHaveLength(1);
    expect(parsed.totals.files).toBe(1);
  });

  it('refuses output it cannot read instead of guessing', () => {
    expect(parseVitestReport('not json', REPO_ROOT)).toBeNull();
    expect(parseVitestReport('null', REPO_ROOT)).toBeNull();
    expect(parseVitestReport('{"success":true}', REPO_ROOT)).toBeNull();
    // A report with no files is readable and empty, which is not the same.
    expect(parseVitestReport('{"testResults":[]}', REPO_ROOT)?.files).toEqual([]);
  });
});

describe('run outcomes', () => {
  const oneFeature = [feature({ id: 'one', category: 'AI', unitTests: ['__tests__/a.test.ts'] })];
  // The fixture's file names are absolute under REPO_ROOT, so the runner is
  // told that is the root. That is what makes the relativization assertions
  // below mean something.
  const base = { features: oneFeature, canRun: true as const, repoRoot: REPO_ROOT };

  const run = (overrides: Parameters<typeof runCategory>[1] = {}) =>
    runCategory('AI', { ...base, ...overrides });

  it('reports a passing category as a run that passed', async () => {
    const result = await run({
      spawner: fakeSpawner(),
      readReport: () => reportFixture({ failing: false }),
    });

    expect(result.outcome).toBe('passed');
    expect(result.ran).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.filesRequested).toEqual(['__tests__/a.test.ts']);
    expect(result.filesReported).toEqual(['__tests__/example.test.ts']);
    expect(result.detail).toBe('2 tests passed.');
    expect(result.runnerOutput).toBeNull();
  });

  it('reports failing tests as a run, not as a broken runner', async () => {
    const result = await run({
      spawner: fakeSpawner({ exitCode: 1 }),
      readReport: () => reportFixture({ failing: true }),
    });

    expect(result.outcome).toBe('failed');
    // The distinction item 12 has to keep: this run happened.
    expect(result.ran).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.totals?.failed).toBe(1);
    expect(result.detail).toBe('1 of 2 tests failed.');
    expect(result.files[0].tests[0].failures[0].message).toContain('AssertionError');
  });

  it('refuses a category the map does not declare', async () => {
    const result = await runCategory('Everything', base);

    expect(result.outcome).toBe('unknown-category');
    expect(result.ran).toBe(false);
    expect(result.filesRequested).toEqual([]);
    expect(result.detail).toContain('coverage map');
  });

  it('says so when a category has no mapped unit test', async () => {
    const result = await runCategory('AI', {
      features: [feature({ id: 'one', category: 'AI', unitTests: [] })],
      canRun: true,
      spawner: fakeSpawner(),
    });

    expect(result.outcome).toBe('no-tests');
    expect(result.ran).toBe(false);
    expect(result.detail).toContain('nothing to run');
  });

  it('refuses to run when the local-only gate is closed', async () => {
    const captured: { args?: string[] } = {};
    const result = await runCategory('AI', {
      features: oneFeature,
      canRun: false,
      spawner: fakeSpawner({}, captured),
    });

    expect(result.outcome).toBe('gate-closed');
    expect(result.ran).toBe(false);
    // Nothing was spawned, and nothing was even resolved.
    expect(captured.args).toBeUndefined();
    expect(result.detail).toContain('DEVTOOLS_ENABLED');
  });

  it('separates a runner that cannot start from a suite that fails', async () => {
    const result = await run({
      spawner: fakeSpawner({ exitCode: null, spawnError: 'ENOENT', stderr: 'boom' }),
    });

    expect(result.outcome).toBe('runner-failed');
    expect(result.ran).toBe(false);
    expect(result.totals).toBeNull();
    expect(result.detail).toContain('ENOENT');
    expect(result.runnerOutput).toBe('boom');
  });

  it('reports a missing report as unreadable rather than as a pass', async () => {
    const result = await run({
      spawner: fakeSpawner({ exitCode: 0 }),
      readReport: () => {
        throw new Error('ENOENT');
      },
    });

    expect(result.outcome).toBe('report-unreadable');
    expect(result.ran).toBe(false);
    expect(result.totals).toBeNull();
  });

  it('reports malformed JSON as unreadable', async () => {
    const result = await run({
      spawner: fakeSpawner({ exitCode: 0 }),
      readReport: () => '{ not json',
    });

    expect(result.outcome).toBe('report-unreadable');
    expect(result.detail).toContain('cannot read');
  });

  it('reports a killed run as a timeout', async () => {
    const result = await run({
      spawner: fakeSpawner({ exitCode: null, timedOut: true, stderr: 'killed' }),
    });

    expect(result.outcome).toBe('timed-out');
    expect(result.ran).toBe(false);
    expect(result.detail).toContain('stopped after');
  });

  it('uses the real gate by default', async () => {
    // No `canRun` override: the runner asks `canRunDeveloperSuites()` itself.
    // Under Vitest `NODE_ENV` is `test`, which the existing gate allows.
    expect(canRunDeveloperSuites()).toBe(true);

    const result = await runCategory('AI', {
      features: [feature({ id: 'one', category: 'AI', unitTests: [] })],
    });

    expect(result.outcome).toBe('no-tests');
  });
});

describe('the API boundary', () => {
  const source = read(RUN_ROUTE);

  it('requires admin auth and the local-only gate before anything else', () => {
    expect(source).toMatch(/await requireAdmin\(\)/);
    expect(source).toContain('assertCanRunDeveloperSuites()');
    // Order inside the handler, not across the import block at the top.
    const handler = source.slice(source.indexOf('export async function POST'));
    expect(handler.indexOf('requireAdmin')).toBeLessThan(handler.indexOf('runCategory'));
    expect(handler.indexOf('assertCanRunDeveloperSuites')).toBeLessThan(
      handler.indexOf('runCategory')
    );
    expect(handler.indexOf('assertCanRunDeveloperSuites')).toBeLessThan(
      handler.indexOf('request.json')
    );
    // Reuses the existing gate rather than a weaker copy.
    expect(source).toContain("from '@/_admin-panel/modules/developer/guard'");
    expect(source).toContain('DeveloperSuitesDisabledError');
  });

  it('reads only a category id from the request', () => {
    // The whole attack surface is one string, checked against the trusted map.
    expect(source).toMatch(/categoryId\?: unknown/);
    expect(source).toMatch(/typeof body\.categoryId === 'string'/);
    expect(source).toContain('isKnownCategory(categoryId)');
    expect(source).toContain("{ error: 'Unknown categoryId' }, { status: 400 }");

    // Nothing else is taken from the body, and no command is built from it.
    for (const forbidden of [
      'body.files',
      'body.paths',
      'body.args',
      'body.command',
      'body.flags',
    ]) {
      expect(source, `${forbidden} must not be read`).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/\bspawn\b|\bexec\b|child_process/);
  });

  it('runs on Node, uncached, with a bounded duration', () => {
    expect(source).toContain("runtime = 'nodejs'");
    expect(source).toContain("dynamic = 'force-dynamic'");
    expect(source).toContain('maxDuration');
  });
});

describe('the run panel', () => {
  const categories = listRunnableCategories();

  it('is not rendered at all when the gate is closed', () => {
    // Item 12's done condition: the action is unavailable, not disabled.
    const html = renderToStaticMarkup(
      <TestRunPanel categories={categories} canRun={false} gateReason="Local only." />
    );

    expect(html).not.toContain('<button');
    expect(html).not.toContain('<select');
    expect(html).toContain('unavailable');
    expect(html).toContain('Local only.');
  });

  it('offers one category at a time, from the real map', () => {
    const html = renderToStaticMarkup(
      <TestRunPanel categories={categories} canRun gateReason="n/a" />
    );

    expect(html).toContain('Run category');
    // One picker, one button: no run-all and no multi-select.
    expect(html.split('<select').length - 1).toBe(1);
    expect(html.split('<button').length - 1).toBe(1);
    expect(html).not.toContain('multiple');
    expect(html).not.toMatch(/run all/i);

    for (const category of categories.filter((entry) => entry.fileCount > 0)) {
      expect(html, `${category.id} is not offered`).toContain(category.id);
    }
    // A category with nothing to run is not offered.
    for (const category of categories.filter((entry) => entry.fileCount === 0)) {
      expect(html).not.toContain(`value="${category.id}"`);
    }
  });

  it('posts a category id and nothing else', () => {
    const panel = read(PANEL);
    // Item 15 moved the request itself into the shared execution hook, so the
    // property is asserted across the two: the panel names the route and the
    // body, and the hook posts exactly those.
    const hook = read(RUN_HOOK);

    expect(panel).toContain("endpoint: '/api/admin/platform/tests/run'");
    expect(panel).toMatch(/buildBody: \(\) => \(\{ categoryId: selected \}\)/);
    expect(hook).toContain('fetch(options.endpoint');
    expect(hook).toContain('JSON.stringify(options.buildBody())');

    // The browser never names a file or a flag.
    for (const source of [panel, hook]) {
      expect(source).not.toMatch(/filesRequested:\s*\[/);
      expect(source).not.toContain('--reporter');
      expect(source).not.toMatch(/child_process|spawn\(/);
    }
  });

  it('shows no progress it cannot measure', () => {
    const panel = read(PANEL);
    const html = renderToStaticMarkup(
      <TestRunPanel categories={categories} canRun gateReason="n/a" />
    );

    // Item 15 added a lifecycle the server observes and the elapsed time it
    // measured. It did not add a bar: the runner still reports its result once,
    // at the end, so there is no proportion to fill one with.
    expect(html).not.toContain('<progress');
    expect(html).not.toContain('role="progressbar"');
    expect(panel).not.toMatch(/percent|%\s*[`'"]|Math\.round\([^)]*100/);
    // The panel still renders no progress of its own; `RunProgress` does, from
    // the snapshot the server sent.
    expect(panel).not.toMatch(/elapsed|lifecycle/i);
  });

  it('says results are not kept, because they are not', () => {
    // No history and no persistence until item 16; a reload clears the panel.
    const panel = read(PANEL);

    expect(panel).toContain('not kept');
    expect(panel).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});

describe('the page wires the gate through', () => {
  const source = read(TESTS_PAGE);

  it('evaluates the gate on the server and hands it to the panel', () => {
    expect(source).toContain('canRunDeveloperSuites()');
    expect(source).toContain('canRun={canRunDeveloperSuites()}');
    expect(source).toContain('listRunnableCategories()');
    // Still the item-11 inventory, still a thin shim.
    expect(source).toContain('buildTestInventory()');
    expect(source).toMatch(/await requireAdmin\(\)/);
    expect(source).not.toMatch(/className=/);
  });
});

describe('the old developer runner is untouched', () => {
  it('keeps its own route, runner and catalog', () => {
    // Item 25 retired the old runner. What survives of this assertion is
    // the part that was ever about the new one: it reaches the shared guard
    // and nothing in the deleted suite registry.
    expect(read(RUNNER)).not.toContain('modules/developer/suites');
    expect(read(RUNNER)).toContain('modules/developer/guard');
  });
});

describe('the result model carries nothing it cannot fill', () => {
  it('has no field for history, flakiness or a trace', async () => {
    const result: CategoryRunResult = await runCategory('AI', {
      features: [feature({ id: 'one', category: 'AI', unitTests: ['__tests__/a.test.ts'] })],
      canRun: true,
      spawner: fakeSpawner(),
      readReport: () => reportFixture({ failing: false }),
    });

    for (const absent of ['history', 'previousRuns', 'flaky', 'trace', 'screenshots', 'coverage']) {
      expect(Object.keys(result), `${absent} belongs to a later item`).not.toContain(absent);
    }
    expect(Object.keys(result).sort()).toEqual([
      'categoryId',
      'detail',
      'durationMs',
      'exitCode',
      'files',
      'filesNotReported',
      'filesReported',
      'filesRequested',
      'outcome',
      'ran',
      'runnerOutput',
      'totals',
    ]);
  });

  it('writes its report outside the repository and cleans it up', () => {
    const runner = read(RUNNER);

    // OS temp directory, unique per run, removed in a finally block: never in
    // git, never colliding, never on top of the Live QA artifacts.
    expect(runner).toContain('mkdtempSync');
    expect(runner).toContain('tmpdir()');
    expect(runner).toMatch(/finally \{[\s\S]*rmSync/);
    expect(runner).not.toContain('.artifacts');
  });

  it('reads the report from the file, never from stdout', () => {
    const runner = read(RUNNER);

    expect(runner).toContain('--outputFile=');
    expect(runner).toMatch(/child\.stdout\?\.resume\(\)/);
    // stderr is kept only to explain a failure to start.
    expect(runner).not.toMatch(/stdout \+=/);
  });
});

describe('no product code is involved', () => {
  it('keeps the runner inside the admin panel', () => {
    const runner = read(RUNNER);
    const imports = [...runner.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

    for (const specifier of imports) {
      const isRelative = specifier.startsWith('.');
      const isNode = specifier.startsWith('node:');
      expect(
        isRelative || isNode,
        `${specifier} is outside the admin panel and node builtins`
      ).toBe(true);
    }
  });
});

describe('determinism', () => {
  it('resolves the same files twice', () => {
    for (const category of FEATURE_CATEGORIES) {
      expect(resolveCategoryTestFiles(category)).toEqual(resolveCategoryTestFiles(category));
    }
    expect(listRunnableCategories()).toEqual(listRunnableCategories());
  });

  it('parses the same report twice', () => {
    const raw = reportFixture({ failing: true });
    expect(parseVitestReport(raw, REPO_ROOT)).toEqual(parseVitestReport(raw, REPO_ROOT));
  });

  it('does not touch the clock or the network while resolving', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    resolveCategoryTestFiles('AI');
    listRunnableCategories();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
