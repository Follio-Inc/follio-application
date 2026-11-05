/**
 * Turning a finished run into a settled ledger entry
 * (PLATFORM_TODO item 29).
 *
 * Server-only. The cost comes from item 22's `ResumeLabAi` — its observed
 * provider telemetry and its pricing table — and nothing here recomputes
 * either.
 *
 * ## The four endings, and what each does to the budget
 *
 * | Item 22 says | Settled cost | Hold kept |
 * | --- | --- | --- |
 * | `observed` + `available` | the real figure | none |
 * | `observed` + `partial` | the priced part | the rest of the reservation |
 * | `pricing-unavailable` | none | the whole reservation |
 * | `unavailable` (no telemetry) | none | the whole reservation |
 *
 * Keeping the hold is the conservative half of item 29. A run whose cost
 * cannot be established **did** call the provider, and releasing its budget
 * would let an unmeasurable run buy further runs — the exact way a cap
 * quietly stops capping. The hold expires with the accounting day, not
 * sooner.
 *
 * A run that never reached the provider is different: nothing was spent, so
 * `releaseLabRun` drops the reservation outright.
 */

import type { ResumeLabAi } from '../labs/resume-import-ai/types';
import {
  dropReservation,
  ledgerDay,
  round,
  settle,
  spendFor,
  withLedger,
  type LedgerOptions,
} from './ledger';
import type { CostCertainty, CostEntry, CostRunKind, DailySpend } from './types';

export type ReconcileInput = LedgerOptions & {
  runId: string;
  reservationId: string | null;
  labId?: string;
  kind?: CostRunKind;
  /** Item 22's AI block for the run. Null when no AI stage ran at all. */
  ai: ResumeLabAi | null;
  /** The maximum the run was admitted against, for the hold it may keep. */
  projectedMaxUsd: number | null;
  actorId?: string | null;
  actorRole?: string | null;
};

export type ReconcileResult = {
  entry: CostEntry | null;
  spend: DailySpend | null;
  /** Why the ledger could not be updated, when it could not. */
  error: 'unreadable' | 'locked' | 'write-failed' | null;
};

/** How well item 22 knew what this run cost. */
function certaintyOf(ai: ResumeLabAi | null): CostCertainty {
  if (ai === null || ai.usage.status === 'unavailable') return 'usage-unavailable';
  if (ai.cost.status === 'pricing-unavailable') return 'pricing-unavailable';
  if (ai.cost.status === 'partial') return 'partial';
  return 'observed';
}

/**
 * Records what a finished run actually cost.
 *
 * Idempotent on `runId`: a second call settles nothing further, which is what
 * keeps a retried request or a double-invoked handler from counting twice.
 */
export function reconcileLabRun(input: ReconcileInput): ReconcileResult {
  const now = (input.now ?? (() => new Date()))();
  const day = ledgerDay(now);
  const certainty = certaintyOf(input.ai);
  const ai = input.ai;

  const costUsd =
    certainty === 'observed' || certainty === 'partial' ? (ai?.cost.totalUsd ?? null) : null;

  // What stays held: the whole reservation when nothing could be priced, the
  // unpriced remainder when only part could.
  const reserved = input.projectedMaxUsd ?? 0;
  const heldUsd =
    costUsd === null
      ? round(reserved)
      : certainty === 'partial'
        ? round(Math.max(0, reserved - costUsd))
        : 0;

  const entry: CostEntry = {
    runId: input.runId,
    labId: input.labId ?? 'resume-import-ai',
    kind: input.kind ?? 'lab-run',
    at: now.toISOString(),
    day,
    models: ai?.models ?? [],
    inputTokens: ai?.usage.inputTokens ?? null,
    outputTokens: ai?.usage.outputTokens ?? null,
    costUsd,
    certainty,
    heldUsd,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
  };

  const outcome = withLedger(
    (ledger) => {
      const next = settle(ledger, input.reservationId, entry);
      return { ledger: next, result: spendFor(next, day, now) };
    },
    { repoRoot: input.repoRoot, now: input.now }
  );

  return outcome.ok
    ? { entry, spend: outcome.result, error: null }
    : { entry: null, spend: null, error: outcome.reason };
}

/**
 * Releases a reservation for a run that never reached the provider.
 *
 * Only for failures *before* the AI call — a closed gate, a refused input, an
 * extraction that threw. Once the provider has answered, the cost is real
 * whatever happens afterwards, and `reconcileLabRun` records it.
 */
export function releaseLabRun(
  reservationId: string | null,
  options: LedgerOptions = {}
): { released: boolean } {
  if (reservationId === null) return { released: false };

  const outcome = withLedger(
    (ledger) => ({ ledger: dropReservation(ledger, reservationId), result: true }),
    options
  );

  return { released: outcome.ok };
}
