/**
 * Test Console: result detail (PLATFORM_TODO item 13).
 *
 * Item 13's done condition is that a deliberately failed local test shows its
 * assertion text, expected against actual, and its stack. The first and third
 * are fields the Vitest JSON reporter gives directly. The second is not: the
 * reporter carries no `expected`/`actual` pair and no diff — it states both
 * inside the assertion message ("expected 'hello world' to be 'hello there'"),
 * so the assertions below check that text reaches the page intact rather than
 * checking for two fields that do not exist.
 *
 * Three fixtures, all shaped like real reporter output: an all-pass run, a
 * failure run (two errors on one test, a multiline stack, a file-level
 * message), and an infrastructure failure. They are rendered, not snapshotted.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import { parseVitestReport, runCategory } from '@/_admin-panel/platform/tests';
import type { CategoryRunResult } from '@/_admin-panel/platform/tests';
import { TestRunResult } from '@/_admin-panel/platform/ui';

const RESULT_VIEW = '_admin-panel/platform/ui/test-run-result.tsx';
const RUN_PANEL = '_admin-panel/platform/ui/test-run-panel.tsx';
const REPO_ROOT = 'C:/repo';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/**
 * Visible text, with the entities React escapes decoded.
 *
 * Without this, `expected 'hello world'` arrives as `expected &#x27;hello
 * world&#x27;` and an assertion about what a person reads would fail for the
 * wrong reason.
 */
const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The assertion line Vitest produces for a `toBe` mismatch, verbatim. */
const ASSERTION =
  "AssertionError: expected 'hello world' to be 'hello there' // Object.is equality";
const SECOND_ERROR = 'Error: unhandled rejection during teardown';

/** A stack as the reporter writes it: absolute paths and `file:///` URLs. */
const STACK = [
  `    at ${REPO_ROOT}/__tests__/greeting.test.ts:12:28`,
  `    at file:///${REPO_ROOT}/node_modules/@vitest/runner/dist/chunk.js:302:11`,
  '    at new Promise (<anonymous>)',
].join('\n');

function passingReport(): string {
  return JSON.stringify({
    numTotalTests: 3,
    numPassedTests: 2,
    numFailedTests: 0,
    numPendingTests: 1,
    numTodoTests: 0,
    success: true,
    testResults: [
      {
        name: `${REPO_ROOT}/__tests__/greeting.test.ts`,
        status: 'passed',
        startTime: 1_700_000_000_000,
        endTime: 1_700_000_000_320,
        message: '',
        assertionResults: [
          {
            ancestorTitles: ['Greeting', 'formatting'],
            fullName: 'Greeting formatting keeps the comma',
            title: 'keeps the comma',
            status: 'passed',
            duration: 4.21,
            failureMessages: [],
          },
          {
            ancestorTitles: ['Greeting'],
            fullName: 'Greeting trims whitespace',
            title: 'trims whitespace',
            status: 'passed',
            duration: 0.73,
            failureMessages: [],
          },
          {
            ancestorTitles: ['Greeting'],
            fullName: 'Greeting handles locales',
            title: 'handles locales',
            status: 'skipped',
            duration: null,
            failureMessages: [],
          },
        ],
      },
    ],
  });
}

function failingReport(): string {
  return JSON.stringify({
    numTotalTests: 2,
    numPassedTests: 1,
    numFailedTests: 1,
    numPendingTests: 0,
    numTodoTests: 1,
    success: false,
    testResults: [
      {
        name: `${REPO_ROOT}/__tests__/greeting.test.ts`,
        status: 'failed',
        startTime: 1_700_000_000_000,
        endTime: 1_700_000_000_880,
        message: `Error: Cannot find module '@/lib/missing'\n    at ${REPO_ROOT}/__tests__/greeting.test.ts:1:1`,
        assertionResults: [
          {
            ancestorTitles: ['Greeting', 'formatting'],
            fullName: 'Greeting formatting keeps the comma',
            title: 'keeps the comma',
            status: 'failed',
            duration: 7.9973,
            // Two errors on one test: the reporter's field is an array.
            failureMessages: [`${ASSERTION}\n${STACK}`, `${SECOND_ERROR}\n${STACK}`],
          },
          {
            ancestorTitles: ['Greeting'],
            fullName: 'Greeting handles locales',
            title: 'handles locales',
            status: 'todo',
            duration: null,
            failureMessages: [],
          },
        ],
      },
    ],
  });
}

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'stub',
    name: 'Stub',
    userDescription: 'A stub feature used to exercise the result detail in isolation.',
    codeLocations: ['lib/utils.ts'],
    category: 'Builder',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    ...overrides,
  };
}

