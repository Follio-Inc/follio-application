/**
 * Test Console module (PLATFORM_TODO item 11).
 *
 * `inventory.ts` and `runner.ts` are **server-only** — one walks `__tests__`,
 * the other spawns Vitest. `types.ts` and `run-types.ts` are client-safe, and
 * the views import only from those. A route shim builds the inventory on the
 * server and passes it down as a plain prop; the run panel posts a category id
 * to `/api/admin/platform/tests/run` and renders what comes back.
 *
 * `execution.ts` is server-only too, and is the one place that knows what is
 * running: both runners take its lock, and the status and cancel routes read
 * and act on the same record (item 15). `execution-types.ts` is client-safe,
 * so the panels can render a lifecycle without reaching the registry.
 *
 * `history.ts` is the third server-only module: it writes and reads the local
 * JSON run store the runners append to, and computes the trends, last passes
 * and flaky evidence the history view renders (item 16). `history-types.ts` is
 * client-safe.
 */

export { buildTestInventory } from './inventory';
export type { TestInventoryOptions } from './inventory';
export {
  acquireRun,
  busyDetailFor,
  getActiveRun,
  releaseRun,
  requestCancel,
  withRun,
} from './execution';
export type { AcquireResult, RunLease } from './execution';
export { LIFECYCLE_ORDER, TERMINAL_LIFECYCLES } from './execution-types';
export {
  buildHistoryView,
  buildTargetHistory,
  buildTrends,
  isRecordable,
  normalizeLiveQaStatus,
  normalizeVitestStatus,
  readCommit,
  readTargetRuns,
  recordLiveQaRun,
  recordVitestRun,
  RETAINED_PER_TARGET,
  targetSlug,
  testIdentity,
} from './history';
export type { HistoryOptions, HistoryViewOptions } from './history';
export { HISTORY_FORMAT_VERSION, RUNS_RETAINED_PER_TARGET } from './history-types';
export type {
  FlakyEvidence,
  HistoryCommit,
  HistoryCounts,
  HistoryTestStatus,
  HistoryView,
  RunHistoryRecord,
  RunHistorySummary,
  RunHistoryTest,
  RunSummary,
  TargetHistory,
  TestFailingState,
  TestTrend,
  TestTrendPoint,
} from './history-types';
export type {
  ActiveRunSnapshot,
  CancelOutcome,
  CancelResult,
  ExecutionStatus,
  RunLifecycle,
  RunStep,
  RunnerKind,
} from './execution-types';
export {
  buildVitestArgs,
  isKnownCategory,
  listRunnableCategories,
  parseVitestReport,
  resolveCategoryTestFiles,
  runCategory,
} from './runner';
export type { RunCategoryOptions, SpawnHooks, VitestSpawner } from './runner';
export {
  artifactPathFor,
  isLiveQaAuthConfigured,
  listRunnablePathways,
  parsePathwayReport,
  resolveArtifactRequest,
  runPathway,
} from './live-qa';
export type { RunPathwayOptions } from './live-qa';
export type {
  PathwayArtifact,
  PathwayCaseResult,
  PathwayRunOutcome,
  PathwayRunResult,
  PathwayRunTotals,
  RunnablePathway,
} from './live-qa-types';
export type {
  CategoryRunResult,
  RunnableCategory,
  TestCaseResult,
  TestFailure,
  TestFileResult,
  TestRunOutcome,
  TestRunTotals,
} from './run-types';
export type {
  CategoryTests,
  FeatureTests,
  PathwayEntry,
  TestFileEntry,
  TestInventory,
  TestInventorySummary,
  UnattributedReason,
  UnattributedTest,
} from './types';
