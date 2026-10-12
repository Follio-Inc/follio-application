/**
 * Test Console: Live QA runs read from `report.json` (PLATFORM_TODO item 14).
 *
 * Item 14's done condition has two halves. A pathway run renders per-test
 * results with artifact links — asserted here against report fixtures shaped
 * like the real thing, because Playwright's browsers are not installed on this
 * machine and installing them is not this item's business. And a run with no
 * `LIVE_QA_STORAGE_STATE` reports "skipped — auth not configured" rather than
 * failing — which is asserted against the **real** probe, since no session is
 * configured here, so that path is exercised for real rather than mocked.
 *
 * The fixtures follow `JSONReport` from
 * `node_modules/playwright/types/testReporter.d.ts`, and the
 * `pathway-not-in-report` fixture is the shape a real run on this machine
 * actually produced.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { spawnSync } from 'node:child_process';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';

import { canRunDeveloperSuites } from '@/_admin-panel/modules/developer/guard';
import { LIVE_QA_PATHWAYS } from '@/_admin-panel/modules/developer/live-qa/catalog';
import { getLiveQaRoot } from '@/_admin-panel/modules/developer/live-qa/fixtures';
import { toSpecFilter } from '@/_admin-panel/modules/developer/live-qa/runner';
import type { LiveQaRunResult } from '@/_admin-panel/modules/developer/live-qa/types';
import {
  artifactPathFor,
  isLiveQaAuthConfigured,
  listRunnablePathways,
  parsePathwayReport,
  resolveArtifactRequest,
  runPathway,
} from '@/_admin-panel/platform/tests';
import type { PathwayRunResult } from '@/_admin-panel/platform/tests';
import { LiveQaPanel, LiveQaRunResult as LiveQaRunResultView } from '@/_admin-panel/platform/ui';

const RUN_ROUTE = 'app/api/admin/platform/tests/live-qa/run/route.ts';
const ARTIFACT_ROUTE = 'app/api/admin/platform/tests/live-qa/artifact/route.ts';
const SERVER_MODULE = '_admin-panel/platform/tests/live-qa.ts';
const PANEL = '_admin-panel/platform/ui/live-qa-panel.tsx';
const RUN_HOOK = '_admin-panel/platform/ui/use-run-execution.ts';
const RESULT_VIEW = '_admin-panel/platform/ui/live-qa-result.tsx';
const TESTS_PAGE = 'app/admin/(dashboard)/platform/tests/page.tsx';

const LIVE_QA_ROOT = 'C:/repo/_admin-panel/modules/developer/live-qa';
const RUN_DIR = `${LIVE_QA_ROOT}/.artifacts/2026-10-10T16-12-53-024Z`;
const PATHWAY = 'public.landing';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/** Throwaway Live QA roots for the containment tests. */
const tempRoots: string[] = [];

function tempLiveQaRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'follio-live-qa-'));
  tempRoots.push(root);
  mkdirSync(path.join(root, '.artifacts', 'run'), { recursive: true });
  writeFileSync(path.join(root, '.artifacts', 'run', 'shot.png'), 'png');
  writeFileSync(path.join(root, 'secret.txt'), 'not an artifact');
  return root;
}

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