/** Runs the real runner against a fixture report, with nothing spawned. */
function resultFor(
  report: string | null,
  overrides: {
    exitCode?: number | null;
    spawnError?: string | null;
    stderr?: string;
    /** Files the map lists. Defaults to one the fixture reports and one it does not. */
    requested?: string[];
  } = {}
): Promise<CategoryRunResult> {
  return runCategory('AI', {
    repoRoot: REPO_ROOT,
    canRun: true,
    features: [
      feature({
        id: 'one',
        category: 'AI',
        unitTests: overrides.requested ?? [
          '__tests__/greeting.test.ts',
          '__tests__/never-reported.test.ts',
        ],
      }),
    ],
    spawner: () =>
      Promise.resolve({
        exitCode: overrides.exitCode ?? 0,
        stderr: overrides.stderr ?? '',
        timedOut: false,
        spawnError: overrides.spawnError ?? null,
      }),
    readReport: () => {
      if (report === null) throw new Error('ENOENT');
      return report;
    },
  });
}

describe('the parser exposes the detail the reporter gives', () => {
  it('keeps every error a failing test produced', () => {
    const parsed = parseVitestReport(failingReport(), REPO_ROOT)!;
    const failing = parsed.files[0].tests[0];

    // Two entries in `failureMessages` means two errors, not one.
    expect(failing.failures).toHaveLength(2);
    expect(failing.failures[0].message).toBe(ASSERTION);
    expect(failing.failures[1].message).toBe(SECOND_ERROR);
  });

  it('separates the assertion from the stack and keeps the stack multiline', () => {
    const [failure] = parseVitestReport(failingReport(), REPO_ROOT)!.files[0].tests[0].failures;

    // The message carries expected and actual, in Vitest's own words.
    expect(failure.message).toContain("expected 'hello world'");
    expect(failure.message).toContain("to be 'hello there'");
    expect(failure.message).not.toContain('    at ');

    expect(failure.stack).toContain('\n');
    expect(failure.stack!.split('\n').length).toBe(3);
    expect(failure.stack).toContain('__tests__/greeting.test.ts:12:28');
    expect(failure.stack).toContain('new Promise');
    // The operator's filesystem layout is not leaked.
    expect(failure.stack).not.toContain(REPO_ROOT);
    expect(failure.stack).not.toContain('file:///');
  });

  it('reads the source location off the stack, skipping Vitest frames', () => {
    const [failure] = parseVitestReport(failingReport(), REPO_ROOT)!.files[0].tests[0].failures;

    expect(failure.location).toBe('__tests__/greeting.test.ts:12:28');
  });

  it('leaves a passing test with no failure detail at all', () => {
    const parsed = parseVitestReport(passingReport(), REPO_ROOT)!;

    for (const test of parsed.files[0].tests) {
      expect(test.failures, test.name).toEqual([]);
    }
  });

  it('passes a skipped or todo status through rather than mapping it', () => {
    const passing = parseVitestReport(passingReport(), REPO_ROOT)!;
    const failing = parseVitestReport(failingReport(), REPO_ROOT)!;

    expect(passing.files[0].tests.map((test) => test.status)).toEqual([
      'passed',
      'passed',
      'skipped',
    ]);
    expect(failing.files[0].tests[1].status).toBe('todo');
    // A test the reporter gives no duration for keeps null, not zero.
    expect(passing.files[0].tests[2].durationMs).toBeNull();
  });

  it('keeps a file-level error, repo-relative', () => {
    const file = parseVitestReport(failingReport(), REPO_ROOT)!.files[0];

    expect(file.message).toContain("Cannot find module '@/lib/missing'");
    expect(file.message).not.toContain(REPO_ROOT);
    expect(file.durationMs).toBe(880);
  });
});

describe('a requested file missing from the report', () => {
  it('is named instead of being treated as a pass', async () => {
    const result = await resultFor(passingReport());

    expect(result.filesRequested).toContain('__tests__/never-reported.test.ts');
    expect(result.filesReported).not.toContain('__tests__/never-reported.test.ts');
    expect(result.filesNotReported).toEqual(['__tests__/never-reported.test.ts']);
  });

  it('counts every requested file as unreported when nothing ran', async () => {
    const result = await resultFor(null);

    expect(result.ran).toBe(false);
    expect(result.filesNotReported).toEqual(result.filesRequested);
  });
});

