import type { ResumeLabAiCall, ResumeLabCost, ResumeLabUsageStatus } from './types';

/**
 * Model prices for the Resume Lab's cost figure (PLATFORM_TODO item 22).
 *
 * **This is the only pricing source in the repository.** Nothing else prices a
 * token: a search for cost utilities turns up two doc comments and no code.
 * One of those comments — `services/import/resume-ai.service.ts:11`, "~$0.15
 * per 1M input tokens, ~$0.60 per 1M output tokens" — agrees exactly with the
 * `gpt-4o-mini` row below, which is the closest thing to corroboration the
 * repository can offer.
 *
 * Provenance and its limits, stated rather than implied:
 * - These are OpenAI's published list prices in USD per 1,000,000 tokens,
 *   checked against OpenAI's own model and announcement pages on
 *   **2026-10-14**: gpt-4o-mini $0.15/$0.60, gpt-4o $2.50/$10.00.
 * - They are not fetched at runtime. Nothing here notices when a price
 *   changes, so an old table produces a confidently wrong number. The date
 *   travels with every figure the lab shows, so an operator can judge it.
 * - They are standard list prices. OpenAI also publishes a cached-input rate
 *   (half price for gpt-4o-mini) and batch rates, and the usage the lab
 *   observes does not say whether a call hit the cache. A cached or batched
 *   call therefore cost *less* than the figure shown. The lab says
 *   "estimated" and means it.
 * - A model with no row here is not guessed at. It is reported as
 *   `pricing-unavailable`, and a run that used it says which model was
 *   unpriced.
 */

/** USD per 1,000,000 tokens. */
export type ModelPrice = {
  inputPerMillion: number;
  outputPerMillion: number;
};

export const PRICING_RECORDED_ON = '2026-10-14';

export const PRICING_SOURCE = `OpenAI published list prices per 1M tokens, checked ${PRICING_RECORDED_ON} and recorded in _admin-panel/platform/labs/resume-import-ai/pricing.ts. Not fetched at runtime, and standard rates only — a cached or batched call cost less.`;

/**
 * The two models this pipeline can reach.
 *
 * `lib/ai-client.ts` resolves `extraction` to `gpt-4o-mini` and `strategy` to
 * `gpt-4o`, and the resume pipeline uses one stage of each: `resumeParse` is
 * extraction, `follioVoice` is strategy. Both are listed so neither call
 * silently falls through to `pricing-unavailable`.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPrice>> = {
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
};

export function priceFor(model: string): ModelPrice | null {
  return MODEL_PRICING[model] ?? null;
}

/** Rounded to the nearest hundred-thousandth of a dollar; these are cents. */
function round(usd: number): number {
  return Math.round(usd * 1e5) / 1e5;
}

/** Cost for one provider call, or why there is none. */
export function costForCall(
  model: string,
  inputTokens: number,
  outputTokens: number,
  basis: ResumeLabUsageStatus
): ResumeLabCost {
  const price = priceFor(model);

  if (price === null) {
    return {
      status: 'pricing-unavailable',
      inputUsd: null,
      outputUsd: null,
      totalUsd: null,
      basis,
      pricingSource: null,
      models: [model],
      unpricedModels: [model],
      note: `No price on file for ${model}. Guessing one would be worse than saying so.`,
    };
  }

  const inputUsd = round((inputTokens / 1_000_000) * price.inputPerMillion);
  const outputUsd = round((outputTokens / 1_000_000) * price.outputPerMillion);

  return {
    status: 'available',
    inputUsd,
    outputUsd,
    totalUsd: round(inputUsd + outputUsd),
    basis,
    pricingSource: PRICING_SOURCE,
    models: [model],
    unpricedModels: [],
    note: `${inputTokens} in at $${price.inputPerMillion}/1M, ${outputTokens} out at $${price.outputPerMillion}/1M.`,
  };
}

/**
 * The run's total cost, summed across its calls.
 *
 * A run with no observed usage costs an unknown amount, not nothing: the
 * status is `usage-unavailable` and every figure stays null. A run whose
 * models are only partly priced reports `partial` and names the gap, rather
 * than presenting a total that quietly leaves a call out.
 */
export function costForRun(
  calls: ResumeLabAiCall[],
  basis: ResumeLabUsageStatus | null
): ResumeLabCost {
  if (calls.length === 0 || basis === null || basis === 'unavailable') {
    return {
      status: 'usage-unavailable',
      inputUsd: null,
      outputUsd: null,
      totalUsd: null,
      basis: null,
      pricingSource: null,
      models: [],
      unpricedModels: [],
      note: 'No token usage was observed, so the cost is unknown — which is not the same as zero.',
    };
  }

  const models = [...new Set(calls.map((call) => call.model))];
  const priced = calls.filter((call) => call.cost.status === 'available');
  const unpricedModels = [
    ...new Set(calls.filter((call) => call.cost.status !== 'available').map((call) => call.model)),
  ];

  if (priced.length === 0) {
    return {
      status: 'pricing-unavailable',
      inputUsd: null,
      outputUsd: null,
      totalUsd: null,
      basis,
      pricingSource: null,
      models,
      unpricedModels,
      note: `No price on file for ${unpricedModels.join(', ')}.`,
    };
  }

  const inputUsd = round(priced.reduce((sum, call) => sum + (call.cost.inputUsd ?? 0), 0));
  const outputUsd = round(priced.reduce((sum, call) => sum + (call.cost.outputUsd ?? 0), 0));

  return {
    status: unpricedModels.length === 0 ? 'available' : 'partial',
    inputUsd,
    outputUsd,
    totalUsd: round(inputUsd + outputUsd),
    basis,
    pricingSource: PRICING_SOURCE,
    models,
    unpricedModels,
    note:
      unpricedModels.length === 0
        ? `Estimated from ${basis} token counts and list prices. ${priced.length} call${priced.length === 1 ? '' : 's'} priced.`
        : `Covers ${priced.length} of ${calls.length} calls. No price on file for ${unpricedModels.join(', ')}, so the real total is higher than this.`,
  };
}
