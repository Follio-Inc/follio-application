/**
 * One Live QA pathway run, as the Test Console shows it (PLATFORM_TODO item 14).
 *
 * Client-safe: types only. Every field comes from Playwright's own
 * `JSONReport` — the schema in `node_modules/playwright/types/testReporter.d.ts`
 * — as written to `report.json` by the reporter the existing
 * `live-qa/playwright.config.ts` already configures. Nothing is scraped from
 * stdout and nothing is invented.
 *
 * Deliberately **not** the Vitest result shape. Playwright's statuses are a
 * different vocabulary (`expected`/`unexpected`/`flaky`/`skipped` on a test,
 * `passed`/`failed`/`timedOut`/`interrupted` on an attempt), it retries, and it
 * attaches traces and screenshots. Reusing `CategoryRunResult` would mean
 * flattening all of that into words that mean something else.
 */

/**
 * What happened. A pathway whose assertions failed **ran**; a runner that never
 * produced a report did not.
 *
 * - `passed` / `failed` — Playwright ran and reported on this pathway.
 * - `skipped-auth-not-configured` — the pathway needs a stored browser session
 *   and `LIVE_QA_STORAGE_STATE` does not point at one. Nothing is run, and this
 *   is not a failure.
 * - `unknown-pathway` — the id is not in the Live QA catalog.
 * - `gate-closed` — `canRunDeveloperSuites()` said no.
 * - `runner-failed` — Playwright never got far enough to write a report.
 * - `report-missing` — the run finished and `report.json` is not there.
 * - `report-unreadable` — the file is there and is not a report this can read.
 * - `pathway-not-in-report` — a readable report that contains no spec for the
 *   pathway that was asked for, so nothing is known about it.
 * - `busy` — another run holds the console's one execution slot (item 15).
 *   Nothing was started, and nothing was queued.
 * - `cancelled` — someone stopped this run (item 15). Playwright was killed
 *   mid-journey, so there is no verdict — and this is not a failure.
 */
export type PathwayRunOutcome =
  | 'passed'
  | 'failed'
  | 'skipped-auth-not-configured'
  | 'unknown-pathway'
  | 'gate-closed'
  | 'runner-failed'
  | 'report-missing'
  | 'report-unreadable'
  | 'pathway-not-in-report'
  | 'busy'
  | 'cancelled';

/**
 * One Playwright attachment: a screenshot, a trace, a video.
 *
 * `path` is relative to the Live QA module root, so the link goes through the
 * contained artifact route rather than exposing a filesystem path. Null when
 * the attachment had no file, or when its file sat outside the artifacts
 * directory — in which case it is reported without a link rather than served.
 */
export type PathwayArtifact = {
  /** Attachment name as Playwright set it, e.g. `screenshot`, `trace`. */
  name: string;
  contentType: string;
  path: string | null;
};

/** One test case from the report, i.e. one `test(...)` in the spec. */
export type PathwayCaseResult = {
  /** The spec's title — the name given to `test(...)`. */
  name: string;
  /** Enclosing `describe` titles, outermost first. The outermost is the id. */
  suite: string[];
  /** Playwright's test status: `expected`, `unexpected`, `flaky`, `skipped`. */
  status: string;
  /** The last attempt's own status: `passed`, `failed`, `timedOut`, … */
  attemptStatus: string | null;
  /** The last attempt's duration, rounded. Null when absent. */
  durationMs: number | null;
  /** `retry` of the last attempt: 0 unless Playwright retried. */
  retries: number;
  /** The error's first line. Null when the case did not error. */
  error: string | null;
  /** The rest of the error, with absolute paths made repo-relative. */
  stack: string | null;
  /** `errorLocation` as `file:line:column`, when the report carries one. */
  location: string | null;
  /** Attachments from the last attempt, in report order. */
  artifacts: PathwayArtifact[];
};

/** `stats` from the report, passed through. */
export type PathwayRunTotals = {
  expected: number;
  unexpected: number;
  flaky: number;
  skipped: number;
  /** `stats.duration`, rounded. */
  durationMs: number;
};

/** A pathway offered for running, with its prerequisite state. */
export type RunnablePathway = {
  id: string;
  title: string;
  area: string;
  stability: string;
  requiresAuth: boolean;
  /** `fixtureKind` from the catalog, so the UI can say what a run needs. */
  fixtureKind: string;
  /**
   * False when this pathway cannot run yet. Today the only reason is a
   * `requiresAuth` pathway with no stored session.
   */
  runnable: boolean;
  /** Why it cannot run, for the UI to show. Null when it can. */
  blockedReason: string | null;
};

export type PathwayRunResult = {
  outcome: PathwayRunOutcome;
  /** Whether Playwright produced a report naming this pathway. */
  ran: boolean;
  pathwayId: string;
  /** Title from the catalog. Empty when the id was not found. */
  pathwayTitle: string;
  requiresAuth: boolean;
  /** Whether `LIVE_QA_STORAGE_STATE` points at a file that exists. */
  authConfigured: boolean;
  /** The base URL the run targeted, as the existing runner resolved it. */
  baseUrl: string | null;
  /** `stats.startTime` from the report. */
  startedAt: string | null;
  durationMs: number;
  /** Playwright's exit code, or null when it never started. */
  exitCode: number | null;
  totals: PathwayRunTotals | null;
  /** Cases for the requested pathway, in report order. */
  cases: PathwayCaseResult[];
  /** Report-level `errors`, e.g. "No tests found". */
  reportErrors: string[];
  /** One sentence an operator can act on. Always present. */
  detail: string;
  /** Tail of the runner's stderr, when something went wrong. */
  runnerOutput: string | null;
  /** Run directory relative to the Live QA root, for context. */
  artifactsDir: string | null;
};