describe('a passing run renders cleanly', () => {
  const cleanPass = () => resultFor(passingReport(), { requested: ['__tests__/greeting.test.ts'] });

  it('shows derived totals, the file and every case', async () => {
    const result = await cleanPass();
    const html = renderToStaticMarkup(<TestRunResult result={result} />);
    const text = textOf(html);

    expect(result.outcome).toBe('passed');

    // Totals come from the result, including the skipped count.
    expect(html).toContain(`>${result.totals!.tests}<`);
    expect(html).toContain(`>${result.totals!.passed}<`);
    expect(html).toContain(`>${result.totals!.failed}<`);
    expect(html).toContain(`>${result.totals!.pending}<`);
    expect(text).toContain('Files requested');
    expect(text).toContain('Files reported');
    expect(text).toContain('Skipped');

    // File path, status and duration, from the data.
    expect(html).toContain('__tests__/greeting.test.ts');
    expect(text).toContain('320 ms');
    expect(text).toContain('3 cases');

    // Every case, with its suite, status and duration.
    expect(text).toContain('keeps the comma');
    expect(text).toContain('trims whitespace');
    expect(text).toContain('handles locales');
    expect(text).toContain('Greeting › formatting');
    expect(text).toContain('4 ms');
    expect(text).toContain('skipped');
  });

  it('shows no failure detail where there is none', async () => {
    const html = renderToStaticMarkup(<TestRunResult result={await cleanPass()} />);

    expect(html).not.toContain('<details');
    expect(html).not.toContain('Stack trace');
    expect(textOf(html)).not.toContain('AssertionError');
    expect(textOf(html)).not.toContain('Requested but not in the report');
    // A pass is not dressed up as something that needs reading.
    expect(textOf(html)).not.toContain('Error 1 of');
  });
});

describe('a failing run shows what broke', () => {
  it('shows the assertion text, expected against actual, and the stack', async () => {
    const result = await resultFor(failingReport(), { exitCode: 1 });
    const html = renderToStaticMarkup(<TestRunResult result={result} />);
    const text = textOf(html);

    expect(result.outcome).toBe('failed');
    expect(result.ran).toBe(true);

    // Item 13's done condition. Expected and actual are in this line, which is
    // where the reporter puts them.
    expect(text).toContain('AssertionError');
    expect(text).toContain("expected 'hello world'");
    expect(text).toContain("to be 'hello there'");

    // The stack is present, collapsed, and multiline.
    expect(html).toContain('<details');
    expect(text).toContain('Stack trace');
    expect(html).toContain('__tests__/greeting.test.ts:12:28');
    expect(html).toContain('new Promise');

    // And the line it failed on, read off the stack.
    expect(text).toContain('at __tests__/greeting.test.ts:12:28');
  });

  it('keeps the stack behind a toggle rather than dumping it', async () => {
    const html = renderToStaticMarkup(
      <TestRunResult result={await resultFor(failingReport(), { exitCode: 1 })} />
    );

    // The assertion is outside the <details>; the stack is inside one.
    const [beforeDetails] = html.split('<details');
    expect(beforeDetails).toContain('AssertionError');
    expect(beforeDetails).not.toContain('new Promise');
    expect(html).toContain('<summary');
  });

  it('shows both errors when a test failed more than once', async () => {
    const text = textOf(
      renderToStaticMarkup(
        <TestRunResult result={await resultFor(failingReport(), { exitCode: 1 })} />
      )
    );

    expect(text).toContain('Error 1 of 2');
    expect(text).toContain('Error 2 of 2');
    expect(text).toContain('unhandled rejection during teardown');
  });

  it('shows the file-level error and the unreported file', async () => {
    const text = textOf(
      renderToStaticMarkup(
        <TestRunResult result={await resultFor(failingReport(), { exitCode: 1 })} />
      )
    );

    expect(text).toContain('File-level error');
    expect(text).toContain("Cannot find module '@/lib/missing'");
    expect(text).toContain('Requested but not in the report');
    expect(text).toContain('__tests__/never-reported.test.ts');
    expect(text).toContain('They have not');
  });

  it('distinguishes failed, todo and the run verdict', async () => {
    const html = renderToStaticMarkup(
      <TestRunResult result={await resultFor(failingReport(), { exitCode: 1 })} />
    );
    const text = textOf(html);

    expect(text).toContain('failed');
    expect(text).toContain('todo');
    // The run's own verdict is shown as a status too, not as a fourth concept.
    expect(text).toContain('1 of 2 tests failed');
  });
});

