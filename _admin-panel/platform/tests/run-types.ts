/**
 * One-category test run result (PLATFORM_TODO item 12).
 *
 * Client-safe: types only. Every field below comes from Vitest's JSON reporter
 * output — nothing is invented, and nothing is carried that the reporter does
 * not produce.
 *
 * What the reporter does **not** give, which item 13 therefore cannot show as
 * separate fields: a structured `expected`/`actual` pair, a diff, and anything
 * about a test's inputs or fixtures. A failing assertion arrives as one string
 * whose first line is the message — and that message is where Vitest states
 * expected against actual ("expected 'a' to be 'b'"). Splitting that prose into
 * two fields would mean regexing a format that differs per matcher, so the
 * console shows the reporter's own text instead.
 *
 * Item 15 added two outcomes and no fields: a run's progress belongs to the run
 * while it is in flight, not to its result, so the lifecycle lives in
 * `execution-types.ts` and is read from the status route instead. Item 16's
 * history has nothing here either.
 */

import type { PerfFlag } from '../perf/types';

/**
 * What happened, with the distinction that matters most kept explicit: a suite
 * whose tests failed **ran**, and a runner that could not start did not.
 *
 * - `passed` / `failed` — Vitest ran. The suite's verdict.
 * - `unknown-category` — the id is not one the coverage map declares.
 * - `no-tests` — the category exists and the map lists no unit test for it.
 * - `gate-closed` — `canRunDeveloperSuites()` said no.
 * - `runner-failed` — Vitest never produced a result (spawn error, crash).
 * - `report-unreadable` — it ran, but the JSON report is missing or malformed.
 * - `timed-out` — the child was killed after the hard limit.
 * - `busy` — another run holds the console's one execution slot (item 15).
 *   Nothing was started, and nothing was queued.
 * - `cancelled` — someone stopped this run (item 15). Not a failure, not a
 *   timeout: the child was killed on request and wrote no report.
 */
export type TestRunOutcome =
  | 'passed'
  | 'failed'
  | 'unknown-category'
  | 'no-tests'
  | 'gate-closed'
  | 'runner-failed'
  | 'report-unreadable'
  | 'timed-out'
  | 'busy'
  | 'cancelled';

/**
 * One error from a failing test, out of one `failureMessages` entry.
 *
 * `failureMessages` is an array: a test can fail more than once — an assertion
 * plus an unhandled rejection, say — so every entry is kept rather than only
 * the first.
 */
export type TestFailure = {
  /**
   * The error's first line: the assertion text, verbatim.
   *
   * This is where Vitest states expected against actual, e.g.
   * `AssertionError: expected 'hello world' to be 'hello there'`. The reporter
   * provides no separate `expected`/`actual` pair and no diff, so this text is
   * shown as it came rather than taken apart.
   */
  message: string;
  /** The remaining lines, with absolute paths rewritten repo-relative. */
  stack: string | null;
  /**
   * First stack frame inside the repository, as `path:line:column`.
   *
   * Read off the stack, not guessed: the first frame that is neither in
   * `node_modules` nor outside the repo is the line the test failed on. Null
   * when no frame qualifies.
   */
  location: string | null;
};

/** One test case, from an `assertionResults` entry. */
export type TestCaseResult = {
  /** `title` — the name as written in `it(...)`. */
  name: string;
  /** `ancestorTitles` — the `describe` titles above it, outermost first. */
  suite: string[];
  /**
   * Vitest's own status string, passed through rather than re-labelled.
   *
   * `passed`, `failed`, `skipped` and `todo` are the ones seen in practice; an
   * unfamiliar one is shown verbatim rather than mapped onto a guess.
   */
  status: string;
  /** `duration`, rounded to the millisecond. Null when the reporter omits it. */
  durationMs: number | null;
  /** Every error the reporter attached. Empty when the test did not fail. */
  failures: TestFailure[];
};

/** One test file, from a `testResults` entry. */
export type TestFileResult = {
  /** Repo-relative path. The reporter gives an absolute one. */
  path: string;
  status: string;
  /** `endTime - startTime`. Null when either is missing. */
  durationMs: number | null;
  /** The file-level `message`, which carries a collection error. Null when empty. */
  message: string | null;
  tests: TestCaseResult[];
};

/**
 * Vitest's own test totals, passed through.
 *
 * `files` is the exception: it counts the reported files, because the
 * reporter's `numTotalTestSuites` counts `describe` blocks and would read as a
 * file count it is not.
 */
export type TestRunTotals = {
  files: number;
  tests: number;
  passed: number;
  failed: number;
  /** `numPendingTests` — what Vitest counts for a skipped test. */
  pending: number;
  todo: number;
};

export type CategoryRunResult = {
  outcome: TestRunOutcome;
  /**
   * Whether Vitest produced a report.
   *
   * The one field that separates "these tests fail" from "the runner is
   * broken". A failing suite is a successful run.
   */
  ran: boolean;
  /** The category asked for, echoed back. */
  categoryId: string;
  /** Files the **server** resolved from the map, repo-relative and sorted. */
  filesRequested: string[];
  /** Files the report actually covered, repo-relative and sorted. */
  filesReported: string[];
  /**
   * Files that were requested and are absent from the report, sorted.
   *
   * Said out loud rather than left to a count mismatch: a file Vitest never
   * reported did not pass, and the console must not let it read as if it had.
   */
  filesNotReported: string[];
  totals: TestRunTotals | null;
  /** Per-file results, sorted by path. Empty unless `ran`. */
  files: TestFileResult[];
  /** Wall-clock time the server spent on the run. */
  durationMs: number;
  /** Vitest's exit code, or null when it never started. */
  exitCode: number | null;
  /** One sentence an operator can act on. Always present. */
  detail: string;
  /**
   * Per-test performance flags (item 27). Optional, and kept apart from
   * `status`: a test can pass and still have regressed, and the two verdicts
   * must never be read as one.
   */
  perf?: PerfFlag[];
  /** Tail of the runner's stderr, when it failed. Null otherwise. */
  runnerOutput: string | null;
};

/** A category offered for running, as the UI lists it. */
export type RunnableCategory = {
  /** The category name, which is also its id in the coverage map. */
  id: string;
  /** Unit test files the map lists under it. */
  fileCount: number;
};
