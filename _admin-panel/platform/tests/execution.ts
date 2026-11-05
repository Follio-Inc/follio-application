import { randomUUID } from 'node:crypto';

import type { ProcessControl } from '../../modules/developer/process-tree';
import type {
  ActiveRunSnapshot,
  CancelResult,
  RunLifecycle,
  RunStep,
  RunnerKind,
} from './execution-types';
import { TERMINAL_LIFECYCLES } from './execution-types';

/**
 * The one active test run: the lock, the lifecycle and the cancel
 * (PLATFORM_TODO item 15).
 *
 * Server-only, and the single authority on what is executing. Item 15 asks for
 * one run at a time and a second one refused with a clear reason, so **one**
 * record is kept for the whole console: Vitest and Live QA share it, and a
 * start while it is occupied is refused rather than queued. Disabling a button
 * is not a lock — the refusal happens here, where both API routes and both
 * runners meet, so a second browser tab or a second `curl` is refused too.
 *
 * Ownership is a `try/finally`. `withRun` acquires the record, runs the body
 * and releases in a `finally`, so a thrown exception, a timeout, a cancelled
 * child, a malformed report and a crash in the parser all release the lock on
 * the way out. There is no other way to acquire it.
 *
 * It holds **only** the run in flight. When a run ends the record is dropped,
 * which is why there is no history here: run history, trends and flakiness are
 * item 16, and they need storage this deliberately does not have.
 *
 * Kept on `globalThis` for the same reason `lib/db.ts` keeps the Prisma client
 * there: the dev server can hold more than one instance of a module across
 * routes and hot reloads, and a lock that exists twice is not a lock.
 */

type ActiveRun = {
  runId: string;
  runner: RunnerKind;
  targetId: string;
  startedAt: string;
  startedAtMs: number;
  lifecycle: RunLifecycle;
  steps: RunStep[];
  cancelRequested: boolean;
  /** Set once the child exists. Null while spawning, and after the end. */
  control: ProcessControl | null;
  finished: boolean;
};

const globalForExecution = globalThis as unknown as {
  follioPlatformActiveRun?: ActiveRun | null;
};

function current(): ActiveRun | null {
  return globalForExecution.follioPlatformActiveRun ?? null;
}

function store(run: ActiveRun | null): void {
  globalForExecution.follioPlatformActiveRun = run;
}

function isTerminal(state: RunLifecycle): boolean {
  return TERMINAL_LIFECYCLES.includes(state);
}

function snapshotOf(run: ActiveRun, now: number): ActiveRunSnapshot {
  return {
    runId: run.runId,
    runner: run.runner,
    targetId: run.targetId,
    lifecycle: run.lifecycle,
    startedAt: run.startedAt,
    elapsedMs: Math.max(0, now - run.startedAtMs),
    steps: run.steps.map((step) => ({ ...step })),
    // A cancel before the child exists is still worth making: it is recorded
    // and applied the moment the child is attached.
    cancellable: !run.finished,
    cancelRequested: run.cancelRequested,
  };
}

/** How a runner reports progress and hands over control of its child. */
export type RunLease = {
  readonly runId: string;
  /** Records a transition. Ignored once the run is no longer the active one. */
  advance: (state: RunLifecycle) => void;
  /** Hands the registry a way to stop this run's child, and nothing else. */
  attachProcess: (control: ProcessControl) => void;
  /** Whether a cancel has been asked for. Checked before and after spawning. */
  cancelRequested: () => boolean;
};

export type AcquireResult =
  | { ok: true; lease: RunLease }
  | { ok: false; reason: 'busy'; active: ActiveRunSnapshot };

/** The active run, or null. What the status route serves. */
export function getActiveRun(now: number = Date.now()): ActiveRunSnapshot | null {
  const run = current();
  return run === null ? null : snapshotOf(run, now);
}

function leaseFor(run: ActiveRun): RunLease {
  const owns = () => current() === run;

  return {
    runId: run.runId,
    advance: (state) => {
      // A lease outliving its run can still be called by a late callback; it
      // must not resurrect a record or edit the one that replaced it.
      if (!owns() || run.finished) return;

      run.lifecycle = state;
      run.steps.push({ state, atMs: Math.max(0, Date.now() - run.startedAtMs) });
      if (isTerminal(state)) run.finished = true;
    },
    attachProcess: (control) => {
      if (!owns() || run.finished) return;
      run.control = control;

      // Cancelled between taking the lock and starting the child: stop it now
      // rather than waiting for a request that has already been made.
      if (run.cancelRequested) {
        void control.stop().catch(() => {
          // The run ends as cancelled either way; a refused kill is reported
          // to whoever asked, not from here.
        });
      }
    },
    cancelRequested: () => run.cancelRequested,
  };
}

