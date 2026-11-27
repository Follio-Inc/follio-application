/**
 * The performance baseline store and the regression rule
 * (PLATFORM_TODO item 27).
 *
 * Pure except for two filesystem calls. The rule is a function of a window
 * and one duration, so it is tested with fixtures rather than by sleeping.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  PERF_FLOOR_MS,
  PERF_MAX_SERIES,
  PERF_MIN_SAMPLES,
  PERF_RELATIVE,
  PERF_WINDOW,
} from './types';
import type {
  NotComparableReason,
  PerfBaseline,
  PerfClass,
  PerfFlag,
  PerfSeries,
  PerfSource,
} from './types';

/** The format this module writes and is willing to read. */
export const PERF_VERSION = 1 as const;

// The thresholds live in `types.ts`, which is client-safe, because the UI
// quotes them. Re-exported so server callers need only this module.
export { PERF_FLOOR_MS, PERF_MAX_SERIES, PERF_MIN_SAMPLES, PERF_RELATIVE, PERF_WINDOW };

// Identity lives in `identity.ts`, which is client-safe for the same reason.
export { perfStageId, perfTestId, testIdentity } from './identity';

export function emptyPerfBaseline(): PerfBaseline {
  return { version: PERF_VERSION, updatedAt: new Date().toISOString(), series: [] };
}

/* ===========================================================================
 * The statistic
 * ======================================================================== */

/**
 * The median of a window.
 *
 * Median rather than mean because the measurement found the first sample of
 * a test is systematically its slowest — `[66, 22, 29]` has a median of 29
 * and a mean of 39, and only one of those describes a warm run.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/* ===========================================================================
 * Persistence
 * ======================================================================== */

export function parsePerfBaseline(raw: string): PerfBaseline | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Partial<PerfBaseline>;
  // A future or unknown version is discarded, never half-read: a comparison
  // against a format nobody understands is worse than no comparison.
  if (candidate.version !== PERF_VERSION) return null;
  if (!Array.isArray(candidate.series)) return null;

  const series: PerfSeries[] = [];
  for (const entry of candidate.series) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Partial<PerfSeries>;
    if (typeof item.id !== 'string') continue;
    if (item.source !== 'vitest' && item.source !== 'live-qa' && item.source !== 'lab') continue;
    if (!Array.isArray(item.samples)) continue;

    series.push({
      id: item.id,
      source: item.source,
      label: typeof item.label === 'string' ? item.label : item.id,
      samples: item.samples
        .filter(
          (value): value is number =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0
        )
        .slice(-PERF_WINDOW),
      lastCommit: typeof item.lastCommit === 'string' ? item.lastCommit : null,
      lastSeenAt: typeof item.lastSeenAt === 'string' ? item.lastSeenAt : '',
    });
  }

  // `updatedAt` is preserved, not restamped: a parsed baseline was loaded,
  // not written, and claiming otherwise makes the field useless for telling
  // a stale store from a fresh one.
  return {
    version: PERF_VERSION,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
    series,
  };
}

/**
 * Where a locally-run baseline lives.
 *
 * Gitignored operator state, beside the Test Console's run history and the
 * drift stores, per the roadmap's open decision 1. The CI store is a
 * different file in a different place: a laptop's timings and a runner's are
 * not the same population, and comparing one against the other would flag
 * every run.
 */
export function localPerfBaselineFile(repoRoot: string = process.cwd()): string {
  return path.join(repoRoot, '_admin-panel', 'platform', '.perf', 'baseline.json');
}

