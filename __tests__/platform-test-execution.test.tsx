/**
 * Test Console: streaming progress, cancel and the concurrency lock
 * (PLATFORM_TODO item 15).
 *
 * Item 15's done condition is three things: progress streams during a run,
 * cancel terminates the child process, and a second concurrent run is refused
 * with a clear reason. So the assertions here are about the registry that owns
 * the one run, the lifecycle it reports, what a cancel actually reaches, and
 * that none of it disturbed how items 12–14 produce a result.
 *
 * Vitest is not spawned from inside Vitest and Playwright is not driven from
 * here: both runners take a seam, and the seams are driven through every exit —
 * a pass, a failing suite, a runner that cannot start, a timeout, a malformed
 * report, a cancellation and a thrown exception — which is how the lock is
 * shown to release on all of them.
 *
 * Two checks are real rather than seamed, because they are the ones a mock
 * could flatter:
 *
 * - `killProcessTree` is run against a **real process tree** on this machine: a
 *   Node process that spawns a Node grandchild, both confirmed alive, then
 *   stopped by the same call the cancel path uses, then both confirmed gone.
 * - `runLiveQa` is called with one argument, the way `/admin/developer` calls
 *   it, to prove the second parameter did not become required.
 */

import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { canRunDeveloperSuites } from '@/_admin-panel/modules/developer/guard';
import { runLiveQa } from '@/_admin-panel/modules/developer/live-qa';
import {
  killProcessTree,
  treeKillableSpawnOptions,
} from '@/_admin-panel/modules/developer/process-tree';
import type { LiveQaRunResult } from '@/_admin-panel/modules/developer/live-qa/types';
import type { PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import {
  acquireRun,
  busyDetailFor,
  getActiveRun,
  LIFECYCLE_ORDER,
  releaseRun,
  requestCancel,
  runCategory,
  runPathway,
  TERMINAL_LIFECYCLES,
  withRun,
  type ActiveRunSnapshot,
  type CategoryRunResult,
  type PathwayRunResult,
  type RunLifecycle,
  type VitestSpawner,
} from '@/_admin-panel/platform/tests';
import {
  LiveQaRunResult as LiveQaRunResultView,
  RunProgress,
  TestRunResult,
} from '@/_admin-panel/platform/ui';

const EXECUTION = '_admin-panel/platform/tests/execution.ts';
const EXECUTION_TYPES = '_admin-panel/platform/tests/execution-types.ts';
const PROCESS_TREE = '_admin-panel/modules/developer/process-tree.ts';
const RUNNER = '_admin-panel/platform/tests/runner.ts';
const LIVE_QA_MODULE = '_admin-panel/platform/tests/live-qa.ts';
const SHARED_LIVE_QA_RUNNER = '_admin-panel/modules/developer/live-qa/runner.ts';
const RUN_ROUTE = 'app/api/admin/platform/tests/run/route.ts';
const LIVE_QA_RUN_ROUTE = 'app/api/admin/platform/tests/live-qa/run/route.ts';
const ACTIVE_ROUTE = 'app/api/admin/platform/tests/active/route.ts';
const CANCEL_ROUTE = 'app/api/admin/platform/tests/cancel/route.ts';
const PANEL = '_admin-panel/platform/ui/test-run-panel.tsx';
const LIVE_QA_PANEL = '_admin-panel/platform/ui/live-qa-panel.tsx';
const RUN_HOOK = '_admin-panel/platform/ui/use-run-execution.ts';
const PROGRESS_VIEW = '_admin-panel/platform/ui/run-progress.tsx';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'stub',
    name: 'Stub',
    userDescription: 'A stub feature used to exercise the execution lock in isolation.',
    codeLocations: ['lib/utils.ts'],
    category: 'AI',
    status: 'shipped',
    unitTests: ['__tests__/example.test.ts'],
    pathways: [],
    ...overrides,
  };
}

const FEATURES = [feature({ id: 'one' })];

/** Vitest JSON reporter output, in the shape the real reporter produces. */
function reportFixture({ failing }: { failing: boolean }): string {
  return JSON.stringify({
    success: !failing,
    numTotalTestSuites: 1,
    numTotalTests: 1,
    numPassedTests: failing ? 0 : 1,
    numFailedTests: failing ? 1 : 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      {
        name: 'C:/repo/__tests__/example.test.ts',
        status: failing ? 'failed' : 'passed',
        startTime: 1,
        endTime: 3,
        message: '',
        assertionResults: [
          {
            ancestorTitles: ['example'],
            title: 'works',
            status: failing ? 'failed' : 'passed',
            duration: 2,
            failureMessages: failing ? ['AssertionError: expected 1 to be 2'] : [],
          },
        ],
      },
    ],
  });
}

/** A spawner that reports whatever outcome a test needs, without spawning. */
function fakeSpawner(
  outcome: Partial<{
    exitCode: number | null;
    stderr: string;
    timedOut: boolean;
    spawnError: string | null;
  }> = {}
): VitestSpawner {
  return async () => ({
    exitCode: 0,
    stderr: '',
    timedOut: false,
    spawnError: null,
    ...outcome,
  });
}

/** A Playwright run result, in the shape the shared runner returns. */
function liveQaOutcome(overrides: Partial<LiveQaRunResult> = {}): LiveQaRunResult {
  return {
    ok: true,
    exitCode: 0,
    durationMs: 1_200,
    startedAt: '2026-10-10T16:12:53.024Z',
    finishedAt: '2026-10-10T16:12:54.224Z',
    baseUrl: 'http://localhost:3000',
    pathwayIds: ['public.landing'],
    results: [],
    stdout: '',
    stderr: '',
    artifactsDir: 'C:/repo/_admin-panel/modules/developer/live-qa/.artifacts/run',
    ...overrides,
  };
}

