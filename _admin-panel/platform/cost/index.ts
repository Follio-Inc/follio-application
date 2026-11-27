/**
 * AI cost tracking and the daily cap (PLATFORM_TODO item 29).
 *
 * `types.ts` is client-safe — the thresholds and the view shape, so the
 * Resume Lab page can render a cost panel without pulling the ledger in
 * behind it. Everything else is server-only.
 */

export {
  COST_CAP_USD,
  COST_MAX_ENTRIES,
  COST_RESERVATION_TTL_MS,
  COST_TIMEZONE,
  COST_WARN_USD,
} from './types';
export type {
  AdmissionDecision,
  AdmissionStatus,
  CostCertainty,
  CostEntry,
  CostLedger,
  CostReservation,
  CostRunKind,
  CostStatusView,
  DailySpend,
} from './types';
export {
  COST_VERSION,
  LOCK_STALE_MS,
  LOCK_TIMEOUT_MS,
  addReservation,
  dropReservation,
  emptyLedger,
  isLive,
  isWarning,
  ledgerDay,
  ledgerPath,
  parseLedger,
  readLedger,
  round,
  settle,
  spendFor,
  withLedger,
  writeLedger,
} from './ledger';
export type { LedgerOptions, LedgerRead } from './ledger';
export { admitLabRun, buildCostStatus, ceilingFor, labAiStages, projectRunCost } from './admission';
export type { AdmitOptions, Projection, StageCeiling } from './admission';
export { reconcileLabRun, releaseLabRun } from './reconcile';
export type { ReconcileInput, ReconcileResult } from './reconcile';
