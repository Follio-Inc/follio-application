/**
 * Performance baselines and regression flags (PLATFORM_TODO item 27).
 *
 * `baseline.ts` and `observe.ts` are server-only (the first reads and writes
 * the store, the second imports result types). `types.ts` is client-safe, so
 * a view can render a flag without pulling the store in behind it.
 */

export {
  PERF_FLOOR_MS,
  PERF_MAX_SERIES,
  PERF_MIN_SAMPLES,
  PERF_RELATIVE,
  PERF_VERSION,
  PERF_WINDOW,
  applyObservations,
  classifyDuration,
  emptyPerfBaseline,
  localPerfBaselineFile,
  median,
  parsePerfBaseline,
  perfStageId,
  perfTestId,
  readPerfBaseline,
  summarizeFlags,
  testIdentity,
  writePerfBaseline,
} from './baseline';
export type { PerfObservation } from './baseline';
export { recordObservations } from './record';
export type { RecordOptions } from './record';
export {
  RESUME_LAB_ID,
  observeComparison,
  observeLiveQa,
  observeResumeLab,
  observeVitest,
  runReason,
} from './observe';
export type {
  NotComparableReason,
  PerfBaseline,
  PerfClass,
  PerfFlag,
  PerfReport,
  PerfSeries,
  PerfSource,
} from './types';