describe('an infrastructure failure is not a failed suite', () => {
  it('says nothing ran and shows no test rows', async () => {
    const result = await resultFor(null, { exitCode: null, spawnError: 'ENOENT', stderr: 'boom' });
    const html = renderToStaticMarkup(<TestRunResult result={result} />);
    const text = textOf(html);

    expect(result.ran).toBe(false);
    expect(result.outcome).toBe('runner-failed');

    expect(text).toContain('nothing ran');
    expect(text).toContain('not a test failure');
    expect(text).toContain('No results to show');
    expect(text).toContain('boom');

    // No totals grid, no file blocks, no case rows.
    expect(text).not.toContain('Files reported');
    expect(text).not.toContain('cases');
    expect(html).not.toContain('AssertionError');
  });

  it('still names the files it would have run', async () => {
    const text = textOf(
      renderToStaticMarkup(
        <TestRunResult result={await resultFor(null, { spawnError: 'ENOENT' })} />
      )
    );

    expect(text).toContain('Would have run');
    expect(text).toContain('__tests__/greeting.test.ts');
    expect(text).toContain('__tests__/never-reported.test.ts');
  });

  it('renders every non-run outcome as an infrastructure state', async () => {
    const outcomes: { result: CategoryRunResult; label: string }[] = [
      { result: await resultFor(null, { spawnError: 'ENOENT' }), label: 'runner-failed' },
      { result: await resultFor('{ not json'), label: 'report-unreadable' },
      {
        result: await runCategory('Everything', { canRun: true, repoRoot: REPO_ROOT }),
        label: 'unknown-category',
      },
      {
        result: await runCategory('AI', {
          canRun: false,
          repoRoot: REPO_ROOT,
          features: [feature({ id: 'one', category: 'AI', unitTests: ['a.test.ts'] })],
        }),
        label: 'gate-closed',
      },
    ];

    for (const { result, label } of outcomes) {
      expect(result.outcome, label).toBe(label);
      const text = textOf(renderToStaticMarkup(<TestRunResult result={result} />));
      expect(text, label).toContain('No results to show');
      expect(text, label).toContain('nothing ran');
    }
  });
});

describe('the detail view claims nothing it does not have', () => {
  const source = read(RESULT_VIEW);

  it('fabricates no history, flakiness, coverage or retry data', async () => {
    const text = textOf(
      renderToStaticMarkup(
        <TestRunResult result={await resultFor(failingReport(), { exitCode: 1 })} />
      )
    );

    for (const absent of ['flaky', 'last run', 'previous', 'coverage', 'retry', 'trend']) {
      expect(text.toLowerCase(), `${absent} belongs to a later item`).not.toContain(absent);
    }
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('adds no execution control', () => {
    // Item 13 is detail, not execution. The only control on the page is the
    // run button item 12 added, and it lives in the panel.
    expect(source).not.toContain('<button');
    expect(source).not.toContain('onClick');
    expect(source).not.toContain('fetch(');
    expect(source).not.toMatch(/run all|rerun|retry this/i);
  });

  it('says where expected and actual come from', () => {
    // Honesty about the reporter's limits, on the page rather than only here.
    expect(source).toContain('no separate diff');
  });

  it('imports no server-only module', () => {
    for (const file of [RESULT_VIEW, RUN_PANEL]) {
      const contents = read(file);
      expect(contents, file).not.toMatch(/from 'node:/);
      expect(contents, file).not.toMatch(/from '[^']*platform\/(scan|tests\/(runner|inventory))/);
      expect(contents, file).not.toMatch(/child_process|readFileSync|spawn\(/);
    }
    // The view takes data as a prop and imports only its types.
    expect(read(RESULT_VIEW)).toMatch(/import type \{[\s\S]*?\} from '\.\.\/tests\/run-types'/);
  });

  it('keeps the panel a control and the view a renderer', () => {
    const panel = read(RUN_PANEL);

    expect(panel).toContain('TestRunResult');
    // The result markup moved out, so the panel no longer renders files itself.
    expect(panel).not.toContain('assertionResults');
    expect(panel).not.toMatch(/<pre/);
    expect(read(RESULT_VIEW)).not.toContain("'use client'");
  });
});

describe('the rest of the console is untouched', () => {
  it('leaves the inventory and the old developer panel alone', () => {
    const console_ = read('_admin-panel/platform/ui/test-console.tsx');

    expect(console_).toContain('runPanel');
    expect(console_).not.toContain('TestRunResult');
    expect(console_).not.toContain("'use client'");

    for (const modulePath of ['app/admin/(dashboard)/developer/page.tsx']) {
      expect(existsSync(path.join(process.cwd(), modulePath)), modulePath).toBe(true);
    }
  });
});
