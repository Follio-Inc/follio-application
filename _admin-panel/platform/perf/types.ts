/**
 * Performance baselines and regression flags (PLATFORM_TODO item 27).
 *
 * Client-safe: types only.
 *
 * ## Where the numbers come from
 *
 * Nothing here measures anything. Every duration is one the existing
 * runners already produce and already show:
 *
 * | Source | Field | Scope |
 * | --- | --- | --- |
 * | Vitest | `TestCaseResult.durationMs` | per test |
 * | Live QA | `LiveQaTestResult.durationMs` | last attempt, per test |
 * | Resume Lab | `ResumeLabStage.ms` | per stage |
 * | Comparison | `ParserRun.stages[].ms`, `ParserRun.durationMs` | per parser |
 *
 * There is no benchmark harness, no warm-up loop and no synthetic score.
 * Item 27 persists what was already measured and compares it with itself.
 *
 * ## What the thresholds are, and how they were chosen
 *
 * Measured, not guessed. Two real categories were run repeatedly through the
 * production runner with nothing changed between runs, so every difference
 * observed was noise: **97 comparable tests over 7 runs**.
 *
 * - Most unit tests report **0 ms** (51 of 97). A ratio is undefined there,
 *   which is why a relative rule alone cannot work.
 * - The first sample of a test is systematically its slowest — spreads like
 *   `[66, 22, 29]` and `[56, 19, 18]` — so an **average** would be dragged up
 *   by a cold run and a **median** would not. Hence the median.
 * - At the 20–30 ms scale noise reached **Δ37 ms and 2.95×**.
 *
 * False positives each candidate rule would have produced on that pure
 * noise:
 *
 * | Rule | False positives |
 * | --- | --- |
 * | ×1.5 and > 25 ms | 3 / 97 |
 * | ×2.5 and > 25 ms | 1 / 97 |
 * | **×2.0 and > 50 ms** | **0 / 97** |
 *
 * So a regression needs **both**: at least twice the baseline **and** more
 * than 50 ms slower in absolute terms. Either one alone flags noise — the
 * relative test on every sub-millisecond test, the absolute test on anything
 * that is legitimately slow and varies a little.
 */

/** The runner or lab a duration came from. */
export type PerfSource = 'vitest' | 'live-qa' | 'lab';

/**
 * How a current duration compares with its own baseline.
 *
 * - `baseline-created` — the first comparable observation. Never a
 *   regression: there is nothing to regress against.
 * - `insufficient-baseline` — seen before, but fewer than
 *   `PERF_MIN_SAMPLES` samples. Reported honestly as pending.
 * - `within-baseline` — comparable and not meaningfully different.
 * - `regression` — slower by both thresholds.
 * - `improved` — faster by both thresholds, which is the same test applied
 *   in the other direction so the two are symmetric.
 * - `not-comparable` — the observation cannot be a timing sample at all: a
 *   failed, skipped or todo test, a cancelled or broken run, a missing
 *   prerequisite. Kept as a state rather than dropped, so the reason an
 *   entry has no flag is visible.
 */
export type PerfClass =
  | 'baseline-created'
  | 'insufficient-baseline'
  | 'within-baseline'
  | 'regression'
  | 'improved'
  | 'not-comparable';

/** Why an observation is not a timing sample. */
export type NotComparableReason =
  | 'test-failed'
  | 'test-skipped'
  | 'no-duration'
  | 'run-cancelled'
  | 'runner-failed'
  | 'prerequisite-missing';

/**
 * One durable timing series.
 *
 * `id` is a stable identity, never a display order or an array position:
 *
 * - a Vitest or Live QA test → item 16's `testIdentity()`, the same rule
 *   item 26 compares verdicts with, prefixed by its source;
 * - a lab stage → `lab:<labId>:<stageId>`;
 * - a parser in the comparison → `lab:<labId>:<side>:<stageId>`, so **the
 *   AI and OpenResume series are separate baselines and never meet**.
 */
export type PerfSeries = {
  id: string;
  source: PerfSource;
  /** A human label for the UI. Not part of identity. */
  label: string;
  /** Observed durations, oldest first, capped at `PERF_WINDOW`. */
  samples: number[];
  /** The commit of the most recent sample, when one was known. */
  lastCommit: string | null;
  lastSeenAt: string;
};

/**
 * The persisted store.
 *
 * Deliberately a **separate file** from item 26's verdict baseline rather
 * than a new field inside it. Extending that format would mean a version
 * bump, which discards existing files — and the file being discarded is the
 * one new-failure detection depends on. Item 26's meaning of "new failure"
 * is not worth risking for a timing series, so the two live side by side and
 * share only the identity rule.
 */
export type PerfBaseline = {
  version: 1;
  updatedAt: string;
  series: PerfSeries[];
};

/** One duration, classified against its own history. */
export type PerfFlag = {
  id: string;
  source: PerfSource;
  label: string;
  classification: PerfClass;
  /** The duration just observed. Null when not comparable. */
  currentMs: number | null;
  /** The median of the retained window before this observation. */
  baselineMs: number | null;
  /** `currentMs - baselineMs`. Null without both. */
  deltaMs: number | null;
  /** `currentMs / baselineMs`, rounded to two places. Null without both. */
  ratio: number | null;
  /** How many samples the baseline rests on. */
  samples: number;
  /** Set when `classification` is `not-comparable`. */
  reason: NotComparableReason | null;
  /**
   * The evidence, in one sentence, for the UI and the summary.
   *
   * Always says the numbers: a red badge with no figures is not a finding,
   * and "Baseline pending: 1/3 samples" is more useful than silence.
   */
  evidence: string;
};

/** What one pass over a result produced. */
export type PerfReport = {
  flags: PerfFlag[];
  regressions: PerfFlag[];
  improvements: PerfFlag[];
  pending: PerfFlag[];
  notComparable: PerfFlag[];
};

/* ===========================================================================
 * Thresholds
 *
 * Here rather than in `baseline.ts` because the badges render in client
 * components and quote these numbers; `baseline.ts` reads the filesystem.
 * The reasoning behind each value is in this file's header.
 * ======================================================================== */

/** Samples kept per series. */
export const PERF_WINDOW = 10;

/** Samples required before any comparison is made. */
export const PERF_MIN_SAMPLES = 3;

/** A regression needs at least this multiple of the baseline. */
export const PERF_RELATIVE = 2.0;

/** …and at least this many milliseconds of difference. */
export const PERF_FLOOR_MS = 50;

/** Series cap, so an abandoned test cannot grow the file forever. */
export const PERF_MAX_SERIES = 2000;