const PATHWAY = 'public.landing';

/** A no-op control, and a record of whether it was asked to stop. */
function recordingControl() {
  const stops: number[] = [];
  return {
    stops,
    control: {
      stop: async () => {
        stops.push(Date.now());
      },
    },
  };
}

// A leaked lock would cascade into every test after it, which would hide which
// one leaked. The tests below assert the release themselves; this only keeps a
// failure local.
afterEach(() => {
  const active = getActiveRun();
  if (active !== null) releaseRun(active.runId);
});

describe('the concurrency lock', () => {
  it('gives the first run the slot and reports it as active', () => {
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    expect(acquired.ok).toBe(true);

    const active = getActiveRun();
    expect(active?.runner).toBe('vitest');
    expect(active?.targetId).toBe('AI');
    expect(active?.lifecycle).toBe('accepted');
    expect(active?.cancellable).toBe(true);
    expect(active?.cancelRequested).toBe(false);
  });

  it('refuses a second run as busy, naming what holds the slot', () => {
    const first = acquireRun({ runner: 'vitest', targetId: 'AI' });
    expect(first.ok).toBe(true);

    const second = acquireRun({ runner: 'vitest', targetId: 'Builder' });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe('busy');
    expect(second.ok === false && second.active.targetId).toBe('AI');

    // And it is a refusal, not a queue: the second call left no trace.
    expect(getActiveRun()?.targetId).toBe('AI');
  });

  it('generates its own opaque run ids', () => {
    const first = acquireRun({ runner: 'vitest', targetId: 'AI' });
    const firstId = first.ok ? first.lease.runId : '';
    releaseRun(firstId);
    const second = acquireRun({ runner: 'live-qa', targetId: PATHWAY });
    const secondId = second.ok ? second.lease.runId : '';

    for (const id of [firstId, secondId]) {
      // A UUID: not a counter, not a pid, and nothing about the target.
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(id).not.toContain('AI');
      expect(id).not.toContain(PATHWAY);
      expect(Number.isNaN(Number(id))).toBe(true);
    }
    expect(firstId).not.toBe(secondId);

    // Generated on the server: nothing takes an id as input to start a run.
    expect(read(EXECUTION)).toContain('randomUUID()');
    for (const route of [RUN_ROUTE, LIVE_QA_RUN_ROUTE]) {
      expect(read(route)).not.toContain('body.runId');
    }
  });

  it('releases the slot when the body returns', async () => {
    const result = await withRun(
      { runner: 'vitest', targetId: 'AI' },
      () => 'busy',
      async () => 'done'
    );

    expect(result).toBe('done');
    expect(getActiveRun()).toBeNull();
  });

  it('releases the slot when the body throws', async () => {
    await expect(
      withRun(
        { runner: 'vitest', targetId: 'AI' },
        () => 'busy',
        async () => {
          throw new Error('the parser blew up');
        }
      )
    ).rejects.toThrow('the parser blew up');

    // The whole point of the `finally`: a broken code path cannot leave the
    // console permanently busy.
    expect(getActiveRun()).toBeNull();
    expect(read(EXECUTION)).toMatch(/finally \{\s*releaseRun/);
  });

  it('hands the busy branch the snapshot of the run that holds the slot', async () => {
    const outer = acquireRun({ runner: 'live-qa', targetId: PATHWAY });
    let seen: ActiveRunSnapshot | null = null;

    await withRun(
      { runner: 'vitest', targetId: 'AI' },
      (active) => {
        seen = active;
        return null;
      },
      async () => {
        throw new Error('the body must not run while something else holds the slot');
      }
    );

    expect(seen).not.toBeNull();
    expect((seen as unknown as ActiveRunSnapshot).runner).toBe('live-qa');
    expect(busyDetailFor(seen as unknown as ActiveRunSnapshot)).toContain(PATHWAY);
    expect(busyDetailFor(seen as unknown as ActiveRunSnapshot)).toContain('Live QA');

    releaseRun(outer.ok ? outer.lease.runId : '');
  });

  it('keeps one record and no history', async () => {
    await withRun(
      { runner: 'vitest', targetId: 'AI' },
      () => undefined,
      async () => undefined
    );
    await withRun(
      { runner: 'vitest', targetId: 'Builder' },
      () => undefined,
      async () => undefined
    );

    // Two runs have been and gone and nothing can be retrieved: trends, last
    // pass and flakiness are item 16, and they need storage this has not got.
    expect(getActiveRun()).toBeNull();

    // Matched against the shape of the state, not against prose: the module's
    // own comment explains why there is no history here.
    const source = read(EXECUTION);
    expect(source).toMatch(/follioPlatformActiveRun\?: ActiveRun \| null/);
    expect(source, 'one record, not a list of them').not.toMatch(/ActiveRun\[\]/);
    expect(source).not.toMatch(/previousRuns|completedRuns|runHistory/);
    // Matched against import specifiers: the comment above the global names
    // `lib/db.ts` as the precedent for keeping a singleton there.
    expect(source).not.toMatch(/from '[^']*(prisma|lib\/db)/i);
  });

  it('does not store the lock in the database', () => {
    for (const file of [EXECUTION, EXECUTION_TYPES, PROCESS_TREE]) {
      const imports = [...read(file).matchAll(/from '([^']+)'/g)].map((match) => match[1]);
      for (const specifier of imports) {
        expect(
          specifier.startsWith('.') || specifier.startsWith('node:'),
          `${specifier} in ${file} is neither relative nor a node builtin`
        ).toBe(true);
      }
    }
  });
});

