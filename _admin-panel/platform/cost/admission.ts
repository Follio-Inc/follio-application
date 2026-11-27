/**
 * Deciding whether a lab run may start (PLATFORM_TODO item 29).
 *
 * Server-only. Admission happens **before** any provider work and before any
 * PDF is parsed, because a cap checked after a run has already cost money is
 * a report, not a cap.
 *
 * ## What "conservative maximum" is built from
 *
 * Only `MAX_TOKENS` and item 22's pricing table — no new limit is invented
 * and `MAX_TOKENS` is not modified. For each stage the Resume Lab actually
 * invokes:
 *
 * - **output** tokens are bounded exactly: `MAX_TOKENS[stage]` *is* the
 *   completion ceiling the AI client passes to the provider;
 * - **input** tokens are allowed the same ceiling again. `MAX_TOKENS` caps
 *   completions, not prompts, so nothing in the repository bounds the input
 *   side; giving it the stage's own ceiling is a convention, stated here
 *   rather than hidden, and it is generous — the observed run sent 1,812
 *   input tokens to a stage whose ceiling is 4,096.
 *
 * On this repository that projects **$0.0131** per run against an observed
 * **$0.00316**, roughly four times headroom, and about 1,500 admissible runs
 * against the $20 cap.
 *
 * ### The residual, said plainly
 *
 * A 5 MB PDF of dense text could send more prompt tokens than the input
 * allowance, so the projection is a well-padded estimate rather than a proof.
 * What follows from that is bounded: the **actual** cost is always recorded
 * on reconciliation, so an underestimate lands in the day's settled spend and
 * the next admission sees it. The cap cannot be exceeded repeatedly, only
 * overshot once, by the margin a single pathological run exceeds its
 * allowance. Tightening it further would need a prompt-size limit the product
 * does not have, and inventing one is out of item 29's scope.
 */

import { randomUUID } from 'node:crypto';

import { getStageConfig, type PipelineStage } from '@/lib/ai-client';

import { priceFor } from '../labs/resume-import-ai/pricing';
import { RESUME_PIPELINE_STAGES } from '../labs/resume-import-ai/telemetry';
import {
  addReservation,
  ledgerDay,
  round,
  spendFor,
  withLedger,
  type LedgerOptions,
} from './ledger';
import {
  COST_CAP_USD,
  COST_WARN_USD,
  type AdmissionDecision,
  type CostRunKind,
  type CostStatusView,
  COST_TIMEZONE,
} from './types';

/**
 * The stages one Resume Lab AI run invokes.
 *
 * Read from item 22's own list, so the projection covers exactly the stages
 * the pipeline really calls — `resumeParse` and `follioVoice` — and no other
 * `MAX_TOKENS` key. A budget that summed unrelated stages would refuse runs
 * for spend that could never happen.
 */
export function labAiStages(): PipelineStage[] {
  return Object.keys(RESUME_PIPELINE_STAGES) as PipelineStage[];
}

export type StageCeiling = {
  stage: string;
  model: string;
  maxOutputTokens: number;
  /** Null when the model has no price on file. */
  maxUsd: number | null;
};

/** What one stage could cost at its ceiling. */
export function ceilingFor(stage: PipelineStage): StageCeiling {
  const config = getStageConfig(stage);
  const price = priceFor(config.model);

  return {
    stage,
    model: config.model,
    maxOutputTokens: config.maxTokens,
    maxUsd:
      price === null
        ? null
        : round(
            (config.maxTokens / 1_000_000) * price.outputPerMillion +
              // The input allowance: the same ceiling again. See the header.
              (config.maxTokens / 1_000_000) * price.inputPerMillion
          ),
  };
}

export type Projection = {
  stages: StageCeiling[];
  /** Null when any stage's model has no price — the whole run is unpriceable. */
  maxUsd: number | null;
};

/**
 * The conservative maximum for one AI run.
 *
 * Null when **any** stage cannot be priced. Not a partial figure: admitting
 * on a total that silently omits a stage would be the same mistake as calling
 * an unknown cost zero.
 */
export function projectRunCost(stages: PipelineStage[] = labAiStages()): Projection {
  const ceilings = stages.map(ceilingFor);
  const unpriced = ceilings.some((ceiling) => ceiling.maxUsd === null);

  return {
    stages: ceilings,
    maxUsd: unpriced ? null : round(ceilings.reduce((sum, c) => sum + (c.maxUsd ?? 0), 0)),
  };
}

export type AdmitOptions = LedgerOptions & {
  runId?: string;
  labId?: string;
  kind?: CostRunKind;
  actorId?: string | null;
  actorRole?: string | null;
  /** Stage list seam, so a test can project an unpriced model. */
  stages?: PipelineStage[];
};

function decision(
  status: AdmissionDecision['status'],
  detail: string,
  spend: AdmissionDecision['spend'],
  projectedMaxUsd: number | null,
  reservationId: string | null = null
): AdmissionDecision {
  return {
    allowed: status === 'admitted' || status === 'admitted-with-warning',
    status,
    reservationId,
    projectedMaxUsd,
    spend,
    detail,
  };
}

/** A zero day, for the states where no ledger could be read. */
function noSpend(day: string): AdmissionDecision['spend'] {
  return {
    day,
    settledUsd: 0,
    heldUsd: 0,
    committedUsd: 0,
    remainingUsd: 0,
    runs: 0,
    unpricedRuns: 0,
    staleReservations: 0,
  };
}

/**
 * Admits a cost-bearing lab run, reserving its conservative maximum.
 *
 * The read, the decision and the reservation happen in **one** locked
 * critical section, which is what makes the cap safe when two lab runs
 * overlap — and they can, because the Resume Lab does not take item 15's
 * execution lock.
 *
 * Fails closed in every direction: an unreadable ledger, a ledger that cannot
 * be written, a lock that cannot be taken, and a model with no price all
 * refuse the run. Accounting that is broken must never buy unlimited
 * provider calls.
 */
