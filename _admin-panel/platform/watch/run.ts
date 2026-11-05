/**
 * Scheduled and post-merge runs (PLATFORM_TODO item 26).
 *
 * Server-only. This module **orchestrates**; it does not execute. Every test
 * still goes through item 12's `runCategory`, which resolves files from the
 * trusted coverage map, spawns Vitest with the JSON reporter, parses the
 * structured report and takes item 15's execution lock. There is no second
 * runner here, no shell pipeline and no `child_process` import — a test
 * asserts all three.
 *
 * ## What it runs
 *
 * Targets come from `listRunnableCategories()`, which reads the coverage
 * map. No category is named in this file, so a category added to the map is
 * picked up without anyone editing a list here.
 *
 * ## What it does not run, and why that is said out loud
 *
 * **Live QA is reported, never attempted.** It needs two things a scheduled
 * runner does not have: a Playwright browser download and a captured auth
 * state from `npm run live-qa:auth`. Item 26's own constraint is that a
 * missing auth state is "skipped — auth not configured" and a missing
 * browser is infrastructure — neither is a product failure. Rather than
 * install ~150 MB of Chromium on a schedule to produce a row of skips, the
 * report names the pathways and the prerequisite, so the gap is visible
 * instead of silently absent. Nothing fabricates a pathway result.
 *
 * ## Production
 *
 * Nothing here can run in production: `runCategory` calls
 * `canRunDeveloperSuites()`, whose production ban cannot be overridden by
 * any flag. A scheduled job is a caller like any other.
 */

import { performance } from 'node:perf_hooks';

import { listLiveQaPathways } from '../../modules/developer/live-qa/catalog';
import { applyObservations, observeVitest, summarizeFlags } from '../perf';
import type { PerfBaseline, PerfFlag } from '../perf';
import { readCommit } from '../tests/history';
import { listRunnableCategories, runCategory } from '../tests/runner';
import type { CategoryRunResult } from '../tests/run-types';
import { classifyTarget, updateBaseline, type ObservedTest } from './baseline';
import type {
  Baseline,
  BaselineStatus,
  ClassifiedFailure,
  NonComparableReason,
  NonComparableTarget,
  WatchReport,
} from './baseline-types';

/**
 * Outcomes that mean "no comparable test results", and what kind of
 * not-a-failure each one is.
 *
 * Item 26 turns on this table: every entry here is a reason to stay quiet.
 * A target whose outcome is in this map is never folded into the baseline
 * either — overwriting a good record with an empty one would make the next
 * real regression look like a first observation.
 */
const NON_COMPARABLE: Readonly<Record<string, NonComparableReason>> = {
  cancelled: 'cancelled',
  'runner-failed': 'infrastructure',
  'report-unreadable': 'infrastructure',
  'timed-out': 'infrastructure',
  busy: 'infrastructure',
  'gate-closed': 'infrastructure',
  'unknown-category': 'infrastructure',
  'no-tests': 'nothing-to-run',
  // Live QA's, kept here so the vocabulary lives in one place.
  'skipped-auth-not-configured': 'prerequisite-missing',
  'unknown-pathway': 'infrastructure',
  'report-missing': 'infrastructure',
  'pathway-not-in-report': 'infrastructure',
};

export function nonComparableReason(outcome: string): NonComparableReason | null {
  return NON_COMPARABLE[outcome] ?? null;
}

/** Vitest's own words, normalized into the baseline vocabulary. */
function statusOf(status: string): BaselineStatus {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'skipped' || status === 'pending') return 'skipped';
  if (status === 'todo') return 'todo';
  return 'unknown';
}

/** Flattens a run result into the shape the baseline compares. */
export function observedFrom(result: CategoryRunResult): ObservedTest[] {
  const observed: ObservedTest[] = [];

  for (const file of result.files) {
    for (const testCase of file.tests) {
      observed.push({
        file: file.path,
        suite: testCase.suite,
        name: testCase.name,
        status: statusOf(testCase.status),
      });
    }
  }

  return observed;
}