describe('the slot is shared by both runners', () => {
  it('refuses a Live QA run while a unit test run holds it', async () => {
    acquireRun({ runner: 'vitest', targetId: 'AI' });

    let ran = false;
    const result = await runPathway(PATHWAY, {
      canRun: true,
      authConfigured: true,
      run: async () => {
        ran = true;
        return liveQaOutcome();
      },
    });

    expect(result.outcome).toBe('busy');
    expect(result.ran).toBe(false);
    expect(ran, 'nothing may be spawned for a refused run').toBe(false);
    expect(result.detail).toContain('unit test run of AI');
    expect(result.detail).toContain('Only one run happens at a time');
  });

  it('refuses a unit test run while a Live QA run holds it', async () => {
    acquireRun({ runner: 'live-qa', targetId: PATHWAY });

    let ran = false;
    const result = await runCategory('AI', {
      features: FEATURES,
      canRun: true,
      spawner: async () => {
        ran = true;
        return { exitCode: 0, stderr: '', timedOut: false, spawnError: null };
      },
    });

    expect(result.outcome).toBe('busy');
    expect(result.ran).toBe(false);
    expect(ran, 'nothing may be spawned for a refused run').toBe(false);
    expect(result.detail).toContain(`Live QA run of ${PATHWAY}`);
    // The files it would have run are still named, so the refusal is legible.
    expect(result.filesNotReported).toEqual(result.filesRequested);
    expect(result.filesRequested.length).toBeGreaterThan(0);
  });

  it('refuses a second unit test run while the first is still in flight', async () => {
    // Two overlapping calls to the same entry point, which is what two browser
    // tabs do. One runs, one is refused; neither waits for the other.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = runCategory('AI', {
      features: FEATURES,
      canRun: true,
      spawner: async () => {
        await held;
        return { exitCode: 0, stderr: '', timedOut: false, spawnError: null };
      },
      readReport: () => reportFixture({ failing: false }),
    });

    const second = await runCategory('AI', {
      features: FEATURES,
      canRun: true,
      spawner: fakeSpawner(),
      readReport: () => reportFixture({ failing: false }),
    });

    expect(second.outcome).toBe('busy');

    release();
    expect((await first).outcome).toBe('passed');
    expect(getActiveRun()).toBeNull();
  });

  it('answers what needs no runner without taking the slot', async () => {
    const unknown = await runCategory('Nonsense', { features: FEATURES, canRun: true });
    expect(unknown.outcome).toBe('unknown-category');
    expect(getActiveRun()).toBeNull();

    const closed = await runCategory('AI', { features: FEATURES, canRun: false });
    expect(closed.outcome).toBe('gate-closed');
    expect(getActiveRun()).toBeNull();

    const empty = await runCategory('AI', {
      features: [feature({ id: 'none', unitTests: [] })],
      canRun: true,
    });
    expect(empty.outcome).toBe('no-tests');
    expect(getActiveRun()).toBeNull();
  });
});

describe('the slot is released however the run ends', () => {
  const cases: {
    name: string;
    options: Parameters<typeof runCategory>[1];
    outcome: CategoryRunResult['outcome'];
  }[] = [
    {
      name: 'a passing suite',
      options: {
        features: FEATURES,
        canRun: true,
        spawner: fakeSpawner(),
        readReport: () => reportFixture({ failing: false }),
      },
      outcome: 'passed',
    },
    {
      name: 'a failing suite',
      options: {
        features: FEATURES,
        canRun: true,
        spawner: fakeSpawner({ exitCode: 1 }),
        readReport: () => reportFixture({ failing: true }),
      },
      outcome: 'failed',
    },
    {
      name: 'a runner that could not start',
      options: {
        features: FEATURES,
        canRun: true,
        spawner: fakeSpawner({ spawnError: 'ENOENT' }),
      },
      outcome: 'runner-failed',
    },
    {
      name: 'a timeout',
      options: {
        features: FEATURES,
        canRun: true,
        spawner: fakeSpawner({ timedOut: true, exitCode: null }),
      },
      outcome: 'timed-out',
    },
    {
      name: 'a report that was never written',
      options: {
        features: FEATURES,
        canRun: true,
        spawner: fakeSpawner(),
        readReport: () => {
          throw new Error('ENOENT');
        },
      },
      outcome: 'report-unreadable',
    },
    {
      name: 'a report in a shape it cannot read',
      options: {
        features: FEATURES,
        canRun: true,
        spawner: fakeSpawner(),
        readReport: () => '{ "not": "a report" }',
      },
      outcome: 'report-unreadable',
    },
  ];

  for (const { name, options, outcome } of cases) {
    it(`releases it after ${name}`, async () => {
      const result = await runCategory('AI', options);

      expect(result.outcome).toBe(outcome);
      expect(getActiveRun(), `${name} left the slot occupied`).toBeNull();

      // And the console is usable again straight away.
      const next = await runCategory('AI', {
        features: FEATURES,
        canRun: true,
        spawner: fakeSpawner(),
        readReport: () => reportFixture({ failing: false }),
      });
      expect(next.outcome).toBe('passed');
    });
  }

  it('releases it after a thrown exception inside the run', async () => {
    await expect(
      runCategory('AI', {
        features: FEATURES,
        canRun: true,
        spawner: () => {
          throw new Error('the spawner itself threw');
        },
      })
    ).rejects.toThrow('the spawner itself threw');

    expect(getActiveRun()).toBeNull();
  });

  it('releases it after a cancellation', async () => {
    const { control, stops } = recordingControl();

    const result = await runCategory('AI', {
      features: FEATURES,
      canRun: true,
      spawner: async (_args, _root, hooks) => {
        hooks.onProcess?.(control);
        hooks.onStarted?.();
        await requestCancel(getActiveRun()!.runId);
        return { exitCode: null, stderr: '', timedOut: false, spawnError: null };
      },
    });

    expect(result.outcome).toBe('cancelled');
    expect(stops).toHaveLength(1);
    expect(getActiveRun()).toBeNull();
  });

  it('releases it after a cancelled Live QA run', async () => {
    const { control, stops } = recordingControl();

    const result = await runPathway(PATHWAY, {
      canRun: true,
      authConfigured: true,
      run: async (_id, hooks) => {
        hooks.onProcess?.(control);
        hooks.onStarted?.();
        await requestCancel(getActiveRun()!.runId);
        return liveQaOutcome({ ok: false, exitCode: null });
      },
    });

    expect(result.outcome).toBe('cancelled');
    expect(stops).toHaveLength(1);
    expect(getActiveRun()).toBeNull();
  });
});