export function readPerfBaseline(file: string): PerfBaseline | null {
  if (!existsSync(file)) return null;
  try {
    return parsePerfBaseline(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writePerfBaseline(file: string, baseline: PerfBaseline): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

/* ===========================================================================
 * The rule
 * ======================================================================== */

/** One duration to classify. */
export type PerfObservation = {
  id: string;
  source: PerfSource;
  label: string;
  /** Null when the observation is not a timing sample. */
  durationMs: number | null;
  /** Set when it is not, and why. */
  reason?: NotComparableReason;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function describe(
  classification: PerfClass,
  current: number | null,
  baseline: number | null,
  delta: number | null,
  ratio: number | null,
  samples: number,
  reason: NotComparableReason | null
): string {
  switch (classification) {
    case 'not-comparable':
      return `Not a timing sample: ${reason ?? 'unknown reason'}.`;
    case 'baseline-created':
      return `Baseline created at ${current} ms. Nothing to compare against yet.`;
    case 'insufficient-baseline':
      return `Baseline pending: ${samples}/${PERF_MIN_SAMPLES} comparable samples. Latest ${current} ms.`;
    case 'regression':
      return `Regression: ${current} ms vs ${baseline} ms baseline (+${delta} ms, ${ratio}×) over ${samples} samples.`;
    case 'improved':
      return `Improved: ${current} ms vs ${baseline} ms baseline (${delta} ms, ${ratio}×) over ${samples} samples.`;
    default:
      return `Within baseline: ${current} ms vs ${baseline} ms over ${samples} samples.`;
  }
}

/**
 * Classifies one duration against its own prior window.
 *
 * The window passed in must be the samples recorded **before** this
 * observation; folding the new value in first would let a regression pull
 * its own baseline up and mask itself.
 */
export function classifyDuration(observation: PerfObservation, priorSamples: number[]): PerfFlag {
  const base = {
    id: observation.id,
    source: observation.source,
    label: observation.label,
    samples: priorSamples.length,
  };

  if (observation.durationMs === null) {
    return {
      ...base,
      classification: 'not-comparable',
      currentMs: null,
      baselineMs: null,
      deltaMs: null,
      ratio: null,
      reason: observation.reason ?? 'no-duration',
      evidence: describe(
        'not-comparable',
        null,
        null,
        null,
        null,
        base.samples,
        observation.reason ?? 'no-duration'
      ),
    };
  }

  const current = observation.durationMs;

  if (priorSamples.length === 0) {
    return {
      ...base,
      classification: 'baseline-created',
      currentMs: current,
      baselineMs: null,
      deltaMs: null,
      ratio: null,
      reason: null,
      evidence: describe('baseline-created', current, null, null, null, 0, null),
    };
  }

  if (priorSamples.length < PERF_MIN_SAMPLES) {
    return {
      ...base,
      classification: 'insufficient-baseline',
      currentMs: current,
      baselineMs: median(priorSamples),
      deltaMs: null,
      ratio: null,
      reason: null,
      evidence: describe(
        'insufficient-baseline',
        current,
        null,
        null,
        null,
        priorSamples.length,
        null
      ),
    };
  }

  const baseline = median(priorSamples);
  const delta = current - baseline;
  const ratio = baseline === 0 ? null : round2(current / baseline);

  // Both thresholds, in both directions. Either one alone flags noise: the
  // relative test on every sub-millisecond test, the absolute test on
  // anything legitimately slow that varies a little.
  const slowEnough = Math.abs(delta) > PERF_FLOOR_MS;
  const relativeEnough =
    baseline === 0
      ? false
      : current >= baseline * PERF_RELATIVE || current * PERF_RELATIVE <= baseline;

  let classification: PerfClass = 'within-baseline';
  if (slowEnough && relativeEnough) {
    classification = delta > 0 ? 'regression' : 'improved';
  }

  return {
    ...base,
    classification,
    currentMs: current,
    baselineMs: baseline,
    deltaMs: delta,
    ratio,
    reason: null,
    evidence: describe(classification, current, baseline, delta, ratio, priorSamples.length, null),
  };
}

/* ===========================================================================
 * Folding observations in
 * ======================================================================== */

/**
 * Classifies a batch and returns the next baseline.
 *
 * Only comparable observations are recorded. A failed, skipped or
 * duration-less test contributes nothing: letting a failure's duration into
 * the window would mean a test that threw early could lower its own baseline
 * and make the next healthy run look like a regression.
 */
export function applyObservations(
  baseline: PerfBaseline | null,
  observations: PerfObservation[],
  now: string,
  commit: string | null
): { flags: PerfFlag[]; baseline: PerfBaseline } {
  const current = baseline ?? emptyPerfBaseline();
  const byId = new Map(current.series.map((entry) => [entry.id, entry]));
  const flags: PerfFlag[] = [];

  for (const observation of observations) {
    const prior = byId.get(observation.id);
    const priorSamples = prior?.samples ?? [];
    flags.push(classifyDuration(observation, priorSamples));

    if (observation.durationMs === null) continue;

    byId.set(observation.id, {
      id: observation.id,
      source: observation.source,
      label: observation.label,
      samples: [...priorSamples, observation.durationMs].slice(-PERF_WINDOW),
      lastCommit: commit,
      lastSeenAt: now,
    });
  }

  return {
    flags,
    baseline: {
      version: PERF_VERSION,
      updatedAt: now,
      series: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, PERF_MAX_SERIES),
    },
  };
}

/** Groups flags for a caller that wants them by kind. */
export function summarizeFlags(flags: PerfFlag[]) {
  return {
    flags,
    regressions: flags.filter((flag) => flag.classification === 'regression'),
    improvements: flags.filter((flag) => flag.classification === 'improved'),
    pending: flags.filter(
      (flag) =>
        flag.classification === 'insufficient-baseline' ||
        flag.classification === 'baseline-created'
    ),
    notComparable: flags.filter((flag) => flag.classification === 'not-comparable'),
  };
}
