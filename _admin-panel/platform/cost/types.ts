/**
 * AI cost tracking for Developer Platform lab runs (PLATFORM_TODO item 29).
 *
 * Client-safe: types and thresholds, no store and no `node:`.
 *
 * ## Scope
 *
 * **Lab AI runs only.** Nothing here touches product traffic, public routes,
 * Vitest, Live QA, drift scanning, performance baselines or role management.
 * Today exactly one lab can incur provider cost — the Resume Lab — and the
 * comparison counts only its AI side, because the OpenResume parser makes no
 * provider call at all. Item 23's distinction holds: that side has **no AI
 * cost**, which is not the same as a cost of `$0`.
 *
 * ## Where the money comes from
 *
 * Item 22's pricing table and item 22's observed provider telemetry. There is
 * no second pricing source and no second usage source, and the four states
 * item 22 keeps apart — `observed`, `unavailable`, `pricing-unavailable`,
 * `partial` — are not collapsed here either. A cost that is not known is
 * recorded as not known, never as zero.
 */

/** The accounting day is UTC. See `ledgerDay` for why. */
export const COST_TIMEZONE = 'UTC' as const;

/**
 * Warn at this much spend in one accounting day.
 *
 * The roadmap's open decision 6. A warning, not a block: runs continue.
 */
export const COST_WARN_USD = 5;

/**
 * Refuse to admit a new cost-bearing lab run at this much spend.
 *
 * A hard cap, applied **before** any provider work, and no role bypasses it —
 * a maintainer is as capped as a viewer would be if a viewer could run at all.
 */
export const COST_CAP_USD = 20;

/** How many settled entries the ledger keeps. Bounded, oldest dropped. */
export const COST_MAX_ENTRIES = 2000;

/**
 * How long an outstanding reservation is honoured before it is treated as
 * abandoned.
 *
 * A reservation holds budget between admission and reconciliation. If the
 * process dies in between — a crash, a killed dev server — nothing will ever
 * reconcile it, and without a bound it would hold that budget until midnight.
 * Thirty minutes is far longer than any lab run has ever taken (the slowest
 * observed is ~25 s) and short enough that a crash costs one admission slot
 * rather than a day's.
 *
 * Stale reservations are **ignored when summing**, not deleted: their
 * provenance stays in the file so an operator can see what happened.
 */
export const COST_RESERVATION_TTL_MS = 30 * 60 * 1000;

/** What kind of lab execution a record belongs to. */
export type CostRunKind = 'lab-run' | 'lab-compare';

/**
 * How well the cost of a settled run is known.
 *
 * Mirrors item 22's vocabulary rather than inventing a second one.
 */
export type CostCertainty = 'observed' | 'pricing-unavailable' | 'usage-unavailable' | 'partial';

/** One settled lab run's provider cost. */
export type CostEntry = {
  /** The run's own id. Used to make reconciliation idempotent. */
  runId: string;
  labId: string;
  kind: CostRunKind;
  /** ISO timestamp of settlement. */
  at: string;
  /** The UTC accounting day, `YYYY-MM-DD`. */
  day: string;
  /** Models the run actually used, from item 22's telemetry. */
  models: string[];
  /** Observed provider usage. Null when telemetry gave none. */
  inputTokens: number | null;
  outputTokens: number | null;
  /**
   * The priced cost, when it is known.
   *
   * Null for `pricing-unavailable` and `usage-unavailable`. Null is **not**
   * zero: a null entry keeps its reservation's hold instead of releasing it,
   * so an unpriceable run cannot buy unlimited further runs.
   */
  costUsd: number | null;
  certainty: CostCertainty;
  /**
   * Budget still held for this entry because its cost is unknown.
   *
   * Zero when `costUsd` is known. This is what stops an unmeasurable run from
   * silently freeing the budget it was admitted against.
   */
  heldUsd: number;
  actorId: string | null;
  actorRole: string | null;
};

/** Budget held between admission and reconciliation. */
export type CostReservation = {
  id: string;
  runId: string;
  labId: string;
  kind: CostRunKind;
  at: string;
  day: string;
  /** The conservative maximum this run could cost. */
  maxUsd: number;
  actorId: string | null;
  actorRole: string | null;
};

/** The persisted ledger. */
export type CostLedger = {
  version: 1;
  updatedAt: string;
  entries: CostEntry[];
  reservations: CostReservation[];
};

/** Where a day's spend stands. */
export type DailySpend = {
  day: string;
  /** Settled, priced spend. */
  settledUsd: number;
  /** Budget held by live reservations plus unmeasurable settled runs. */
  heldUsd: number;
  /** `settledUsd + heldUsd` — what the cap is measured against. */
  committedUsd: number;
  /** `COST_CAP_USD - committedUsd`, floored at zero. */
  remainingUsd: number;
  /** How many runs settled today. */
  runs: number;
  /** Runs today whose cost could not be priced. */
  unpricedRuns: number;
  /** Reservations ignored because they went stale. */
  staleReservations: number;
};

/** Why a run was or was not admitted. */
export type AdmissionStatus =
  | 'admitted'
  | 'admitted-with-warning'
  | 'cap-reached'
  | 'would-exceed-cap'
  | 'pricing-unknown'
  | 'ledger-unavailable';

export type AdmissionDecision = {
  allowed: boolean;
  status: AdmissionStatus;
  /** The reservation to reconcile later. Null when not admitted. */
  reservationId: string | null;
  /** The conservative maximum this run was admitted against. */
  projectedMaxUsd: number | null;
  spend: DailySpend;
  /** One sentence an operator can act on. Always present. */
  detail: string;
};

/** What the Resume Lab page shows about cost before a run. */
export type CostStatusView = {
  day: string;
  timezone: typeof COST_TIMEZONE;
  warnUsd: number;
  capUsd: number;
  spend: DailySpend;
  /** True once the day's committed spend is at or above the warning. */
  warning: boolean;
  /** False once a further run cannot be admitted. */
  canRun: boolean;
  /** The conservative maximum one run is admitted against. */
  projectedRunMaxUsd: number | null;
  /** Why a run cannot start, when it cannot. */
  blockedReason: string | null;
  /** The ceilings the projection is built from, for the UI to show. */
  stages: { stage: string; model: string; maxOutputTokens: number; maxUsd: number | null }[];
};
