/**
 * The one active test run, as the browser sees it (PLATFORM_TODO item 15).
 *
 * Client-safe: types and one constant, no `node:` import, nothing that spawns.
 * The run panels poll a snapshot of this shape and send back only an opaque
 * run id.
 *
 * Nothing here is a percentage, and nothing here is an estimate. Item 15 asks
 * for progress that streams during a run, and the only progress either runner
 * truthfully has mid-run is **which stage of execution it is in**, plus how
 * long it has been there. Vitest's JSON reporter and Playwright's `report.json`
 * are each written once, when the run ends — that is why they are trustworthy
 * as results, and it is also why there is no "47%" to report. A bar filling at
 * a guessed rate would be an invention, so the console shows the lifecycle and
 * the measured elapsed time instead.
 */

/** Which runner owns the active run. Both share one lock. */
export type RunnerKind = 'vitest' | 'live-qa';

/**
 * Where an execution has got to. Every state is observed, never predicted.
 *
 * - `accepted` — the run holds the lock; nothing has been spawned yet.
 * - `starting` — the server is about to spawn the runner.
 * - `running` — the child reported that it started (Node's `spawn` event).
 * - `reading-report` — the child has exited and the server is reading the
 *   JSON report it wrote.
 * - `completed` — execution finished and produced a report. Whether the tests
 *   passed is the result's business, not the lifecycle's.
 * - `failed` — execution itself did not produce a result: it could not start,
 *   it timed out, or it wrote no readable report.
 * - `cancelled` — someone cancelled it and the child was stopped.
 */
export type RunLifecycle =
  | 'accepted'
  | 'starting'
  | 'running'
  | 'reading-report'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * The order the lifecycle can advance in.
 *
 * A declaration, not a schedule: a run moves forward through this list and may
 * skip states (a child that never starts goes `starting` → `failed`), but it
 * never moves back. The three terminal states are mutually exclusive ends.
 */
export const LIFECYCLE_ORDER: readonly RunLifecycle[] = [
  'accepted',
  'starting',
  'running',
  'reading-report',
  'completed',
  'failed',
  'cancelled',
];

/** The states a run can still be in while it is the active run. */
export const TERMINAL_LIFECYCLES: readonly RunLifecycle[] = ['completed', 'failed', 'cancelled'];

/** One lifecycle transition, with when it happened. */
export type RunStep = {
  state: RunLifecycle;
  /** Milliseconds after the run was accepted. Measured, not estimated. */
  atMs: number;
};

/**
 * The active run, as the status route reports it.
 *
 * Carries no pid, no command, no argv and no path: a client that can read this
 * learns what is running and how to ask for it to stop, and nothing else.
 */
export type ActiveRunSnapshot = {
  /** Opaque, generated on the server. The only handle a client is given. */
  runId: string;
  runner: RunnerKind;
  /** The category or pathway id that was asked for. */
  targetId: string;
  lifecycle: RunLifecycle;
  /** ISO timestamp of when the run took the lock. */
  startedAt: string;
  /** Wall-clock milliseconds since then, measured at the moment of reading. */
  elapsedMs: number;
  /** Every transition so far, in order. The run's own progress, not a history. */
  steps: RunStep[];
  /** Whether a cancel would still do something. */
  cancellable: boolean;
  /** Whether a cancel has already been asked for. */
  cancelRequested: boolean;
};

/** What the status route returns. `null` means nothing is running. */
export type ExecutionStatus = {
  active: ActiveRunSnapshot | null;
};

/**
 * What came of a cancel request.
 *
 * - `cancelled` — the run was stopped, or will not start: the request was
 *   accepted while the child was still being spawned.
 * - `no-active-run` — nothing is running. The run had already finished.
 * - `not-the-active-run` — the id is not the run that holds the lock. A stale
 *   id from a reloaded page cannot stop somebody else's run.
 * - `cancel-failed` — the run is the active one and the platform refused to
 *   kill it. Said out loud rather than reported as a cancellation, because the
 *   process may still be running.
 */
export type CancelOutcome = 'cancelled' | 'no-active-run' | 'not-the-active-run' | 'cancel-failed';

export type CancelResult = {
  outcome: CancelOutcome;
  /** One sentence for the operator. Always present. */
  detail: string;
  /** The run that was acted on, when there was one. */
  runId: string | null;
};
