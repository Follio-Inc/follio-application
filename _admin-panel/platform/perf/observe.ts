/**
 * Turning each runner's own output into timing observations
 * (PLATFORM_TODO item 27).
 *
 * Every function here reads a result the platform already produced. None of
 * them times anything, and none reaches into product code.
 *
 * The recurring decision is what is **not** a sample. A duration exists on a
 * failed test, a cancelled run and a timed-out one, and using any of them
 * would corrupt the baseline in a way that is hard to see later: a test that
 * throws in its first line is fast, so letting that duration in would pull
 * the median down and make the next healthy run look like a regression.
 * Those observations are therefore emitted as `not-comparable` with a
 * reason, rather than dropped — an entry with no flag should say why.
 */

import type { ResumeComparisonResult } from '../labs/resume-import-ai/comparison-types';
import type { ResumeLabRunResult } from '../labs/resume-import-ai/types';
import type { PathwayRunResult } from '../tests/live-qa-types';
import type { CategoryRunResult } from '../tests/run-types';
import { perfStageId, perfTestId, type PerfObservation } from './baseline';

/**
 * Run outcomes that cannot carry timing for any test in them.
 *
 * Deliberately the same vocabulary item 26 uses for its own non-comparable
 * set, because the question is the same one: did this run produce evidence
 * about individual tests?
 */
const RUN_NOT_COMPARABLE: Readonly<Record<string, PerfObservation['reason']>> = {
  cancelled: 'run-cancelled',
  'runner-failed': 'runner-failed',
  'report-unreadable': 'runner-failed',
  'timed-out': 'runner-failed',
  busy: 'runner-failed',
  'gate-closed': 'runner-failed',
  'unknown-category': 'runner-failed',
  'no-tests': 'runner-failed',
  'skipped-auth-not-configured': 'prerequisite-missing',
  'unknown-pathway': 'runner-failed',
  'report-missing': 'runner-failed',
  'pathway-not-in-report': 'prerequisite-missing',
};

export function runReason(outcome: string): PerfObservation['reason'] | undefined {
  return RUN_NOT_COMPARABLE[outcome];
}

/* ===========================================================================
 * Vitest
 * ======================================================================== */

/**
 * One observation per test in a Vitest run.
 *
 * Only a passing test with a reported duration is a sample. A failing one is
 * emitted as `test-failed`: it has a duration, and that duration describes
 * how long it took to throw.
 */
export function observeVitest(result: CategoryRunResult): PerfObservation[] {
  const runLevel = runReason(result.outcome);

  if (runLevel !== undefined || !result.ran) {
    // The run itself produced nothing comparable. One observation for the
    // run, rather than a fabricated one per test it never reported.
    return [
      {
        id: `vitest:category:${result.categoryId}`,
        source: 'vitest',
        label: `${result.categoryId} (whole run)`,
        durationMs: null,
        reason: runLevel ?? 'runner-failed',
      },
    ];
  }

  const observations: PerfObservation[] = [];

  for (const file of result.files) {
    for (const test of file.tests) {
      const id = perfTestId('vitest', { file: file.path, suite: test.suite, name: test.name });
      const label = [...test.suite, test.name].join(' › ');

      if (test.status === 'skipped' || test.status === 'pending' || test.status === 'todo') {
        observations.push({
          id,
          source: 'vitest',
          label,
          durationMs: null,
          reason: 'test-skipped',
        });
        continue;
      }
      if (test.status !== 'passed') {
        observations.push({ id, source: 'vitest', label, durationMs: null, reason: 'test-failed' });
        continue;
      }
      if (test.durationMs === null) {
        observations.push({ id, source: 'vitest', label, durationMs: null, reason: 'no-duration' });
        continue;
      }

      observations.push({ id, source: 'vitest', label, durationMs: test.durationMs });
    }
  }

  return observations;
}

/* ===========================================================================
 * Live QA
 * ======================================================================== */

/**
 * One observation per Live QA test.
 *
 * **Which duration**: `LiveQaTestResult.durationMs` is the *last attempt's*,
 * which is the one Playwright's own report carries and the one the Test
 * Console already shows. A retried test therefore reports the duration of
 * the attempt that decided its status, not the sum of its attempts — and
 * because a retry means the earlier attempt was anomalous, summing them
 * would describe the flake rather than the test.
 *
 * A retried test is still recorded, with `retries` surfaced in the label so
 * the ambiguity is visible rather than hidden inside a number.
 */