/**
 * Takes the lock, or reports who has it.
 *
 * Atomic by virtue of the single-threaded server: nothing awaits between the
 * check and the assignment, so two simultaneous requests cannot both win.
 */
export function acquireRun(spec: { runner: RunnerKind; targetId: string }): AcquireResult {
  const now = Date.now();
  const occupant = current();
  if (occupant !== null) {
    return { ok: false, reason: 'busy', active: snapshotOf(occupant, now) };
  }

  const run: ActiveRun = {
    // Generated here, on the server. A client never names a run, and the id
    // says nothing about the process behind it.
    runId: randomUUID(),
    runner: spec.runner,
    targetId: spec.targetId,
    startedAt: new Date(now).toISOString(),
    startedAtMs: now,
    lifecycle: 'accepted',
    steps: [{ state: 'accepted', atMs: 0 }],
    cancelRequested: false,
    control: null,
    finished: false,
  };
  store(run);

  return { ok: true, lease: leaseFor(run) };
}

/** Drops the record if it is still the run that id belongs to. */
export function releaseRun(runId: string): void {
  if (current()?.runId === runId) store(null);
}

/**
 * Runs `body` as the one active run, or `onBusy` when something else is.
 *
 * The only way to hold the lock. The `finally` is the guarantee: every exit —
 * a result, a refusal, a timeout, a cancellation, a thrown exception — releases
 * it, so no code path can leave the console permanently busy.
 */
export async function withRun<T>(
  spec: { runner: RunnerKind; targetId: string },
  onBusy: (active: ActiveRunSnapshot) => T,
  body: (lease: RunLease) => Promise<T>
): Promise<T> {
  const acquired = acquireRun(spec);
  if (!acquired.ok) return onBusy(acquired.active);

  try {
    return await body(acquired.lease);
  } finally {
    releaseRun(acquired.lease.runId);
  }
}

/**
 * Cancels the run with this id, if it is the one that holds the lock.
 *
 * Three things have to be true before anything is killed: a run is active, it
 * is *this* run, and it still has a child. The caller supplies an opaque id and
 * nothing else — no pid, no name, no command — so the only process that can be
 * stopped is the one this module was handed.
 *
 * The lock is released by the runner's own `finally`, not here: the child's
 * exit has to make its way back through the runner so the run reports
 * `cancelled` instead of a missing report.
 */
export async function requestCancel(runId: string): Promise<CancelResult> {
  const run = current();

  if (run === null) {
    return {
      outcome: 'no-active-run',
      detail: 'Nothing is running. The run had already finished.',
      runId: null,
    };
  }

  if (run.runId !== runId) {
    return {
      outcome: 'not-the-active-run',
      detail: 'That run is not the one in progress, so it was left alone.',
      runId: run.runId,
    };
  }

  run.cancelRequested = true;

  const control = run.control;
  if (control === null) {
    return {
      outcome: 'cancelled',
      detail: 'Cancelled before the runner started. It will not be spawned.',
      runId: run.runId,
    };
  }

  try {
    await control.stop();
  } catch (error) {
    return {
      outcome: 'cancel-failed',
      detail: `The run could not be stopped: ${
        error instanceof Error ? error.message : 'unknown error'
      }. It may still be running.`,
      runId: run.runId,
    };
  }

  return {
    outcome: 'cancelled',
    detail: 'The runner and everything it started were stopped.',
    runId: run.runId,
  };
}

/** One sentence naming what holds the lock, for a refused start. */
export function busyDetailFor(active: ActiveRunSnapshot): string {
  const what = active.runner === 'vitest' ? 'unit test run' : 'Live QA run';
  const seconds = Math.round(active.elapsedMs / 1000);

  return `Refused: the ${what} of ${active.targetId} is still in progress (${seconds}s, ${active.lifecycle}). Only one run happens at a time — cancel it or wait for it to finish.`;
}
