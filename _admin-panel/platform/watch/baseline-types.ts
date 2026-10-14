/**
 * The CI failure baseline (PLATFORM_TODO item 26).
 *
 * Client-safe: types only.
 *
 * ## Why this exists rather than reusing item 16's history
 *
 * Item 16's run history is local JSON under `_admin-panel/platform/.runs/`,
 * and it is gitignored on purpose — it is one operator's record of what they
 * ran on their machine. A scheduled run on a GitHub runner has no access to
 * it and never will, so pretending the two are one store would mean a CI job
 * silently comparing against nothing and calling every failure new.
 *
 * They are therefore separate stores with **one shared rule**: test identity.
 * `historyTestIdentity` from item 16 decides what counts as the same test on
 * both sides, so a test that is "the same test" locally is the same test in
 * CI, and the two can never disagree about which test moved.
 *
 * ## What it holds, and what it refuses to hold
 *
 * Per test: the last few statuses and where they were seen. That is the
 * minimum that can answer "is this failure new?" — a single last status
 * cannot tell a newly-failing test from one that has been flapping for a
 * week, and the difference decides whether anyone should be paged.
 *
 * It holds no stdout, no stack traces, no environment, no auth state, no
 * absolute paths and no secrets. A test asserts that against a run carrying
 * a planted canary.
 */

import type { PerfReport } from '../perf/types';

/** Item 16's vocabulary, so both stores speak one language. */
export type BaselineStatus = 'passed' | 'failed' | 'skipped' | 'todo' | 'unknown';

/**
 * Why a test's current failure is, or is not, worth telling anyone about.
 *
 * - `first-observed` — the baseline has never seen this test. New.
 * - `newly-failing` — it passed last time. New.
 * - `already-failing` — it failed last time too. Not new; nobody needs
 *   telling twice.
 * - `flaky` — the window shows the test *recovering* after a failure, so it
 *   is already known to be unreliable. Reporting each flap as a new failure
 *   is how a notification channel gets muted. Note the rule is recovery,
 *   not "has ever passed": a test that passed, broke and stayed broken is
 *   `already-failing`, and calling that flaky would invite dismissing it.
 */
export type FailureClass = 'first-observed' | 'newly-failing' | 'already-failing' | 'flaky';

/** One test, as the baseline remembers it. */
export type BaselineTest = {
  /** `historyTestIdentity()` — item 16's rule, shared deliberately. */
  id: string;
  /** Repo-relative. Never an absolute path. */
  file: string | null;
  suite: string[];
  name: string;
  /**
   * The last `BASELINE_WINDOW` statuses, oldest first.
   *
   * A window rather than a single value because flapping and regressing look
   * identical through one observation.
   */
  recent: BaselineStatus[];
  /** The commit of the most recent observation, when the run knew one. */
  lastCommit: string | null;
  /** ISO timestamp of the most recent observation. */
  lastSeenAt: string;
};

/** One target's slice of the baseline. */
export type BaselineTarget = {
  /** `vitest` today. Live QA is reported, not baselined — see `watch/run.ts`. */
  runner: 'vitest' | 'live-qa';
  /** The category id, straight from the coverage map. */
  targetId: string;
  /** The last outcome for the target as a whole. */
  lastOutcome: string;
  lastRunAt: string;
  tests: BaselineTest[];
};

/**
 * The persisted file.
 *
 * `version` is checked on read: a file from a future or unknown format is
 * discarded rather than half-understood, and the run then treats every
 * failure as first-observed and says so.
 */
export type Baseline = {
  version: 1;
  /** When this file was written. */
  updatedAt: string;
  targets: BaselineTarget[];
};

/** A failing test, classified against the baseline. */
export type ClassifiedFailure = {
  runner: 'vitest' | 'live-qa';
  targetId: string;
  id: string;
  file: string | null;
  suite: string[];
  name: string;
  classification: FailureClass;
  /** True for `first-observed` and `newly-failing` only. */
  isNew: boolean;
  /** What the baseline had, in one phrase, for the summary. */
  evidence: string;
};

/**
 * Why a target produced no comparable test results.
 *
 * These are kept apart from failures on purpose: none of them is a product
 * test failing, and treating any of them as one would turn a broken runner
 * or an unconfigured prerequisite into a false alarm.
 */
export type NonComparableReason =
  | 'cancelled'
  | 'infrastructure'
  | 'prerequisite-missing'
  | 'nothing-to-run';

export type NonComparableTarget = {
  runner: 'vitest' | 'live-qa';
  targetId: string;
  reason: NonComparableReason;
  /** The runner's own outcome word, passed through. */
  outcome: string;
  detail: string;
};

/** Everything one watch run concluded. */
export type WatchReport = {
  /** `schedule` or `post-merge`, from the workflow event. */
  trigger: string;
  commit: string | null;
  branch: string | null;
  startedAt: string;
  durationMs: number;
  /** True when no usable baseline was found, so nothing was comparable. */
  baselineMissing: boolean;
  targetsRun: number;
  testsObserved: number;
  /** Failures worth telling someone about. */
  newFailures: ClassifiedFailure[];
  /** Failures already on the record. Reported, never alerted. */
  knownFailures: ClassifiedFailure[];
  /** Targets that produced nothing to compare, and why. */
  nonComparable: NonComparableTarget[];
  /**
   * Performance flags (item 27), kept apart from the failure lists above.
   *
   * A performance regression is **not** a new failure and must never be
   * counted as one: item 26's `newFailures` decides what gets an `::error`
   * annotation, and a slow test that still passes does not belong there.
   */
  perf: PerfReport;
};
