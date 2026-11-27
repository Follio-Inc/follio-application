import type { RunnerKind } from './execution-types';

/**
 * Local run history: what is kept, and what it supports
 * (PLATFORM_TODO item 16).
 *
 * Client-safe: types and constants, no `node:` import and nothing that touches
 * a disk. The views render a `HistoryView` the server built.
 *
 * Item 16's done condition is three things — each test shows a trend,
 * newly-failing is distinguished from already-failing, and a test that passes
 * and fails **on the same commit** is labelled flaky — so these types carry
 * exactly what those three questions need: a stable identity per test, a
 * normalised verdict, the time of the run, and the commit it ran at. Nothing
 * about the machine, the environment or the process is recorded.
 *
 * Storage is the default already decided in PLATFORM_TODO's open decisions:
 * local JSON under `_admin-panel/platform/.runs/`, gitignored, no Prisma and no
 * production persistence.
 */

/**
 * Format version of a stored record.
 *
 * On disk and long-lived, so a reader can refuse what it does not understand
 * rather than guess. A record of another version is skipped, not patched.
 */
export const HISTORY_FORMAT_VERSION = 1;

/** Runs kept per target. Conservative on purpose — see `history.ts`. */
export const RUNS_RETAINED_PER_TARGET = 10;

/**
 * One test's verdict, in one vocabulary.
 *
 * Vitest says `passed`/`failed`/`skipped`/`todo` and Playwright says
 * `expected`/`unexpected`/`flaky`/`skipped`, so both are normalised to compare
 * runs over time. `flaky` from Playwright becomes `failed` here with
 * `reporterFlaky` set, which is the same judgement item 14 makes about a
 * retried pass — and it keeps the reporter's own word rather than losing it.
 */
export type HistoryTestStatus = 'passed' | 'failed' | 'skipped' | 'unknown';

/** The commit a run happened at. */
export type HistoryCommit = {
  /** `git rev-parse HEAD`, or null when git could not be read. */
  sha: string | null;
  /**
   * Whether the working tree had uncommitted changes.
   *
   * Recorded because the flaky rule is "the same commit": with a dirty tree,
   * two runs at one sha did not necessarily run the same code, and a label that
   * did not say so would overclaim.
   */
  dirty: boolean;
};

/** One test inside a stored run. Identity plus verdict, and nothing else. */
export type RunHistoryTest = {
  /** Repo-relative test file. Null for a Live QA case, whose spec is implied. */
  file: string | null;
  /** Enclosing suite titles, outermost first. */
  suite: string[];
  name: string;
  status: HistoryTestStatus;
  /** Present only when Playwright itself called the case flaky. */
  reporterFlaky?: true;
};

/** Counts for a stored run, from the reporter's own totals. */
export type RunHistorySummary = {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Test files in the run. Null for Live QA, which counts specs not files. */
  files: number | null;
};

/**
 * One run, as stored.
 *
 * Only runs that actually executed are written — never a refusal. A run that
 * was cancelled or never produced a report is stored with an empty `tests`
 * array, which is why such a run can never become pass/fail evidence for any
 * test: there is nothing in it to be evidence of.
 */
export type RunHistoryRecord = {
  version: number;
  /** The opaque run id item 15 generated. Not a pid and not a path. */
  runId: string;
  runner: RunnerKind;
  targetId: string;
  /** The result's own outcome, stored verbatim. */
  outcome: string;
  /** Whether the runner produced a report. */
  ran: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  commit: HistoryCommit;
  summary: RunHistorySummary;
  tests: RunHistoryTest[];
};

/** A stored run without its per-test rows, for listing. */
export type RunSummary = Omit<RunHistoryRecord, 'version' | 'tests'>;

/** One point in a test's trend. */
export type TestTrendPoint = {
  /** When the run started. */
  at: string;
  status: HistoryTestStatus;
  commit: string | null;
  dirty: boolean;
  reporterFlaky: boolean;
};

/**
 * Evidence that a test both passed and failed at one commit.
 *
 * Item 16's literal rule. Nothing else produces this: not a single failure, not
 * a slow run, not a retry, and not a cancelled or broken run.
 */
export type FlakyEvidence = {
  commit: string;
  passes: number;
  failures: number;
  /** Whether any contributing run had uncommitted changes. */
  dirty: boolean;
};

/**
 * Where a test stands now, against the run before it.
 *
 * `first-failure` is its own state on purpose: a test failing in the only run
 * that recorded it is not a regression, because there is nothing to have
 * regressed from, and calling it newly-failing would claim otherwise.
 */
export type TestFailingState =
  | 'passing'
  | 'newly-failing'
  | 'already-failing'
  | 'first-failure'
  | 'skipped'
  | 'unknown';

/** One test's history, as the console shows it. */
export type TestTrend = {
  /** `file > suite > … > name`. Stable, and never an array position. */
  id: string;
  file: string | null;
  suite: string[];
  name: string;
  /** Oldest first, so it reads left to right. Bounded by the runs retained. */
  recent: TestTrendPoint[];
  /** The most recent run this test passed in. Null when it never has. */
  lastPassedAt: string | null;
  state: TestFailingState;
  /** Same-commit contradiction, or null. */
  flaky: FlakyEvidence | null;
  /** The last run where Playwright itself called it flaky. Null otherwise. */
  reporterFlakyAt: string | null;
};

/** One category or pathway, and what history it has. */
export type TargetHistory = {
  runner: RunnerKind;
  targetId: string;
  runsRecorded: number;
  /** The most recent run, or null when the target has never run. */
  lastRun: RunSummary | null;
  /** When the target last came out green. Null when it never has. */
  lastPassAt: string | null;
  /** Newest first, bounded by what is retained. */
  recent: RunSummary[];
  /** Every test seen in those runs, notable ones first. */
  tests: TestTrend[];
};

export type HistoryCounts = {
  targetsWithHistory: number;
  runsRecorded: number;
  testsWithHistory: number;
  flaky: number;
  newlyFailing: number;
  alreadyFailing: number;
  withoutRecordedPass: number;
};

/** Everything the history view renders. */
export type HistoryView = {
  version: number;
  /** Repo-relative location of the store, for the operator to go and look. */
  root: string;
  retainedPerTarget: number;
  /** When the server read this. The view is a snapshot, not a live feed. */
  readAt: string;
  /** Every known target, plus any with history that is no longer known. */
  targets: TargetHistory[];
  /** Newest first, across every target. */
  recentRuns: RunSummary[];
  counts: HistoryCounts;
};
