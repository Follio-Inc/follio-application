/**
 * Observing what the shipped pipeline already reports about its AI calls
 * (PLATFORM_TODO item 22).
 *
 * ## The problem
 *
 * `lib/ai-client.ts` reads the provider's own `response.usage` and puts it in
 * a `PipelineStageMeta`. Both resume stages then throw that meta away:
 * `parseResumeTextWithAI` logs it and returns only the parsed data
 * (`services/import/resume-ai.service.ts:324-339`), and
 * `rewriteNormalizedResumeForFollio` destructures `{ data: raw }` and drops
 * the rest (`services/agents/resume-parse/rewrite-for-follio.ts:118`). The
 * workflow branch of `lib/agents/runtime.ts` has no meta to accumulate, so
 * `AgentRun.totalTokensUsed` is `{0, 0}` for every resume import, the
 * product's included. That zero is missing telemetry, not a measurement.
 *
 * ## Why this file exists instead of a product change
 *
 * Fixing the discard would mean changing the return type of two shipped
 * functions and the workflow runtime. Item 22 asks the lab to report usage,
 * not to re-plumb the product, so the lab reads what the product already
 * emits and changes nothing.
 *
 * The AI client logs every completion through `lib/logger.ts`, which writes
 * the context as JSON — pretty-printed in development, one line in
 * production. So this is parsing the logger's own JSON, not scraping prose:
 *
 *     { "source": "ai-client", "durationMs": 1662, "tokensInput": 14,
 *       "tokensOutput": 1, "model": "gpt-4o-mini", "toolCallCount": 0 }
 *
 * ## What it costs
 *
 * `console.log` is process-global, so for the length of one agent call this
 * observes everything the process prints. Three things keep that honest:
 *
 * 1. The window is the agent call and nothing else, and it is closed in a
 *    `finally`.
 * 2. Only entries that are an `ai-client` completion for one of this
 *    pipeline's two stages are kept. Everything else is forwarded untouched
 *    and forgotten.
 * 3. Only five fields are retained — stage, model, two token counts and a
 *    duration. The log line, the rest of the context and anything else
 *    printed in the window are never stored.
 *
 * The residual risk is attribution: a second resume import running in the
 * same process during the window would have its usage counted here. The
 * resume pipeline makes exactly one call per stage, so a repeated stage means
 * exactly that happened, and the lab raises `duplicate-stage-telemetry`
 * rather than quietly inflating the total.
 */

import type { ResumeLabAiCall } from './types';

/** One completion the AI client reported, reduced to what the lab keeps. */
export type ObservedAiCall = {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

/**
 * The stages this pipeline can legitimately produce.
 *
 * `resumeParse` is `parseResumeTextWithAI`; `follioVoice` is the Follio
 * rewrite step. Anything else printed during the window belongs to someone
 * else and is not counted.
 */
export const RESUME_PIPELINE_STAGES: Readonly<Record<string, string>> = {
  resumeParse: 'Structured extraction',
  follioVoice: 'Follio headline and about rewrite',
};

const COMPLETION_MESSAGE = 'Chat completion finished';

/** `\x1b[32m` and friends, which the development logger wraps its line in. */
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

type LogContext = {
  source?: unknown;
  model?: unknown;
  tokensInput?: unknown;
  tokensOutput?: unknown;
  durationMs?: unknown;
};

function asJson(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The stage name in `[resumeParse] Chat completion finished`, if that is what this is. */
export function completionStageOf(line: unknown): string | null {
  if (typeof line !== 'string') return null;
  const clean = line.replace(ANSI, '');
  if (!clean.includes(COMPLETION_MESSAGE)) return null;

  const match = /\[([A-Za-z][A-Za-z0-9_-]*)\]\s*$/.exec(clean.split(COMPLETION_MESSAGE)[0].trim());
  const stage = match?.[1] ?? null;
  return stage !== null && stage in RESUME_PIPELINE_STAGES ? stage : null;
}

/** An `ai-client` usage context, or null if this is some other object. */
export function usageFrom(value: unknown): Omit<ObservedAiCall, 'stage'> | null {
  const json = asJson(value) as LogContext | null;
  if (json === null) return null;
  if (json.source !== 'ai-client') return null;
  if (typeof json.tokensInput !== 'number' || typeof json.tokensOutput !== 'number') return null;

  return {
    model: typeof json.model === 'string' ? json.model : 'unknown',
    inputTokens: json.tokensInput,
    outputTokens: json.tokensOutput,
    durationMs: typeof json.durationMs === 'number' ? json.durationMs : 0,
  };
}

/**
 * A reader of the process's own output, for the length of one call.
 *
 * The development logger prints a completion as two calls — the message line,
 * then `'  Context:'` with the JSON — so a stage seen on one line is held
 * until the usage arrives on the next. Production prints one JSON line
 * carrying both; `pushSingleLine` handles that shape.
 */
export function createUsageProbe() {
  const calls: ObservedAiCall[] = [];
  let pendingStage: string | null = null;

  function push(args: unknown[]): void {
    // Production: one JSON line holding message and context together.
    const single = asJson(args[0]);
    if (single !== null && typeof single.message === 'string') {
      const stage = completionStageOf(single.message);
      const usage = usageFrom(single.context);
      if (stage !== null && usage !== null) calls.push({ stage, ...usage });
      return;
    }

    const stage = completionStageOf(args[0]);
    if (stage !== null) {
      pendingStage = stage;
      return;
    }

    if (pendingStage === null) return;
    const usage = usageFrom(args[1]);
    if (usage !== null) calls.push({ stage: pendingStage, ...usage });
    // Either way the stage line has had its turn; a context that did not
    // match belongs to a different entry.
    pendingStage = null;
  }

  return {
    calls,
    /**
     * Runs `body` with the probe attached. The original `console.log` is
     * restored before this resolves, including on a throw, and every call is
     * forwarded to it untouched — the lab watches the output, it does not
     * swallow it.
     */
    async observe<T>(body: () => Promise<T>): Promise<T> {
      const original = console.log;
      console.log = (...args: unknown[]) => {
        try {
          push(args);
        } catch {
          // An observation that fails must never break the run it observes.
        }
        original(...args);
      };

      try {
        return await body();
      } finally {
        console.log = original;
      }
    },
  };
}

/** Observed calls, in the order the pipeline made them, with labels attached. */
export function labelCalls(calls: ObservedAiCall[]): Omit<ResumeLabAiCall, 'cost'>[] {
  return calls.map((call) => ({
    stage: call.stage,
    label: RESUME_PIPELINE_STAGES[call.stage] ?? call.stage,
    model: call.model,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    totalTokens: call.inputTokens + call.outputTokens,
    durationMs: call.durationMs,
    maxOutputTokens: null,
  }));
}