export function admitLabRun(options: AdmitOptions = {}): AdmissionDecision {
  const now = (options.now ?? (() => new Date()))();
  const day = ledgerDay(now);
  const projection = projectRunCost(options.stages);

  if (projection.maxUsd === null) {
    const unpriced = projection.stages.filter((stage) => stage.maxUsd === null);
    return decision(
      'pricing-unknown',
      `No price on file for ${unpriced.map((stage) => stage.model).join(', ')}, so the most this run could cost cannot be bounded. Refused rather than guessed.`,
      noSpend(day),
      null
    );
  }

  // Narrowed above: `pricing-unknown` already returned.
  const maxUsd = projection.maxUsd;

  const outcome = withLedger((ledger) => {
    const spend = spendFor(ledger, day, now);

    if (spend.committedUsd >= COST_CAP_USD) {
      return {
        ledger,
        result: decision(
          'cap-reached',
          `Today's AI lab spend is $${spend.committedUsd.toFixed(4)}, at or above the $${COST_CAP_USD} daily cap. No further cost-bearing run can start until ${nextDay(day)} UTC.`,
          spend,
          projection.maxUsd
        ),
      };
    }

    if (spend.committedUsd + maxUsd > COST_CAP_USD) {
      return {
        ledger,
        result: decision(
          'would-exceed-cap',
          `Today's AI lab spend is $${spend.committedUsd.toFixed(4)} and this run could cost up to $${maxUsd.toFixed(4)}, which would cross the $${COST_CAP_USD} cap. Refused before any provider call.`,
          spend,
          projection.maxUsd
        ),
      };
    }

    const { ledger: next, reservation } = addReservation(
      ledger,
      {
        runId: options.runId ?? randomUUID(),
        labId: options.labId ?? 'resume-import-ai',
        kind: options.kind ?? 'lab-run',
        at: now.toISOString(),
        day,
        maxUsd,
        actorId: options.actorId ?? null,
        actorRole: options.actorRole ?? null,
      },
      randomUUID()
    );

    // The spend the caller is told about includes this reservation, so the
    // figure on screen is the one the next admission will see.
    const after = spendFor(next, day, now);
    const warning = after.committedUsd >= COST_WARN_USD;

    return {
      ledger: next,
      result: decision(
        warning ? 'admitted-with-warning' : 'admitted',
        warning
          ? `Admitted. Today's AI lab spend is $${after.committedUsd.toFixed(4)}; the warning threshold is $${COST_WARN_USD.toFixed(2)} and the hard cap is $${COST_CAP_USD.toFixed(2)}.`
          : `Admitted. Today's AI lab spend is $${after.committedUsd.toFixed(4)} of a $${COST_CAP_USD.toFixed(2)} cap.`,
        after,
        projection.maxUsd,
        reservation.id
      ),
    };
  }, options);

  if (!outcome.ok) {
    return decision(
      'ledger-unavailable',
      outcome.reason === 'locked'
        ? 'Another lab run is being admitted right now and the cost ledger could not be locked. Try again in a moment.'
        : outcome.reason === 'write-failed'
          ? 'The cost ledger could not be written, so this run cannot be accounted for. Refused rather than run unaccounted.'
          : 'The cost ledger could not be read. Refused rather than assume nothing has been spent today.',
      noSpend(day),
      projection.maxUsd
    );
  }

  return outcome.result;
}

function nextDay(day: string): string {
  const next = new Date(`${day}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return ledgerDay(next);
}

/* ===========================================================================
 * The view
 * ======================================================================== */

/**
 * What the Resume Lab page shows before a run.
 *
 * Read-only and available to every role, including a viewer: knowing what the
 * day has cost is not an execution privilege.
 */
export function buildCostStatus(options: LedgerOptions = {}): CostStatusView {
  const now = (options.now ?? (() => new Date()))();
  const day = ledgerDay(now);
  const projection = projectRunCost();
  const read = withLedger((ledger) => ({ ledger, result: spendFor(ledger, day, now) }), options);

  if (!read.ok) {
    return {
      day,
      timezone: COST_TIMEZONE,
      warnUsd: COST_WARN_USD,
      capUsd: COST_CAP_USD,
      spend: noSpend(day),
      warning: false,
      canRun: false,
      projectedRunMaxUsd: projection.maxUsd,
      blockedReason:
        'The cost ledger could not be read, so today’s spend is unknown. Runs are refused rather than run unaccounted.',
      stages: projection.stages,
    };
  }

  const spend = read.result;
  const capReached = spend.committedUsd >= COST_CAP_USD;
  const wouldCross =
    projection.maxUsd !== null && spend.committedUsd + projection.maxUsd > COST_CAP_USD;

  return {
    day,
    timezone: COST_TIMEZONE,
    warnUsd: COST_WARN_USD,
    capUsd: COST_CAP_USD,
    spend,
    warning: spend.committedUsd >= COST_WARN_USD,
    canRun: projection.maxUsd !== null && !capReached && !wouldCross,
    projectedRunMaxUsd: projection.maxUsd,
    blockedReason:
      projection.maxUsd === null
        ? 'A model this lab uses has no price on file, so the most a run could cost cannot be bounded.'
        : capReached
          ? `Today's spend has reached the $${COST_CAP_USD.toFixed(2)} cap.`
          : wouldCross
            ? `A run could cost up to $${projection.maxUsd.toFixed(4)}, which would cross the $${COST_CAP_USD.toFixed(2)} cap.`
            : null,
    stages: projection.stages,
  };
}