export function observeLiveQa(result: PathwayRunResult): PerfObservation[] {
  const runLevel = runReason(result.outcome);

  if (runLevel !== undefined || !result.ran) {
    return [
      {
        id: `live-qa:pathway:${result.pathwayId}`,
        source: 'live-qa',
        label: `${result.pathwayId} (whole run)`,
        durationMs: null,
        reason: runLevel ?? 'runner-failed',
      },
    ];
  }

  return result.cases.map((testCase): PerfObservation => {
    const id = perfTestId('live-qa', {
      file: null,
      suite: testCase.suite,
      name: testCase.name,
    });
    const retried = testCase.retries > 0 ? ` (retried ${testCase.retries}×)` : '';
    const label = `${[...testCase.suite, testCase.name].join(' › ')}${retried}`;

    // Playwright's own vocabulary: `expected` is the only status that means
    // the case did what it was supposed to. `flaky` passed on a retry, which
    // is a pass whose timing describes the retry rather than the test, so it
    // is recorded as not comparable rather than quietly averaged in.
    if (testCase.status !== 'expected') {
      return {
        id,
        source: 'live-qa',
        label,
        durationMs: null,
        reason: testCase.status === 'skipped' ? 'test-skipped' : 'test-failed',
      };
    }
    if (testCase.durationMs === null) {
      return { id, source: 'live-qa', label, durationMs: null, reason: 'no-duration' };
    }

    return { id, source: 'live-qa', label, durationMs: testCase.durationMs };
  });
}

/* ===========================================================================
 * Resume Lab stages
 * ======================================================================== */

export const RESUME_LAB_ID = 'resume-import-ai';

/**
 * One observation per stage of a single Resume Lab run.
 *
 * The lab already reports each stage's milliseconds, including the agent's
 * own sub-steps, which it takes from the `AgentRun` rather than re-timing.
 * Those are used exactly as they are.
 */
export function observeResumeLab(result: ResumeLabRunResult): PerfObservation[] {
  if (result.outcome !== 'parsed') {
    return [
      {
        id: perfStageId(RESUME_LAB_ID, 'run'),
        source: 'lab',
        label: 'Resume lab (whole run)',
        durationMs: null,
        reason: result.outcome === 'gate-closed' ? 'prerequisite-missing' : 'runner-failed',
      },
    ];
  }

  const observations: PerfObservation[] = result.timing.stages.map((stage) => ({
    id: perfStageId(RESUME_LAB_ID, stage.id),
    source: 'lab' as const,
    label: stage.label.trim(),
    durationMs: stage.ms,
  }));

  observations.push({
    id: perfStageId(RESUME_LAB_ID, 'total'),
    source: 'lab',
    label: 'Total',
    durationMs: result.timing.totalMs,
  });

  return observations;
}

/**
 * One observation per stage of each parser in a comparison.
 *
 * **Each implementation is keyed by its own side**, so the AI series and the
 * OpenResume series never meet. Item 23 refused to name a winner and item 27
 * keeps that: "slower than the other parser" is not a regression, and a
 * parser that takes 24 seconds against one that takes 288 ms is not failing
 * — they do different work. Each is compared only with its own past.
 */
export function observeComparison(result: ResumeComparisonResult): PerfObservation[] {
  const observations: PerfObservation[] = [];

  for (const run of [result.ai, result.openResume]) {
    if (run === null) continue;

    if (run.outcome !== 'parsed') {
      observations.push({
        id: perfStageId(RESUME_LAB_ID, 'run', run.side),
        source: 'lab',
        label: `${run.side} (whole run)`,
        durationMs: null,
        reason: 'runner-failed',
      });
      continue;
    }

    for (const stage of run.stages) {
      observations.push({
        id: perfStageId(RESUME_LAB_ID, stage.id, run.side),
        source: 'lab',
        label: `${run.side} › ${stage.label}`,
        durationMs: stage.ms,
      });
    }

    observations.push({
      id: perfStageId(RESUME_LAB_ID, 'total', run.side),
      source: 'lab',
      label: `${run.side} › total`,
      durationMs: run.durationMs,
    });
  }

  return observations;
}
