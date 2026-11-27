/**
 * Drift page module (PLATFORM_TODO item 17).
 *
 * `view.ts` is **server-only**: it calls the scanner, which walks the
 * repository and parses it with the TypeScript compiler. `view-types.ts` is
 * client-safe, and `platform/ui/drift-report.tsx` imports only that.
 *
 * There is no second scanner here and no second opinion about what drift is:
 * the view is a projection of the existing typed `DriftReport`, and its `ok`
 * is the scanner's own.
 *
 * `proposals.ts` (item 18) is review-only and cannot write anything.
 * `quarantine.ts` and `audit.ts` (item 19) are the exception: they move and
 * remove files, behind the local-only gate, a candidate set limited to files
 * the scan proves unreachable, typed approval for a deletion, and an
 * append-only trail. Everything in `*-types.ts` is client-safe.
 */

export {
  analyzeLatestChange,
  parseNameStatus,
  readLatestCommit,
  toChangeStatus,
} from './change-analysis';
export type { ChangeAnalysisOptions, GitResult, GitRunner } from './change-analysis';
export type {
  AffectedFeature,
  AffectedPathway,
  AnalyzedCommit,
  ChangeAnalysis,
  ChangeAnalysisError,
  ChangeAnalysisSummary,
  ChangedFile,
  ChangeStatus,
} from './change-types';
export {
  buildDriftView,
  toDriftView,
  FAILING_GROUPS,
  NOT_ACTIONABLE_GROUPS,
  PROPOSAL_GROUPS,
  REGISTERED_GROUPS,
} from './view';
export type { DriftViewOptions } from './view';
export {
  MAP_FILE,
  proposeForMisattributedTest,
  proposeForMissingReference,
  proposeForStaleReference,
  proposeForUnlistedTest,
  proposeForUnmappedSurface,
  proposeTestDraft,
  proposeTestDrafts,
  summarizeProposals,
} from './proposals';
export {
  appendAuditEvent,
  auditPathFor,
  readAuditLog,
  AUDIT_DIRNAME,
  AUDIT_FILENAME,
} from './audit';
export type { AuditDraft, AuditOptions } from './audit';
export {
  buildQuarantineView,
  deleteQuarantined,
  invalidateScannerCaches,
  isProtectedPath,
  listQuarantine,
  quarantineCandidate,
  quarantineCandidates,
  quarantineRootFor,
  restoreQuarantined,
  QUARANTINE_DIRNAME,
} from './quarantine';
export type { QuarantineOptions } from './quarantine';
export { ELIGIBLE_GROUPS, QUARANTINE_FORMAT_VERSION } from './quarantine-types';
export type {
  ActionOutcome,
  ActionResult,
  AuditAction,
  AuditEvent,
  AuditResult,
  QuarantineCandidate,
  QuarantineRecord,
  QuarantineState,
  QuarantineView,
} from './quarantine-types';
export type {
  DriftProposal,
  MapEntryAction,
  MapEntryProposal,
  MapField,
  ProposalCandidate,
  ProposalCertainty,
  ProposalSummary,
  TestDraftProposal,
} from './proposal-types';
export type {
  DriftCategoryRow,
  DriftCount,
  DriftEntry,
  DriftFindingGroup,
  DriftSeverity,
  DriftSignalView,
  DriftSummary,
  DriftView,
} from './view-types';