/** A report with one passing spec, as the json reporter writes it. */
function passingReport(): string {
  return JSON.stringify({
    config: { rootDir: LIVE_QA_ROOT },
    errors: [],
    stats: {
      startTime: '2026-10-10T16:12:53.593Z',
      duration: 4210.5,
      expected: 1,
      unexpected: 0,
      flaky: 0,
      skipped: 0,
    },
    suites: [
      {
        title: 'public-landing.spec.ts',
        file: 'public-landing.spec.ts',
        line: 0,
        column: 0,
        specs: [],
        suites: [
          {
            title: PATHWAY,
            file: 'public-landing.spec.ts',
            line: 3,
            column: 7,
            specs: [
              {
                title: 'marketing landing loads with a primary CTA',
                ok: true,
                tags: [],
                id: 'abc',
                file: 'public-landing.spec.ts',
                line: 7,
                column: 7,
                tests: [
                  {
                    timeout: 180000,
                    annotations: [],
                    expectedStatus: 'passed',
                    projectName: 'chromium',
                    projectId: 'chromium',
                    status: 'expected',
                    results: [
                      {
                        workerIndex: 0,
                        parallelIndex: 0,
                        status: 'passed',
                        duration: 1842.3,
                        error: undefined,
                        errors: [],
                        stdout: [],
                        stderr: [],
                        retry: 0,
                        startTime: '2026-10-10T16:12:54.000Z',
                        attachments: [],
                        annotations: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
}

/** A report with one failing spec, a retry, a screenshot and a trace. */
function failingReport(): string {
  return JSON.stringify({
    config: { rootDir: LIVE_QA_ROOT },
    errors: [],
    stats: {
      startTime: '2026-10-10T16:12:53.593Z',
      duration: 9120.8,
      expected: 0,
      unexpected: 1,
      flaky: 0,
      skipped: 0,
    },
    suites: [
      {
        title: 'public-landing.spec.ts',
        file: 'public-landing.spec.ts',
        line: 0,
        column: 0,
        specs: [],
        suites: [
          {
            title: PATHWAY,
            file: 'public-landing.spec.ts',
            line: 3,
            column: 7,
            specs: [
              {
                title: 'marketing landing loads with a primary CTA',
                ok: false,
                tags: [],
                id: 'abc',
                file: 'public-landing.spec.ts',
                line: 7,
                column: 7,
                tests: [
                  {
                    timeout: 180000,
                    annotations: [],
                    expectedStatus: 'passed',
                    projectName: 'chromium',
                    projectId: 'chromium',
                    status: 'unexpected',
                    results: [
                      {
                        workerIndex: 0,
                        parallelIndex: 0,
                        status: 'failed',
                        duration: 8800,
                        error: {
                          message: `expect(locator).toBeVisible() failed\n\nLocator: getByRole('link')\nExpected: visible\nReceived: <element(s) not found>`,
                          stack: `Error: expect(locator).toBeVisible() failed\n    at ${LIVE_QA_ROOT}/pathways/public-landing.spec.ts:18:21\n    at file:///C:/repo/node_modules/playwright/lib/worker.js:9:1`,
                        },
                        errors: [{ message: 'expect(locator).toBeVisible() failed' }],
                        stdout: [],
                        stderr: [],
                        retry: 1,
                        startTime: '2026-10-10T16:12:54.000Z',
                        errorLocation: {
                          file: `${LIVE_QA_ROOT}/pathways/public-landing.spec.ts`,
                          line: 18,
                          column: 21,
                        },
                        attachments: [
                          {
                            name: 'screenshot',
                            contentType: 'image/png',
                            path: `${RUN_DIR}/test-output/public-landing/test-failed-1.png`,
                          },
                          {
                            name: 'trace',
                            contentType: 'application/zip',
                            path: `${RUN_DIR}/test-output/public-landing/trace.zip`,
                          },
                          // An attachment with no file at all, and one that
                          // points outside the artifacts directory.
                          { name: 'note', contentType: 'text/plain', body: 'inline' },
                          {
                            name: 'escaped',
                            contentType: 'text/plain',
                            path: 'C:/Windows/System32/drivers/etc/hosts',
                          },
                        ],
                        annotations: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
}

/** What a real run on this machine produced: no suites, one report error. */
function noTestsFoundReport(): string {
  return JSON.stringify({
    config: { rootDir: LIVE_QA_ROOT },
    suites: [],
    errors: [
      {
        message:
          'Error: No tests found.\nMake sure that arguments are regular expressions matching test files.',
        stack: 'Error: No tests found.',
      },
    ],
    stats: {
      startTime: '2026-10-10T16:12:53.593Z',
      duration: 15.849,
      expected: 0,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
  });
}

function runnerOutcome(overrides: Partial<LiveQaRunResult> = {}): LiveQaRunResult {
  return {
    ok: true,
    exitCode: 0,
    durationMs: 9500,
    startedAt: '2026-10-10T16:12:53.000Z',
    finishedAt: '2026-10-10T16:13:02.000Z',
    baseUrl: 'http://localhost:3000',
    pathwayIds: [PATHWAY],
    results: [],
    stdout: '',
    stderr: '',
    artifactsDir: RUN_DIR,
    ...overrides,
  };
}

/** Runs the real `runPathway`, with the existing runner replaced by a fixture. */
function resultFor(
  report: string | null,
  overrides: { outcome?: Partial<LiveQaRunResult>; pathwayId?: string } = {}
): Promise<PathwayRunResult> {
  return runPathway(overrides.pathwayId ?? PATHWAY, {
    canRun: true,
    authConfigured: true,
    liveQaRoot: LIVE_QA_ROOT,
    repoRoot: 'C:/repo',
    run: () => Promise.resolve(runnerOutcome(overrides.outcome)),
    readReport: () => {
      if (report === null) throw new Error('ENOENT');
      return report;
    },
  });
}

describe('pathways come from the existing Live QA catalog', () => {
  it('offers every catalogued pathway and nothing else', () => {
    const offered = listRunnablePathways();

    expect(offered.map((entry) => entry.id)).toEqual(LIVE_QA_PATHWAYS.map((entry) => entry.id));
    for (const entry of offered) {
      const catalogued = LIVE_QA_PATHWAYS.find((item) => item.id === entry.id)!;
      expect(entry.title).toBe(catalogued.title);
      expect(entry.requiresAuth).toBe(catalogued.requiresAuth);
      expect(entry.fixtureKind).toBe(catalogued.fixtureKind);
    }
  });

  it('marks a pathway that needs a session as blocked, with the reason', () => {
    const withoutAuth = listRunnablePathways(LIVE_QA_PATHWAYS, false);
    const withAuth = listRunnablePathways(LIVE_QA_PATHWAYS, true);

    for (const entry of withoutAuth) {
      const catalogued = LIVE_QA_PATHWAYS.find((item) => item.id === entry.id)!;
      expect(entry.runnable, entry.id).toBe(!catalogued.requiresAuth);
      if (!entry.runnable) expect(entry.blockedReason).toContain('live-qa:auth');
    }
    // With a session configured, every pathway is runnable.
    for (const entry of withAuth) expect(entry.runnable, entry.id).toBe(true);
  });

  it('refuses an id the catalog does not have', async () => {
    for (const bogus of ['', 'public.landings', 'PUBLIC.LANDING', '../etc/passwd']) {
      const result = await runPathway(bogus, { canRun: true, authConfigured: true });
      expect(result.outcome, bogus).toBe('unknown-pathway');
      expect(result.ran).toBe(false);
    }
  });
});

describe('the auth prerequisite', () => {
  it('reports "skipped — auth not configured" instead of failing', async () => {
    // Item 14's done condition, against the real probe: no session is
    // configured on this machine, so this is not a mocked path.
    expect(isLiveQaAuthConfigured()).toBe(false);

    const needsAuth = LIVE_QA_PATHWAYS.find((entry) => entry.requiresAuth)!;
    const result = await runPathway(needsAuth.id);

    expect(result.outcome).toBe('skipped-auth-not-configured');
    expect(result.detail.startsWith('skipped — auth not configured')).toBe(true);
    expect(result.ran).toBe(false);
    // Nothing was spawned: no exit code, no artifacts directory.
    expect(result.exitCode).toBeNull();
    expect(result.artifactsDir).toBeNull();
    expect(result.cases).toEqual([]);
  });

  it('does not invent a session', () => {
    const source = read(SERVER_MODULE);

    expect(source).not.toMatch(/writeFileSync|storageState:\s*\{/);
    // The probe is the existing catalog's, not a second reading of the env var.
    expect(source).toContain('buildLiveQaCatalog().defaults.storageStateConfigured');
    expect(source).toContain('live-qa:auth');
  });

  it('runs a pathway that needs no session', async () => {
    const open = LIVE_QA_PATHWAYS.find((entry) => !entry.requiresAuth)!;
    const result = await resultFor(passingReport(), { pathwayId: open.id });

    // The fixture's suite is titled `public.landing`; any other open pathway
    // would legitimately report no spec for itself.
    expect(['passed', 'pathway-not-in-report']).toContain(result.outcome);
  });
});

describe('report.json is the parsed source', () => {
  it('reads per-test name, suite, status, duration and retries', () => {
    const parsed = parsePathwayReport(failingReport(), PATHWAY, {
      liveQaRoot: LIVE_QA_ROOT,
      repoRoot: 'C:/repo',
    })!;

    expect(parsed.cases).toHaveLength(1);
    const [test] = parsed.cases;

    expect(test.name).toBe('marketing landing loads with a primary CTA');
    // The file-level suite title is dropped; the `describe` title is the id.
    expect(test.suite).toEqual([PATHWAY]);
    expect(test.status).toBe('unexpected');
    expect(test.attemptStatus).toBe('failed');
    expect(test.durationMs).toBe(8800);
    expect(test.retries).toBe(1);
  });

  it('reads the totals from stats', () => {
    const parsed = parsePathwayReport(passingReport(), PATHWAY, { liveQaRoot: LIVE_QA_ROOT })!;

    expect(parsed.totals).toEqual({
      expected: 1,
      unexpected: 0,
      flaky: 0,
      skipped: 0,
      durationMs: 4211,
    });
    expect(parsed.startedAt).toBe('2026-10-10T16:12:53.593Z');
  });

  it('keeps the error message, its detail and its location', () => {
    const [test] = parsePathwayReport(failingReport(), PATHWAY, {
      liveQaRoot: LIVE_QA_ROOT,
      repoRoot: 'C:/repo',
    })!.cases;

    expect(test.error).toBe('expect(locator).toBeVisible() failed');
    expect(test.stack).toContain('pathways/public-landing.spec.ts:18:21');
    // Repo-relative, the same way the Vitest side reports a location, rather
    // than relative to the Live QA module.
    expect(test.location).toBe(
      '_admin-panel/modules/developer/live-qa/pathways/public-landing.spec.ts:18:21'
    );
    // No absolute paths reach the UI.
    expect(test.stack).not.toContain(LIVE_QA_ROOT);
    expect(test.stack).not.toContain('file:///');
    expect(test.location).not.toContain('C:/');
  });

  it('leaves a passing test with no error', () => {
    const [test] = parsePathwayReport(passingReport(), PATHWAY, {
      liveQaRoot: LIVE_QA_ROOT,
    })!.cases;

    expect(test.status).toBe('expected');
    expect(test.error).toBeNull();
    expect(test.stack).toBeNull();
    expect(test.artifacts).toEqual([]);
  });

  it('reads report-level errors', () => {
    const parsed = parsePathwayReport(noTestsFoundReport(), PATHWAY, {
      liveQaRoot: LIVE_QA_ROOT,
    })!;

    expect(parsed.cases).toEqual([]);
    expect(parsed.errors[0]).toContain('No tests found');
  });

  it('refuses output it cannot read', () => {
    expect(parsePathwayReport('not json', PATHWAY)).toBeNull();
    expect(parsePathwayReport('null', PATHWAY)).toBeNull();
    expect(parsePathwayReport('{"stats":{}}', PATHWAY)).toBeNull();
  });

  it('returns no case for a pathway the report does not cover', () => {
    const parsed = parsePathwayReport(passingReport(), 'share.visibility-cycle', {
      liveQaRoot: LIVE_QA_ROOT,
    })!;

    expect(parsed.cases).toEqual([]);
  });
});

describe('artifact paths', () => {
  it('keeps a screenshot and a trace that really exist in the report', () => {
    const [test] = parsePathwayReport(failingReport(), PATHWAY, {
      liveQaRoot: LIVE_QA_ROOT,
    })!.cases;

    const byName = new Map(test.artifacts.map((entry) => [entry.name, entry]));
    expect([...byName.keys()]).toEqual(['screenshot', 'trace', 'note', 'escaped']);
    expect(byName.get('screenshot')!.path).toBe(
      '.artifacts/2026-10-10T16-12-53-024Z/test-output/public-landing/test-failed-1.png'
    );
    expect(byName.get('screenshot')!.contentType).toBe('image/png');
    expect(byName.get('trace')!.path).toBe(
      '.artifacts/2026-10-10T16-12-53-024Z/test-output/public-landing/trace.zip'
    );
  });

  it('gives no path to an attachment with no file, or one outside the artifacts directory', () => {
    const [test] = parsePathwayReport(failingReport(), PATHWAY, {
      liveQaRoot: LIVE_QA_ROOT,
    })!.cases;
    const byName = new Map(test.artifacts.map((entry) => [entry.name, entry]));

    // Reported, but not linkable.
    expect(byName.get('note')!.path).toBeNull();
    expect(byName.get('escaped')!.path).toBeNull();
    expect(artifactPathFor('C:/Windows/System32/config/sam', LIVE_QA_ROOT)).toBeNull();
    expect(artifactPathFor(undefined, LIVE_QA_ROOT)).toBeNull();
  });

  it('serves only a file inside the artifacts directory', () => {
    const root = tempLiveQaRoot();

    expect(resolveArtifactRequest('.artifacts/run/shot.png', root)).toContain('shot.png');

    for (const escape of [
      '../secret.txt',
      '.artifacts/../secret.txt',
      '.artifacts/run/../../secret.txt',
      '.artifacts/run/../../../../../../Windows/System32/drivers/etc/hosts',
      'secret.txt',
      '',
      '.artifacts/run/missing.png',
      'C:/Windows/System32/drivers/etc/hosts',
    ]) {
      expect(resolveArtifactRequest(escape, root), escape).toBeNull();
    }
  });

  it('refuses a symlink inside the artifacts directory that points out of it', () => {
    const root = tempLiveQaRoot();
    const link = path.join(root, '.artifacts', 'run', 'escape.txt');

    try {
      symlinkSync(path.join(root, 'secret.txt'), link);
    } catch {
      // Windows needs a privilege for symlinks; skip rather than fake a pass.
      expect(existsSync(link)).toBe(false);
      return;
    }

    expect(resolveArtifactRequest('.artifacts/run/escape.txt', root)).toBeNull();
  });
});

describe('run outcomes', () => {
  it('reports a passing pathway as a run that passed', async () => {
    const result = await resultFor(passingReport());

    expect(result.outcome).toBe('passed');
    expect(result.ran).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.cases).toHaveLength(1);
    expect(result.detail).toBe('1 test passed.');
    expect(result.baseUrl).toBe('http://localhost:3000');
    // The artifacts directory is reported relative to the Live QA root.
    expect(result.artifactsDir).toBe('.artifacts/2026-10-10T16-12-53-024Z');
  });

  it('reports a failing pathway as a run, not as a broken runner', async () => {
    const result = await resultFor(failingReport(), { outcome: { ok: false, exitCode: 1 } });

    expect(result.outcome).toBe('failed');
    // The distinction item 14 has to keep.
    expect(result.ran).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.detail).toBe('1 of 1 test failed.');
    expect(result.cases[0].error).toContain('toBeVisible');
  });

  it('separates a missing report from a failing pathway', async () => {
    const result = await resultFor(null, { outcome: { ok: false, exitCode: 1 } });

    expect(result.outcome).toBe('report-missing');
    expect(result.ran).toBe(false);
    expect(result.cases).toEqual([]);
    expect(result.totals).toBeNull();
  });

  it('separates a malformed report from a failing pathway', async () => {
    const result = await resultFor('{ not json', { outcome: { ok: false, exitCode: 1 } });

    expect(result.outcome).toBe('report-unreadable');
    expect(result.ran).toBe(false);
  });

  it('separates a report that does not cover the pathway', async () => {
    // The shape a real run produced here: Playwright found no test to run.
    const result = await resultFor(noTestsFoundReport(), { outcome: { ok: false, exitCode: 1 } });

    expect(result.outcome).toBe('pathway-not-in-report');
    expect(result.ran).toBe(false);
    expect(result.detail).toContain('No tests found');
    expect(result.reportErrors[0]).toContain('No tests found');
    // The totals are still shown, because the report had them.
    expect(result.totals).not.toBeNull();
  });

  it('separates a runner that never started', async () => {
    const result = await resultFor(passingReport(), {
      outcome: { artifactsDir: null, ok: false, exitCode: 1, stderr: 'spawn ENOENT' },
    });

    expect(result.outcome).toBe('runner-failed');
    expect(result.ran).toBe(false);
    expect(result.runnerOutput).toContain('ENOENT');
  });

  it('refuses to run when the local-only gate is closed', async () => {
    let spawned = false;
    const result = await runPathway(PATHWAY, {
      canRun: false,
      authConfigured: true,
      run: () => {
        spawned = true;
        return Promise.resolve(runnerOutcome());
      },
    });

    expect(result.outcome).toBe('gate-closed');
    expect(spawned).toBe(false);
    expect(result.detail).toContain('DEVTOOLS_ENABLED');
  });

  it('uses the real gate by default', async () => {
    // Under Vitest `NODE_ENV` is `test`, which the existing gate allows.
    expect(canRunDeveloperSuites()).toBe(true);
  });

  it('reuses the existing runner rather than spawning Playwright itself', () => {
    const source = read(SERVER_MODULE);

    expect(source).toContain("from '../../modules/developer/live-qa/runner'");
    expect(source).toContain('runLiveQa({ pathwayIds: [id]');
    // No second Playwright invocation and no second catalog. Matched against
    // imports and calls, not the prose that explains the reuse.
    expect(source).not.toMatch(/child_process|spawn\(/);
    expect(source).not.toMatch(/from '[^']*playwright/);
    expect(source).not.toMatch(/require\('[^']*playwright/);
  });
});

describe('the API boundary', () => {
  const runSource = read(RUN_ROUTE);
  const artifactSource = read(ARTIFACT_ROUTE);

  it('requires admin auth and the local-only gate on both routes', () => {
    for (const [name, source] of [
      ['run', runSource],
      ['artifact', artifactSource],
    ] as const) {
      expect(source, name).toMatch(/await requireAdmin\(\)/);
      expect(source, name).toContain('assertCanRunDeveloperSuites()');
      expect(source, name).toContain("from '@/_admin-panel/modules/developer/guard'");

      // Order inside the handler, not across the import block at the top.
      const handler = source.slice(source.search(/export async function (POST|GET)/));
      expect(handler.indexOf('requireAdmin'), name).toBeGreaterThan(-1);
      expect(handler.indexOf('requireAdmin'), name).toBeLessThan(
        handler.indexOf('assertCanRunDeveloperSuites')
      );
    }
  });

  it('reads only a pathway id from the run request', () => {
    expect(runSource).toMatch(/pathwayId\?: unknown/);
    expect(runSource).toMatch(/typeof body\.pathwayId === 'string'/);
    expect(runSource).toContain('getLiveQaPathway(pathwayId)');
    expect(runSource).toContain("{ error: 'Unknown pathwayId' }, { status: 400 }");

    for (const forbidden of [
      'body.spec',
      'body.specs',
      'body.args',
      'body.config',
      'body.headed',
    ]) {
      expect(runSource, `${forbidden} must not be read`).not.toContain(forbidden);
    }
    expect(runSource).not.toMatch(/\bspawn\b|child_process/);
  });

  it('serves an artifact only through the containment check', () => {
    expect(artifactSource).toContain('resolveArtifactRequest');
    expect(artifactSource).toContain("{ error: 'Artifact not available' }, { status: 400 }");
    // Read-only: it never removes a retained screenshot or trace.
    expect(artifactSource).not.toMatch(/rmSync|unlinkSync|writeFileSync/);
    expect(artifactSource).toContain('nosniff');
  });
});

describe('the result view', () => {
  it('renders per-test results with artifact links', async () => {
    const result = await resultFor(failingReport(), { outcome: { ok: false, exitCode: 1 } });
    const html = renderToStaticMarkup(<LiveQaRunResultView result={result} />);
    const text = textOf(html);

    // Item 14's done condition, first half.
    expect(text).toContain('marketing landing loads with a primary CTA');
    expect(text).toContain(PATHWAY);
    expect(text).toContain('unexpected');
    expect(text).toContain('8800 ms');
    expect(text).toContain('after 1 retry');
    expect(text).toContain('expect(locator).toBeVisible() failed');
    expect(text).toContain('at _admin-panel/modules/developer/live-qa/pathways');
    expect(text).toContain('public-landing.spec.ts:18:21');

    // Artifact links go through the contained route, not a filesystem path.
    expect(html).toContain('/api/admin/platform/tests/live-qa/artifact?path=');
    expect(html).toContain(encodeURIComponent('.artifacts/2026-10-10T16-12-53-024Z'));
    expect(text).toContain('screenshot');
    expect(text).toContain('trace');
  });

  it('names an artifact it cannot serve without linking it', async () => {
    const html = renderToStaticMarkup(
      <LiveQaRunResultView
        result={await resultFor(failingReport(), { outcome: { ok: false, exitCode: 1 } })}
      />
    );

    expect(textOf(html)).toContain('note (no file)');
    expect(textOf(html)).toContain('escaped (no file)');
    expect(html).not.toContain('C%3A%2FWindows');
    expect(html).not.toContain('C:/Windows');
  });

  it('renders a passing run with no failure detail', async () => {
    const html = renderToStaticMarkup(
      <LiveQaRunResultView result={await resultFor(passingReport())} />
    );

    expect(textOf(html)).toContain('1 test passed');
    expect(textOf(html)).toContain('expected');
    expect(html).not.toContain('<details');
    expect(textOf(html)).not.toContain('toBeVisible');
    // No artifacts are retained for a pass, so none are shown.
    expect(textOf(html)).not.toContain('Artifacts');
  });

  it('renders the auth skip as a prerequisite, not a failure', async () => {
    const needsAuth = LIVE_QA_PATHWAYS.find((entry) => entry.requiresAuth)!;
    const html = renderToStaticMarkup(
      <LiveQaRunResultView result={await runPathway(needsAuth.id)} />
    );
    const text = textOf(html);

    expect(text).toContain('skipped — auth not configured');
    expect(text).toContain('Prerequisite not met');
    expect(text).toContain('nothing failed');
    // Not dressed up as an infrastructure problem either.
    expect(text).not.toContain('No results to show');
    expect(text).not.toContain('not a pathway failure');
  });

  it('renders an infrastructure failure separately from a pathway failure', async () => {
    for (const result of [
      await resultFor(null, { outcome: { ok: false, exitCode: 1 } }),
      await resultFor('{ not json', { outcome: { ok: false, exitCode: 1 } }),
      await resultFor(noTestsFoundReport(), { outcome: { ok: false, exitCode: 1 } }),
    ]) {
      const text = textOf(renderToStaticMarkup(<LiveQaRunResultView result={result} />));

      expect(text, result.outcome).toContain('No results to show');
      expect(text, result.outcome).toContain('not a verdict on the product');
      expect(text, result.outcome).not.toContain('toBeVisible');
    }
  });

  it('fabricates no history, flakiness trend or triage', async () => {
    const source = read(RESULT_VIEW);
    const text = textOf(
      renderToStaticMarkup(
        <LiveQaRunResultView
          result={await resultFor(failingReport(), { outcome: { ok: false, exitCode: 1 } })}
        />
      )
    );

    for (const absent of ['last run', 'previous', 'trend', 'history']) {
      expect(text.toLowerCase(), absent).not.toContain(absent);
    }
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it('imports no server-only module into either client file', () => {
    for (const file of [PANEL, RESULT_VIEW]) {
      const contents = read(file);
      expect(contents, file).not.toMatch(/from 'node:/);
      expect(contents, file).not.toMatch(/from '[^']*(platform\/scan|platform\/tests\/live-qa')/);
      expect(contents, file).not.toMatch(/child_process|spawn\(|readFileSync/);
    }
    expect(read(RESULT_VIEW)).not.toContain("'use client'");
    expect(read(PANEL).startsWith("'use client'")).toBe(true);
  });
});

describe('the panel', () => {
  const pathways = listRunnablePathways();

  it('is not rendered at all when the gate is closed', () => {
    const html = renderToStaticMarkup(
      <LiveQaPanelFixture pathways={pathways} canRun={false} authConfigured={false} />
    );

    expect(html).not.toContain('<button');
    expect(html).not.toContain('<select');
    expect(html).toContain('unavailable');
  });

  it('offers one pathway at a time, from the real catalog', () => {
    const html = renderToStaticMarkup(
      <LiveQaPanelFixture pathways={pathways} canRun authConfigured={false} />
    );

    expect(html.split('<select').length - 1).toBe(1);
    expect(html.split('<button').length - 1).toBe(1);
    expect(html).not.toContain('multiple');
    expect(html).not.toMatch(/run all/i);

    for (const pathway of pathways) {
      expect(html, `${pathway.id} is not offered`).toContain(pathway.id);
    }
    // A blocked pathway is still listed, labelled rather than hidden.
    expect(html).toContain('(needs auth)');
    expect(textOf(html)).toContain('live-qa:auth');
  });

  it('posts a pathway id and nothing else', () => {
    const panel = read(PANEL);
    // Item 15 moved the request into the shared execution hook, so the panel
    // names the route and the body and the hook posts exactly those.
    const hook = read(RUN_HOOK);

    expect(panel).toContain("endpoint: '/api/admin/platform/tests/live-qa/run'");
    expect(panel).toMatch(/buildBody: \(\) => \(\{ pathwayId: selected \}\)/);
    expect(hook).toContain('fetch(options.endpoint');
    expect(hook).toContain('JSON.stringify(options.buildBody())');

    // No spec path, no config, no flag is built in the browser. ("spec"
    // appears in the comment explaining exactly that.)
    for (const source of [panel, hook]) {
      expect(source).not.toContain('--config');
      expect(source).not.toContain('.spec.ts');
      expect(source).not.toMatch(/pathwayIds|specArgs|headed:/);
    }
  });

  it('shows no progress it cannot measure', () => {
    const html = renderToStaticMarkup(
      <LiveQaPanelFixture pathways={pathways} canRun authConfigured />
    );

    // Item 15 added the lifecycle the server observed; it added no bar,
    // because Playwright reports its result once, at the end.
    expect(html).not.toContain('<progress');
    expect(html).not.toContain('role="progressbar"');
    expect(read(PANEL)).not.toMatch(/percent|Math\.round\([^)]*100/);
  });
});

describe('the rest of the console is untouched', () => {
  it('keeps the inventory and the Vitest runner as they were', () => {
    const console_ = read('_admin-panel/platform/ui/test-console.tsx');
    const page = read(TESTS_PAGE);

    expect(console_).toContain('runPanel');
    expect(console_).toContain('liveQaPanel');
    expect(console_).not.toContain("'use client'");

    // Both runners are wired, and the page is still a composition shim.
    expect(page).toContain('TestRunPanel');
    expect(page).toContain('LiveQaPanel');
    expect(page).toContain('buildTestInventory()');
    expect(page).not.toMatch(/className=/);
  });

  it('leaves the old developer Live QA surface alone', () => {
    for (const modulePath of [
      'app/api/admin/developer/live-qa/run/route.ts',
      '_admin-panel/modules/developer/live-qa/runner.ts',
      '_admin-panel/modules/developer/live-qa/catalog.ts',
      '_admin-panel/modules/developer/ui/LiveQaTab.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), modulePath)), modulePath).toBe(true);
    }

    // The old runner still decides pass/fail from stdout; this item did not
    // change it. Item 14a records the Windows spec-filter bug it has.
    expect(read('_admin-panel/modules/developer/live-qa/runner.ts')).toContain(
      'parsePathwayResults'
    );
  });

  it('leaves the Playwright config as the one that writes report.json', () => {
    const config = read('_admin-panel/modules/developer/live-qa/playwright.config.ts');

    expect(config).toContain("['json', { outputFile: path.join(artifactsDir, 'report.json') }]");
    expect(config).toContain("trace: 'retain-on-failure'");
    expect(config).toContain("screenshot: 'only-on-failure'");
  });
});

/**
 * The spec filter the runner hands Playwright (PLATFORM_TODO item 14a).
 *
 * Playwright's positional arguments are regular expressions matched against
 * test file paths. The runner used to pass an absolute Windows path, whose
 * backslashes a regex reads as escapes, so every run on Windows ended in
 * "No tests found" with an empty report. These pin the shape of the filter and,
 * at the end, prove against the real CLI that a catalog pathway is discovered.
 */
describe('the Playwright spec filter', () => {
  const WIN_CWD = 'C:\\repo';
  const WIN_SPEC =
    'C:\\repo\\_admin-panel\\modules\\developer\\live-qa\\pathways\\public-landing.spec.ts';
  const POSIX_CWD = '/repo';
  const POSIX_SPEC = '/repo/_admin-panel/modules/developer/live-qa/pathways/public-landing.spec.ts';

  it('never hands Playwright a Windows path as written', () => {
    const filter = toSpecFilter(WIN_SPEC, WIN_CWD, path.win32);

    // The bug, pinned: the absolute backslash form matched nothing.
    expect(filter).not.toBe(WIN_SPEC);
    expect(filter).not.toContain('\\\\');
    expect(filter).not.toMatch(/^[A-Za-z]:/);
  });

  it('normalises a Windows path to a relative, forward-slash filter', () => {
    expect(toSpecFilter(WIN_SPEC, WIN_CWD, path.win32)).toBe(
      '_admin-panel/modules/developer/live-qa/pathways/public-landing\\.spec\\.ts'
    );
  });

  it('leaves a POSIX path working', () => {
    expect(toSpecFilter(POSIX_SPEC, POSIX_CWD, path.posix)).toBe(
      '_admin-panel/modules/developer/live-qa/pathways/public-landing\\.spec\\.ts'
    );
  });

  it('produces the same filter from either platform', () => {
    // One code path, not a Windows branch: forward slashes match on both.
    expect(toSpecFilter(WIN_SPEC, WIN_CWD, path.win32)).toBe(
      toSpecFilter(POSIX_SPEC, POSIX_CWD, path.posix)
    );
  });

  it('escapes regex metacharacters so the filter matches one file', () => {
    // A bare dot would be a wildcard. Escaped, the filter is exact.
    const filter = toSpecFilter(POSIX_SPEC, POSIX_CWD, path.posix);
    expect(filter).toContain('\\.spec\\.ts');
    expect(new RegExp(filter).test(POSIX_SPEC)).toBe(true);
    expect(new RegExp(filter).test('/repo/x/public-landingXspecYts')).toBe(false);
  });

  it('keeps the checkout directory out of the pattern', () => {
    // A directory named `follio (old)` would otherwise put a capture group in
    // the regex and break matching for reasons nobody would look for.
    const filter = toSpecFilter(
      'C:\\dev\\follio (old)\\_admin-panel\\modules\\developer\\live-qa\\pathways\\x.spec.ts',
      'C:\\dev\\follio (old)',
      path.win32
    );

    expect(filter).not.toContain('(');
    expect(filter).toBe('_admin-panel/modules/developer/live-qa/pathways/x\\.spec\\.ts');
  });

  it('still normalises a spec outside the working directory', () => {
    const filter = toSpecFilter('C:\\elsewhere\\pathways\\x.spec.ts', WIN_CWD, path.win32);

    // Absolute, because it cannot be made relative — but with no backslashes.
    expect(filter).not.toContain('\\\\');
    expect(filter).toContain('elsewhere/pathways/x');
  });

  it('derives the filter from the catalog spec, unchanged', () => {
    for (const pathway of LIVE_QA_PATHWAYS) {
      // The catalog still owns the mapping: `pathways/<name>.spec.ts`.
      expect(pathway.spec, pathway.id).toMatch(/^pathways\/[a-z0-9-]+\.spec\.ts$/);

      const filter = toSpecFilter(
        path.win32.join(WIN_CWD, '_admin-panel\\modules\\developer\\live-qa', pathway.spec),
        WIN_CWD,
        path.win32
      );
      const escapedSpec = pathway.spec.split('.').join('\\.');
      expect(filter.endsWith(escapedSpec), pathway.id).toBe(true);
    }
  });
});

describe('the fix stays inside the one shared runner', () => {
  const runnerSource = read('_admin-panel/modules/developer/live-qa/runner.ts');

  it('builds the spec argv through the normaliser', () => {
    expect(runnerSource).toContain('toSpecFilter(path.join(liveQaRoot, pathway.spec), cwd)');
    // The old form is gone.
    expect(runnerSource).not.toMatch(
      /specArgs = pathways\.map\(\(pathway\) => path\.join\(liveQaRoot, pathway\.spec\)\)/
    );
  });

  it('is the only runner either surface calls', () => {
    // One definition, imported by the old panel's route and by the platform's
    // Live QA module. No second runner and no Test Console special case.
    expect(runnerSource.match(/export async function runLiveQa/g)).toHaveLength(1);

    expect(read('app/api/admin/developer/live-qa/run/route.ts')).toContain(
      "from '@/_admin-panel/modules/developer/live-qa'"
    );
    expect(read(SERVER_MODULE)).toContain("from '../../modules/developer/live-qa/runner'");
    expect(read(SERVER_MODULE)).not.toContain('toSpecFilter');
    expect(read(SERVER_MODULE)).not.toMatch(/specArgs|--config/);
  });

  it('changes spec selection and nothing else', () => {
    // Everything the runner did before it still does: the artifacts directory,
    // the environment, the config, the report and the result handling.
    for (const unchanged of [
      'artifactsDirForRun()',
      'fs.mkdirSync(artifactsDir, { recursive: true })',
      'LIVE_QA_ARTIFACTS_DIR: artifactsDir',
      'LIVE_QA_BASE_URL: baseUrl',
      'LIVE_QA_HEADED',
      'playwright.config.ts',
      'collectScreenshots(artifactsDir)',
      'parsePathwayResults(',
      'artifactsDir,',
    ]) {
      expect(runnerSource, `${unchanged} must survive`).toContain(unchanged);
    }
  });

  it('takes no path from a caller', () => {
    // The request carries ids and fixture choices; the spec path is derived
    // from the catalog inside the runner.
    const types = read('_admin-panel/modules/developer/live-qa/types.ts');

    expect(types).toContain('pathwayIds: string[]');
    expect(types).not.toMatch(/\bspecPath|\bspecs\?:|playwrightArgs/);
    expect(read(RUN_ROUTE)).not.toMatch(/body\.spec|body\.args|body\.config/);
  });
});

describe('the real Playwright CLI finds the spec', () => {
  it('discovers a catalog pathway using the filter the runner builds', () => {
    // Item 14a's done condition, against the installed CLI. `--list`
    // enumerates tests without launching a browser, so this needs no
    // browser download.
    const pathway = LIVE_QA_PATHWAYS.find((entry) => entry.id === 'public.landing')!;
    const cwd = process.cwd();
    const liveQaRoot = getLiveQaRoot();
    const config = toSpecFilter(path.join(liveQaRoot, 'playwright.config.ts'), cwd);
    const filter = toSpecFilter(path.join(liveQaRoot, pathway.spec), cwd);

    const list = (specFilter: string) =>
      spawnSync(
        process.execPath,
        [
          path.join(cwd, 'node_modules', '@playwright', 'test', 'cli.js'),
          'test',
          `--config=${path.join(liveQaRoot, 'playwright.config.ts')}`,
          '--list',
          specFilter,
        ],
        { cwd, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } }
      );

    const fixed = list(filter);
    const fixedText = `${fixed.stdout}${fixed.stderr}`;

    expect(fixedText, 'the normalised filter should find the spec').toContain(pathway.id);
    expect(fixedText).toMatch(/Total: 1 test in 1 file/);
    expect(fixedText).not.toContain('No tests found');

    // And the form the runner used to pass still finds nothing, which is
    // what made this a bug rather than a preference.
    const broken = list(path.join(liveQaRoot, pathway.spec));
    if (path.sep === '\\') {
      expect(`${broken.stdout}${broken.stderr}`).toContain('No tests found');
    }

    // The config path itself is passed as a value, not a filter, so it keeps
    // its native form — asserted so the two are not confused.
    expect(config).not.toContain('\\\\');
  }, 60_000);
});

/** Thin wrapper so the panel's props stay in one place in these tests. */
function LiveQaPanelFixture({
  pathways,
  canRun,
  authConfigured,
}: {
  pathways: ReturnType<typeof listRunnablePathways>;
  canRun: boolean;
  authConfigured: boolean;
}) {
  return (
    <LiveQaPanel
      pathways={pathways}
      canRun={canRun}
      gateReason="Local only."
      authConfigured={authConfigured}
      baseUrl="http://localhost:3000"
    />
  );
}
