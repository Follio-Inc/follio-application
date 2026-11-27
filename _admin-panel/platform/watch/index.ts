/**
 * Scheduled and post-merge runs (PLATFORM_TODO item 26).
 *
 * `run.ts`, `baseline.ts` and `cli.ts` are **server-only**: they read the
 * filesystem and drive the Test Console's runner. `baseline-types.ts` and
 * `notify.ts` are pure — types and string rendering — and carry no `node:`
 * import, so the report can be formatted anywhere.
 */

export {
  BASELINE_MAX_TARGETS,
  BASELINE_VERSION,
  BASELINE_WINDOW,
  classifyFailure,
  classifyTarget,
  emptyBaseline,
  isNewFailure,
  parseBaseline,
  readBaseline,
  testIdentity,
  updateBaseline,
  writeBaseline,
} from './baseline';
export type { ObservedTest } from './baseline';
export { nonComparableReason, observedFrom, runWatch } from './run';
export type { WatchRunOptions, WatchRunOutcome } from './run';
export { WATCH_EXIT_CODE, annotationsFor, summaryFor } from './notify';
export type {
  Baseline,
  BaselineStatus,
  BaselineTarget,
  BaselineTest,
  ClassifiedFailure,
  FailureClass,
  NonComparableReason,
  NonComparableTarget,
  WatchReport,
} from './baseline-types';