describe('cancellation reaches the owned process and nothing else', () => {
  it('stops the run it was given the id of', async () => {
    const { control, stops } = recordingControl();
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    if (!acquired.ok) throw new Error('the slot should have been free');
    acquired.lease.attachProcess(control);

    const cancelled = await requestCancel(acquired.lease.runId);

    expect(cancelled.outcome).toBe('cancelled');
    expect(cancelled.runId).toBe(acquired.lease.runId);
    expect(stops, 'the process-control seam must be invoked').toHaveLength(1);
    expect(acquired.lease.cancelRequested()).toBe(true);
    expect(getActiveRun()?.cancelRequested).toBe(true);
  });

  it('leaves a run alone when the id is not the one in progress', async () => {
    const { control, stops } = recordingControl();
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    if (!acquired.ok) throw new Error('the slot should have been free');
    acquired.lease.attachProcess(control);

    const stale = await requestCancel('11111111-2222-3333-4444-555555555555');

    expect(stale.outcome).toBe('not-the-active-run');
    expect(stops, 'a stale id must reach no process').toHaveLength(0);
    expect(acquired.lease.cancelRequested()).toBe(false);
    expect(getActiveRun()?.runId).toBe(acquired.lease.runId);
  });

  it('says so when there is nothing to cancel', async () => {
    const result = await requestCancel('11111111-2222-3333-4444-555555555555');

    expect(result.outcome).toBe('no-active-run');
    expect(result.runId).toBeNull();
  });

  it('stops a run cancelled before its child existed, as soon as it exists', async () => {
    const { control, stops } = recordingControl();
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    if (!acquired.ok) throw new Error('the slot should have been free');

    // Cancelled in the window between taking the slot and spawning.
    const cancelled = await requestCancel(acquired.lease.runId);
    expect(cancelled.outcome).toBe('cancelled');
    expect(stops).toHaveLength(0);

    acquired.lease.attachProcess(control);
    await Promise.resolve();
    expect(stops, 'the child must be stopped the moment it is attached').toHaveLength(1);
  });

  it('reports a kill it could not make, rather than claiming one', async () => {
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    if (!acquired.ok) throw new Error('the slot should have been free');
    acquired.lease.attachProcess({
      stop: async () => {
        throw new Error('taskkill exited 1: Access is denied');
      },
    });

    const result = await requestCancel(acquired.lease.runId);

    // A real distinct condition: the run is the right one and the platform
    // refused. Saying "cancelled" here would claim a dead process that is not.
    expect(result.outcome).toBe('cancel-failed');
    expect(result.detail).toContain('Access is denied');
    expect(result.detail).toContain('may still be running');
  });

  it('takes an opaque id and nothing else from the browser', () => {
    const route = read(CANCEL_ROUTE);

    expect(route).toMatch(/runId\?: unknown/);
    expect(route).toMatch(/typeof body\.runId === 'string'/);
    expect(route).toContain("{ error: 'Missing runId' }, { status: 400 }");
    expect(route).toContain('requestCancel(runId)');

    // Not a pid, not a process name, not a command, not a path.
    for (const forbidden of [
      'body.pid',
      'body.processId',
      'body.name',
      'body.command',
      'body.signal',
      'body.path',
      'body.args',
    ]) {
      expect(route, `${forbidden} must not be read`).not.toContain(forbidden);
    }
    expect(route).not.toMatch(/child_process|process\.kill|taskkill|spawn\(/);

    // And nothing a client can see carries one either.
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    expect(Object.keys(getActiveRun() ?? {}).sort()).toEqual([
      'cancelRequested',
      'cancellable',
      'elapsedMs',
      'lifecycle',
      'runId',
      'runner',
      'startedAt',
      'steps',
      'targetId',
    ]);
    releaseRun(acquired.ok ? acquired.lease.runId : '');
    // Matched against field declarations, not prose: that file's comments say
    // out loud which of these it refuses to carry.
    for (const field of ['pid', 'processId', 'argv', 'command', 'spec', 'path']) {
      expect(read(EXECUTION_TYPES), `${field} must not be a field`).not.toMatch(
        new RegExp(`^\\s*${field}\\??:`, 'm')
      );
    }
  });
});

describe('a cancelled run is not a failure', () => {
  it('is its own outcome, with no report read', async () => {
    const { control } = recordingControl();
    let reportReads = 0;

    const result = await runCategory('AI', {
      features: FEATURES,
      canRun: true,
      spawner: async (_args, _root, hooks) => {
        hooks.onProcess?.(control);
        hooks.onStarted?.();
        await requestCancel(getActiveRun()!.runId);
        // Killed: a non-zero exit and no report, exactly like the real thing.
        return { exitCode: 1, stderr: '', timedOut: false, spawnError: null };
      },
      readReport: () => {
        reportReads += 1;
        throw new Error('ENOENT');
      },
    });

    expect(result.outcome).toBe('cancelled');
    expect(result.outcome).not.toBe('failed');
    expect(result.outcome).not.toBe('timed-out');
    expect(result.outcome).not.toBe('report-unreadable');
    expect(result.ran).toBe(false);
    expect(result.totals).toBeNull();
    expect(result.files).toEqual([]);
    expect(result.detail).toContain('Cancelled');
    // Checked before the report is looked for, so a deliberate stop never
    // arrives dressed as a missing report.
    expect(reportReads).toBe(0);
  });

  it('is distinguished from a timeout, which the same exit code would give', async () => {
    const timedOut = await runCategory('AI', {
      features: FEATURES,
      canRun: true,
      spawner: fakeSpawner({ timedOut: true, exitCode: 1 }),
    });

    expect(timedOut.outcome).toBe('timed-out');
    expect(timedOut.detail).not.toContain('Cancelled');
  });

  it('shows as Cancelled rather than as a failing suite', () => {
    const cancelled: CategoryRunResult = {
      outcome: 'cancelled',
      ran: false,
      categoryId: 'AI',
      filesRequested: ['__tests__/example.test.ts'],
      filesReported: [],
      filesNotReported: ['__tests__/example.test.ts'],
      totals: null,
      files: [],
      durationMs: 4_000,
      exitCode: 1,
      detail: 'Cancelled after 4s. The runner and its workers were stopped.',
      runnerOutput: null,
    };

    const html = renderToStaticMarkup(<TestRunResult result={cancelled} />);

    expect(html).toContain('Cancelled');
    expect(html).not.toMatch(/No results to show/);
    expect(html).not.toMatch(/problem with the run itself/);
    // Not dressed as a timeout or a failing suite. ("nothing timed out" is the
    // copy saying exactly that, so the outcome word is what gets checked.)
    expect(html).not.toContain('timed-out');
    expect(html).not.toMatch(/tests failed/);
  });

  it('shows a refused start as a refusal, naming what is running', () => {
    const busy: CategoryRunResult = {
      outcome: 'busy',
      ran: false,
      categoryId: 'Builder',
      filesRequested: ['__tests__/example.test.ts'],
      filesReported: [],
      filesNotReported: ['__tests__/example.test.ts'],
      totals: null,
      files: [],
      durationMs: 0,
      exitCode: null,
      detail: 'Refused: the Live QA run of public.landing is still in progress (6s, running).',
      runnerOutput: null,
    };

    const html = renderToStaticMarkup(<TestRunResult result={busy} />);

    expect(html).toContain('already in progress');
    expect(html).toContain('public.landing');
    expect(html).toContain('nothing was queued');
    expect(html).not.toMatch(/No results to show|tests failed/);
  });

  it('shows a cancelled pathway as Cancelled, with its artifacts left alone', () => {
    const cancelled: PathwayRunResult = {
      outcome: 'cancelled',
      ran: false,
      pathwayId: PATHWAY,
      pathwayTitle: 'Marketing landing',
      requiresAuth: false,
      authConfigured: false,
      baseUrl: 'http://localhost:3000',
      startedAt: null,
      durationMs: 3_000,
      exitCode: null,
      totals: null,
      cases: [],
      reportErrors: [],
      detail: 'Cancelled after 3s. Playwright and its browsers were stopped.',
      runnerOutput: null,
      artifactsDir: '.artifacts/2026-10-10T16-12-53-024Z',
    };

    const html = renderToStaticMarkup(<LiveQaRunResultView result={cancelled} />);

    expect(html).toContain('Cancelled');
    expect(html).toContain('.artifacts/2026-10-10T16-12-53-024Z');
    expect(html).not.toMatch(/No results to show|tests failed/);
    expect(html).not.toMatch(/problem with the run/);
    // Nothing in either view deletes an artifact.
    expect(read('_admin-panel/platform/ui/live-qa-result.tsx')).not.toMatch(/rmSync|unlink/);
  });
});

describe('progress is observed, never estimated', () => {
  it('advances through the lifecycle in order, as the run reaches each stage', async () => {
    const seen: RunLifecycle[] = [];
    const observe = () => {
      const active = getActiveRun();
      if (active !== null) seen.push(active.lifecycle);
    };

    const result = await runCategory('AI', {
      features: FEATURES,
      canRun: true,
      spawner: async (_args, _root, hooks) => {
        observe();
        hooks.onProcess?.({ stop: async () => {} });
        hooks.onStarted?.();
        observe();
        return { exitCode: 0, stderr: '', timedOut: false, spawnError: null };
      },
      readReport: () => {
        observe();
        return reportFixture({ failing: false });
      },
    });

    expect(seen).toEqual(['starting', 'running', 'reading-report']);
    expect(result.outcome).toBe('passed');

    // Each state observed is in the declared order, and none repeats or
    // goes back.
    const positions = seen.map((state) => LIFECYCLE_ORDER.indexOf(state));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('records every transition with the time it happened', async () => {
    let steps: ActiveRunSnapshot['steps'] = [];

    await runCategory('AI', {
      features: FEATURES,
      canRun: true,
      spawner: async (_args, _root, hooks) => {
        hooks.onStarted?.();
        return { exitCode: 0, stderr: '', timedOut: false, spawnError: null };
      },
      readReport: () => {
        steps = getActiveRun()!.steps;
        return reportFixture({ failing: false });
      },
    });

    expect(steps.map((step) => step.state)).toEqual([
      'accepted',
      'starting',
      'running',
      'reading-report',
    ]);
    for (const step of steps) {
      expect(Number.isInteger(step.atMs)).toBe(true);
      expect(step.atMs).toBeGreaterThanOrEqual(0);
    }
    // Measured, so non-decreasing.
    expect(steps.map((step) => step.atMs)).toEqual(
      [...steps.map((step) => step.atMs)].sort((a, b) => a - b)
    );
  });

  it('reaches a terminal state and then stops moving', () => {
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    if (!acquired.ok) throw new Error('the slot should have been free');

    acquired.lease.advance('starting');
    acquired.lease.advance('running');
    acquired.lease.advance('cancelled');
    // A late callback must not resurrect a finished run.
    acquired.lease.advance('completed');

    const active = getActiveRun()!;
    expect(active.lifecycle).toBe('cancelled');
    expect(active.steps.map((step) => step.state)).toEqual([
      'accepted',
      'starting',
      'running',
      'cancelled',
    ]);
    expect(active.cancellable).toBe(false);
    expect(TERMINAL_LIFECYCLES).toContain(active.lifecycle);
  });

  it('measures the elapsed time instead of counting it down', () => {
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    const startedAtMs = Date.parse(getActiveRun()!.startedAt);

    expect(getActiveRun(startedAtMs + 5_000)?.elapsedMs).toBe(5_000);
    expect(getActiveRun(startedAtMs + 12_500)?.elapsedMs).toBe(12_500);
    // Never negative, whatever clock the caller holds.
    expect(getActiveRun(startedAtMs - 1_000)?.elapsedMs).toBe(0);

    releaseRun(acquired.ok ? acquired.lease.runId : '');
  });

  it('emits no percentage and no bar', () => {
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    const active = getActiveRun()!;
    active.steps.push({ state: 'running', atMs: 2_400 });

    const html = renderToStaticMarkup(
      <RunProgress active={active} cancelling={false} cancelNotice={null} onCancel={() => {}} />
    );

    // Nothing proportional: no bar element, no ARIA progress role, and not a
    // single per-cent sign in the markup.
    expect(html).not.toContain('<progress');
    expect(html).not.toContain('progressbar');
    expect(html).not.toContain('%');
    // No field to put one in, either.
    for (const absent of ['percent', 'progress', 'remaining', 'eta', 'total']) {
      expect(Object.keys(active), `${absent} is not something either runner knows`).not.toContain(
        absent
      );
    }

    releaseRun(acquired.ok ? acquired.lease.runId : '');
  });

  it('shows the target, the stage and a cancel control while it runs', () => {
    const acquired = acquireRun({ runner: 'live-qa', targetId: PATHWAY });
    const active = getActiveRun()!;

    const html = renderToStaticMarkup(
      <RunProgress active={active} cancelling={false} cancelNotice={null} onCancel={() => {}} />
    );

    expect(html).toContain(PATHWAY);
    expect(html).toContain('Live QA');
    expect(html).toContain('holding the run slot');
    expect(html).toContain('Cancel');
    expect(html).toContain('role="status"');

    releaseRun(acquired.ok ? acquired.lease.runId : '');
  });

  it('offers no cancel for a run that has already finished', () => {
    const acquired = acquireRun({ runner: 'vitest', targetId: 'AI' });
    if (!acquired.ok) throw new Error('the slot should have been free');
    acquired.lease.advance('completed');

    const html = renderToStaticMarkup(
      <RunProgress
        active={getActiveRun()!}
        cancelling={false}
        cancelNotice="The runner and everything it started were stopped."
        onCancel={() => {}}
      />
    );

    expect(html).toContain('disabled');
    expect(html).toContain('were stopped');
  });

  it('polls the status route and sends nothing with it', () => {
    const hook = read(RUN_HOOK);

    expect(hook).toContain("'/api/admin/platform/tests/active'");
    // A chain of timeouts, so a slow response cannot leave two polls in
    // flight, and it stops on unmount.
    expect(hook).toContain('setTimeout(() => void poll(), POLL_MS)');
    expect(hook).toMatch(/clearTimeout/);
    expect(hook).not.toContain('WebSocket');
    expect(hook).not.toContain('setInterval');
    expect(read(ACTIVE_ROUTE)).not.toMatch(/searchParams|request\.json|body/);
  });
});

describe('every execution surface is admin-only and local-only', () => {
  const surfaces: { file: string; handler: string; action: string }[] = [
    { file: RUN_ROUTE, handler: 'export async function POST', action: 'runCategory' },
    { file: LIVE_QA_RUN_ROUTE, handler: 'export async function POST', action: 'runPathway' },
    { file: ACTIVE_ROUTE, handler: 'export async function GET', action: 'getActiveRun' },
    { file: CANCEL_ROUTE, handler: 'export async function POST', action: 'requestCancel' },
  ];

  for (const { file, handler, action } of surfaces) {
    it(`${file} requires admin auth and the existing gate before ${action}`, () => {
      const source = read(file);
      const body = source.slice(source.indexOf(handler));

      expect(source).toMatch(/await requireAdmin\(\)/);
      expect(source).toContain('assertCanRunDeveloperSuites()');
      expect(body.indexOf('requireAdmin')).toBeLessThan(body.indexOf(action));
      expect(body.indexOf('assertCanRunDeveloperSuites')).toBeLessThan(body.indexOf(action));

      // The existing guard, not a weaker copy of it.
      expect(source).toContain("from '@/_admin-panel/modules/developer/guard'");
      expect(source).toContain('DeveloperSuitesDisabledError');
      expect(source).toContain("runtime = 'nodejs'");
      expect(source).toContain("dynamic = 'force-dynamic'");
    });
  }

  it('checks the gate before the lock is taken', async () => {
    const result = await runCategory('AI', { features: FEATURES, canRun: false });

    expect(result.outcome).toBe('gate-closed');
    expect(getActiveRun()).toBeNull();
    // The gate's own default, not a second reading of the environment.
    expect(read(RUNNER)).toContain('canRunDeveloperSuites()');
    expect(read(LIVE_QA_MODULE)).toContain('canRunDeveloperSuites()');
    expect(canRunDeveloperSuites({ nodeEnv: 'production', enabledFlag: 'true' })).toBe(false);
  });

  it('refuses a busy start with a status code as well as an outcome', () => {
    for (const route of [RUN_ROUTE, LIVE_QA_RUN_ROUTE]) {
      expect(read(route)).toContain("result.outcome === 'busy' ? 409 : 200");
    }
    // And the client renders that body rather than discarding it.
    expect(read(RUN_HOOK)).toContain('response.status === 409');
  });

  it('keeps execution out of the product', () => {
    // Nothing outside the admin panel and its own admin routes may reach the
    // registry or the process-tree helper.
    const roots = ['app', 'lib', 'services', 'components', 'hooks'];
    const allowed = /^app[\\/](admin|api[\\/]admin)[\\/]/;
    const offenders: string[] = [];

    for (const root of roots) {
      let entries: string[];
      try {
        entries = readdirSync(path.join(process.cwd(), root), { recursive: true }) as string[];
      } catch {
        continue;
      }

      for (const entry of entries) {
        const relative = path.join(root, entry);
        if (!/\.(ts|tsx)$/.test(relative)) continue;

        const source = readFileSync(path.join(process.cwd(), relative), 'utf8');
        const reaches = /process-tree|platform\/tests/.test(source);
        if (reaches && !allowed.test(relative)) offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('the result still comes from the reporters', () => {
  it('reads the Vitest verdict from the JSON reporter, as item 12 left it', async () => {
    const runner = read(RUNNER);

    expect(runner).toContain('--reporter=json');
    expect(runner).toContain('`--outputFile=${reportPath}`');
    expect(runner).toContain('parseVitestReport(raw, repoRoot)');
    // stdout is still drained and discarded: no verdict is scraped from it.
    expect(runner).toMatch(/child\.stdout\?\.resume\(\)/);
    expect(runner).not.toMatch(/stdout \+=/);

    const result = await runCategory('AI', {
      features: FEATURES,
      canRun: true,
      spawner: fakeSpawner({ exitCode: 1 }),
      readReport: () => reportFixture({ failing: true }),
    });

    expect(result.ran).toBe(true);
    expect(result.outcome).toBe('failed');
    expect(result.totals).toEqual({
      files: 1,
      tests: 1,
      passed: 0,
      failed: 1,
      pending: 0,
      todo: 0,
    });
    expect(result.files[0]?.tests[0]?.failures[0]?.message).toContain('expected 1 to be 2');
  });

  it('reads the Live QA verdict from report.json, as item 14 left it', async () => {
    const module_ = read(LIVE_QA_MODULE);

    expect(module_).toContain("const REPORT_FILENAME = 'report.json'");
    expect(module_).toContain('parsePathwayReport(raw, pathwayId');

    const report = JSON.stringify({
      stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0, duration: 1200 },
      errors: [],
      suites: [
        {
          title: 'public-landing.spec.ts',
          suites: [
            {
              title: PATHWAY,
              specs: [
                {
                  title: 'marketing landing loads with a primary CTA',
                  tests: [{ status: 'expected', results: [{ status: 'passed', duration: 900 }] }],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await runPathway(PATHWAY, {
      canRun: true,
      authConfigured: true,
      run: async () => liveQaOutcome(),
      readReport: () => report,
    });

    expect(result.ran).toBe(true);
    expect(result.outcome).toBe('passed');
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]?.durationMs).toBe(900);
  });

  it('keeps item 14a’s spec filter and the one shared runner', () => {
    const shared = read(SHARED_LIVE_QA_RUNNER);

    expect(shared).toContain('toSpecFilter(path.join(liveQaRoot, pathway.spec), cwd)');
    expect(shared.match(/export async function runLiveQa/g)).toHaveLength(1);
    // Item 15 added hooks to the spawn and changed nothing else about it.
    for (const unchanged of [
      'artifactsDirForRun()',
      'LIVE_QA_ARTIFACTS_DIR: artifactsDir',
      'playwright.config.ts',
      'collectScreenshots(artifactsDir)',
      'parsePathwayResults(',
    ]) {
      expect(shared, `${unchanged} must survive`).toContain(unchanged);
    }
    expect(read(LIVE_QA_MODULE)).not.toContain('toSpecFilter');
  });

  it('still runs for /admin/developer, which passes no hooks', async () => {
    // The old route calls `runLiveQa(request)` with one argument. Called that
    // way with an id no catalog has, it refuses without spawning anything —
    // which is the existing behaviour, and proves the new second parameter is
    // optional in fact and not only in the type.
    const result = await runLiveQa({ pathwayIds: ['not.a.pathway'] });

    expect(result.ok).toBe(false);
    expect(result.stderr).toBe('No matching pathways');
    expect(read('app/api/admin/developer/live-qa/run/route.ts')).toContain('runLiveQa(');
  });

  it('leaves the item-11 inventory alone', () => {
    const console_ = read('_admin-panel/platform/ui/test-console.tsx');

    expect(console_).not.toContain("'use client'");
    expect(console_).not.toMatch(/execution|cancel|runId/i);
    expect(console_).toContain('runPanel');
    expect(console_).toContain('liveQaPanel');
  });
});

describe('stopping a process tree', () => {
  it('uses taskkill with the tree flag on Windows', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const child = { pid: 4242, exitCode: null, signalCode: null } as ChildProcess;

    await killProcessTree(child, {
      platform: 'win32',
      spawner: ((command: string, args: readonly string[]) => {
        calls.push({ command, args });
        return {
          stderr: { on: () => {} },
          on: (event: string, handler: (code: number) => void) => {
            if (event === 'close') handler(0);
          },
        } as unknown as ReturnType<typeof spawn>;
      }) as unknown as typeof spawn,
    });

    // `/t` is the tree and `/f` is forced: Vitest's forked workers and
    // Playwright's browsers are children of the process we hold.
    expect(calls).toEqual([{ command: 'taskkill', args: ['/pid', '4242', '/t', '/f'] }]);
  });

  it('treats an already-gone process as stopped, and a refusal as a failure', async () => {
    const windowsKill = (code: number, stderr: string) =>
      killProcessTree({ pid: 7, exitCode: null, signalCode: null } as ChildProcess, {
        platform: 'win32',
        spawner: (() =>
          ({
            stderr: {
              on: (_event: string, handler: (chunk: Buffer) => void) =>
                handler(Buffer.from(stderr, 'utf8')),
            },
            on: (event: string, handler: (value: number) => void) => {
              if (event === 'close') handler(code);
            },
          }) as unknown as ReturnType<typeof spawn>) as unknown as typeof spawn,
      });

    await expect(windowsKill(0, '')).resolves.toBeUndefined();
    // What taskkill says about a pid that has already exited.
    await expect(windowsKill(128, 'ERROR: The process "7" not found.')).resolves.toBeUndefined();
    // And a real refusal is reported, which is what makes `cancel-failed`
    // possible rather than a cancel that silently did nothing.
    await expect(windowsKill(1, 'ERROR: Access is denied.')).rejects.toThrow('Access is denied');
  });

  it('signals the process group everywhere else', async () => {
    const signals: { pid: number; signal: string | number }[] = [];
    const child = { pid: 99, exitCode: null, signalCode: null } as ChildProcess;

    await killProcessTree(child, {
      platform: 'linux',
      kill: ((pid: number, signal: string | number) => {
        signals.push({ pid, signal });
        return true;
      }) as unknown as typeof process.kill,
      graceMs: 10_000,
    });

    // The negative pid is the group, which is why the child is spawned
    // detached there.
    expect(signals).toEqual([{ pid: -99, signal: 'SIGTERM' }]);
  });

  it('falls back to the child alone when it is not a group leader', async () => {
    const killed: (string | number | undefined)[] = [];
    const child = {
      pid: 99,
      exitCode: null,
      signalCode: null,
      kill: (signal?: string | number) => {
        killed.push(signal);
        return true;
      },
    } as unknown as ChildProcess;

    await killProcessTree(child, {
      platform: 'linux',
      kill: (() => {
        throw new Error('ESRCH');
      }) as unknown as typeof process.kill,
    });

    expect(killed).toEqual(['SIGTERM']);
  });

  it('does nothing for a child that has already exited', async () => {
    let spawned = 0;
    await killProcessTree({ pid: 5, exitCode: 0, signalCode: null } as ChildProcess, {
      platform: 'win32',
      spawner: (() => {
        spawned += 1;
        return {} as unknown as ReturnType<typeof spawn>;
      }) as unknown as typeof spawn,
    });

    expect(spawned).toBe(0);
  });

  it('is how both runners spawn and both cancels stop', () => {
    expect(treeKillableSpawnOptions('win32')).toEqual({ detached: false, windowsHide: true });
    expect(treeKillableSpawnOptions('darwin')).toEqual({ detached: true, windowsHide: true });

    for (const file of [RUNNER, SHARED_LIVE_QA_RUNNER]) {
      const source = read(file);
      expect(source, `${file} must spawn a killable tree`).toContain(
        '...treeKillableSpawnOptions()'
      );
      expect(source, `${file} must hand over a stop`).toContain(
        'stop: () => killProcessTree(child)'
      );
    }
    // One implementation, shared — not a copy per runner.
    expect(read(PROCESS_TREE).match(/export async function killProcessTree/g)).toHaveLength(1);
  });
});

describe('a real process tree on this machine', () => {
  /** Whether a pid is still running, asked of the OS. */
  function isAlive(pid: number): boolean {
    if (process.platform === 'win32') {
      const listed = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
      return `${listed.stdout}`.includes(String(pid));
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async function waitUntilGone(pids: number[], timeoutMs = 10_000): Promise<number[]> {
    const deadline = Date.now() + timeoutMs;
    let alive = pids.filter(isAlive);
    while (alive.length > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      alive = alive.filter(isAlive);
    }
    return alive;
  }

  it('stops the child and its grandchild, not just the process it was handed', async () => {
    // A parent that spawns a child of its own and prints its pid, then both
    // sit idle. The grandchild is `detached` on purpose, because that is the
    // case this is here to rule out: measured on this machine, killing the
    // parent alone leaves a detached grandchild running (`child.kill()` →
    // parent gone, grandchild alive), while walking the tree takes both. A
    // grandchild that is *not* detached happens to die with its parent here,
    // so a test built on one would pass whether the tree was walked or not.
    const script = [
      "const { spawn } = require('child_process');",
      "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });",
      'console.log(grandchild.pid);',
      'setInterval(() => {}, 1000);',
    ].join('\n');

    const parent = spawn(process.execPath, ['-e', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...treeKillableSpawnOptions(),
    });

    const grandchildPid = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the parent printed no pid')), 15_000);
      parent.stdout?.on('data', (chunk: Buffer) => {
        const value = Number.parseInt(chunk.toString('utf8').trim(), 10);
        if (Number.isInteger(value)) {
          clearTimeout(timer);
          resolve(value);
        }
      });
    });
    const parentPid = parent.pid as number;

    try {
      // Non-vacuity: both are really running before anything is killed.
      expect(isAlive(parentPid), 'the parent should be running').toBe(true);
      expect(isAlive(grandchildPid), 'the grandchild should be running').toBe(true);

      await killProcessTree(parent);

      expect(await waitUntilGone([parentPid, grandchildPid])).toEqual([]);
    } finally {
      // Whatever happened above, leave nothing behind.
      for (const pid of [parentPid, grandchildPid]) {
        if (isAlive(pid)) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // Already gone.
          }
        }
      }
    }
  }, 40_000);
});