export type WatchRunOptions = {
  /** `schedule` or `post-merge`. Reported, never used to decide anything. */
  trigger?: string;
  branch?: string | null;
  commit?: string | null;
  /** The prior baseline. Null means none was found. */
  baseline?: Baseline | null;
  /**
   * The prior **performance** baseline (item 27). A separate store from the
   * verdict baseline above, deliberately: see `perf/types.ts`.
   */
  perfBaseline?: PerfBaseline | null;
  /** Categories to run. Defaults to every runnable one in the map. */
  categoryIds?: string[];
  /** The runner seam, so a test never spawns Vitest inside Vitest. */
  run?: (categoryId: string) => Promise<CategoryRunResult>;
  now?: () => string;
};

export type WatchRunOutcome = {
  report: WatchReport;
  /** The baseline to persist. Unchanged targets keep their records. */
  baseline: Baseline;
  /** The performance baseline to persist (item 27). */
  perfBaseline: PerfBaseline;
};

/**
 * Runs the targets, classifies what failed, and returns the next baseline.
 *
 * Sequential on purpose. Item 15 allows one run at a time across the whole
 * process, and a scheduled job is not exempt from it: running categories in
 * parallel would simply mean each one after the first being refused as busy.
 */
export async function runWatch(options: WatchRunOptions = {}): Promise<WatchRunOutcome> {
  const started = performance.now();
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();

  const commit = options.commit ?? readCommit().sha;
  const baselineMissing = (options.baseline ?? null) === null;

  const categoryIds = options.categoryIds ?? listRunnableCategories().map((entry) => entry.id);
  const execute = options.run ?? ((categoryId: string) => runCategory(categoryId));

  let baseline: Baseline | null = options.baseline ?? null;
  let perfBaseline: PerfBaseline | null = options.perfBaseline ?? null;
  const perfFlags: PerfFlag[] = [];
  const newFailures: ClassifiedFailure[] = [];
  const knownFailures: ClassifiedFailure[] = [];
  const nonComparable: NonComparableTarget[] = [];
  let testsObserved = 0;

  for (const categoryId of categoryIds) {
    const result = await execute(categoryId);
    const reason = nonComparableReason(result.outcome);

    // Item 27, on every run: `observeVitest` decides what is a timing sample
    // and emits a reason for everything else, so a cancelled or broken run
    // contributes no durations but still explains itself.
    const perf = applyObservations(perfBaseline, observeVitest(result), now(), commit);
    perfFlags.push(...perf.flags);
    perfBaseline = perf.baseline;

    // A run that produced no report tells us nothing about any test. It is
    // reported as its own kind of event and the baseline is left alone.
    if (reason !== null || !result.ran) {
      nonComparable.push({
        runner: 'vitest',
        targetId: categoryId,
        reason: reason ?? 'infrastructure',
        outcome: result.outcome,
        detail: result.detail,
      });
      continue;
    }

    const observed = observedFrom(result);
    testsObserved += observed.length;

    for (const failure of classifyTarget('vitest', categoryId, observed, baseline)) {
      (failure.isNew ? newFailures : knownFailures).push(failure);
    }

    baseline = updateBaseline(
      baseline,
      'vitest',
      categoryId,
      result.outcome,
      observed,
      now(),
      commit
    );
  }

  // Live QA: named, not attempted. See this module's header.
  for (const pathway of listLiveQaPathways()) {
    nonComparable.push({
      runner: 'live-qa',
      targetId: pathway.id,
      reason: 'prerequisite-missing',
      outcome: 'not-attempted',
      detail:
        'Live QA is not run on a schedule: it needs a Playwright browser download and a captured auth state from `npm run live-qa:auth`. Run it from the Test Console.',
    });
  }

  return {
    report: {
      trigger: options.trigger ?? 'manual',
      commit,
      branch: options.branch ?? null,
      startedAt,
      durationMs: Math.round(performance.now() - started),
      baselineMissing,
      targetsRun: categoryIds.length,
      testsObserved,
      newFailures,
      knownFailures,
      nonComparable,
      perf: summarizeFlags(perfFlags),
    },
    baseline: baseline ?? updateBaseline(null, 'vitest', '', 'none', [], now(), commit),
    perfBaseline: perfBaseline ?? { version: 1, updatedAt: now(), series: [] },
  };
}
