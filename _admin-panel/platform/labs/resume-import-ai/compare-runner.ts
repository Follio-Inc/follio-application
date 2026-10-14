/**
 * Running the same document through both parsers (PLATFORM_TODO item 23).
 *
 * Server-only. The shape of a comparison:
 *
 *     source PDF (read once, hashed)
 *       ├── openresume   parseResumeFromPdfBuffer → normalizeResumeData
 *       └── AI           extractTextFromPDF → runResumeParseAgent
 *
 * ## Same input
 *
 * The bytes are resolved once by the existing `resolveResumeLabInput`, which
 * applies the product route's PDF-only and 5 MB rules, and the identical
 * buffer goes to both sides. Its SHA-256 travels in the result, so the
 * same-input claim is checkable rather than asserted.
 *
 * The two parsers then diverge *internally*, and the result says so rather
 * than calling the inputs identical: the AI path flattens the PDF to a
 * string with `unpdf` in process, while openresume pipes the same bytes to
 * `pdf-parse` in a child process and rebuilds synthetic text positions from
 * the result. Same document, two extractions — which is a difference between
 * the parsers, not a difference the lab introduced.
 *
 * ## Sequential, deliberately
 *
 * The two runs never overlap. Item 22's token telemetry is observed from the
 * process's own output, and that probe is attached for the length of the
 * agent call; openresume logs heavily to the same stream and spawns a child
 * process that writes to stdout. Running them concurrently would put that
 * output inside the attribution window for no benefit beyond latency, and
 * item 22 already identified concurrent AI calls as the one way these
 * numbers can go wrong. OpenResume runs first so the AI telemetry window is
 * as short and as quiet as it can be.
 *
 * ## Writes
 *
 * Neither side writes product data. The AI side omits `saveToProfile` as it
 * has since item 21; the openresume side enters through the pure boundary
 * described in `openresume.ts`, never through `importResumeFromPdf`, which
 * would create a `RawImportPayload` row.
 */

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { buildComparison, buildComparisonWarnings } from './comparison';
import type { ParserRun, ResumeComparisonResult } from './comparison-types';
import { buildEntities } from './diagnostics';
import { runOpenResume, type OpenResumeOptions } from './openresume';
import {
  MAX_UPLOAD_BYTES,
  resolveResumeLabInput,
  runResumeLab,
  type ResumeLabInput,
  type ResumeLabRunOptions,
} from './runner';
import type { ResumeLabRunResult } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const EXECUTION_NOTE =
  'The two runs are sequential, openresume first. The AI side’s token telemetry is observed from the process’s own output for the length of its call, and the legacy parser logs to the same stream and spawns a child process; overlapping them would widen that attribution window to buy nothing but latency.';

const AI_IMPLEMENTATION =
  'services/import/resume-ai.service.ts › extractTextFromPDF, then services/agents/resume-parse › runResumeParseAgent';

const AI_NOTE =
  'The shipped import path, exactly as the product route calls it, with `saveToProfile` omitted.';

export type ResumeComparisonOptions = ResumeLabRunOptions & {
  /** The openresume seams, so a test need not spawn a child process. */
  openResume?: OpenResumeOptions;
  /** Replaceable for a test that needs a failing or absent AI side. */
  runAi?: (input: ResumeLabInput, options: ResumeLabRunOptions) => Promise<ResumeLabRunResult>;
};

/** The AI run, restated in the comparison's own vocabulary. */
function aiRunFrom(result: ResumeLabRunResult, durationMs: number): ParserRun {
  const parsedOk = result.outcome === 'parsed';

  return {
    side: 'ai',
    implementation: AI_IMPLEMENTATION,
    outcome: parsedOk ? 'parsed' : 'failed',
    durationMs,
    // Item 21's stages, passed through rather than re-measured.
    stages: result.timing.stages.map((stage) => ({
      id: stage.id,
      label: stage.label.trim(),
      ms: stage.ms,
      detail: stage.detail,
    })),
    entities: result.entities,
    confidence: result.parsed?.confidence ?? null,
    parseMethod: parsedOk ? 'ai' : null,
    // Item 22's telemetry, unchanged.
    ai: result.ai,
    aiNote: AI_NOTE,
    json: result.parsed?.json ?? null,
    error: result.error ?? (parsedOk ? null : result.detail),
    note: AI_NOTE,
  };
}

/** The normalized object a side produced, for the projection. */
function dataOf(run: ParserRun | null): any {
  if (run === null || run.json === null) return null;
  try {
    return JSON.parse(run.json);
  } catch {
    return null;
  }
}

function refuse(
  outcome: ResumeComparisonResult['outcome'],
  detail: string,
  source: ResumeComparisonResult['source'],
  inputLabel: string
): ResumeComparisonResult {
  return {
    source,
    inputLabel,
    outcome,
    detail,
    ai: null,
    openResume: null,
    comparison: null,
    warnings: [],
  };
}

/**
 * Runs both parsers against one document and projects the results.
 *
 * Failure is per side. One parser throwing does not discard the other's
 * result, and it does not make the request an infrastructure failure: the
 * comparison still returns, with the surviving side populated and a warning
 * naming what happened.
 */
export async function runResumeComparison(
  input: ResumeLabInput,
  options: ResumeComparisonOptions = {}
): Promise<ResumeComparisonResult> {
  const started = performance.now();
  const source = input.source;

  // The gate first, as everywhere else in the platform.
  if (options.canRun === false) {
    return refuse(
      'gate-closed',
      'Running the resume lab is local-only.',
      source,
      input.source === 'fixture' ? input.fixtureId : (input.filename ?? 'upload')
    );
  }

  // Read once. Both parsers get this exact buffer.
  const resolved = resolveResumeLabInput(input);
  if (!resolved.ok) {
    const failed = resolved.result;
    return refuse(
      failed.outcome as ResumeComparisonResult['outcome'],
      failed.detail,
      source,
      failed.inputLabel
    );
  }

  const { bytes, label } = resolved;
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');

  // OpenResume first: see EXECUTION_NOTE. It is also the cheap one, so a
  // document neither parser can read fails fast and spends no tokens.
  const openResume = await runOpenResume(bytes, options.openResume);

  // Then the AI path, with the identical bytes and item 21/22 intact.
  const aiStarted = performance.now();
  const aiResult = await (options.runAi ?? runResumeLab)(input, {
    ...options,
    resolvedInput: { bytes, label },
  });
  const ai = aiRunFrom(aiResult, Math.round(performance.now() - aiStarted));

  const aiData = dataOf(ai);
  const openResumeData = dataOf(openResume);

  // The projection needs both sides. With one missing there is nothing to
  // compare, and the surviving side is still reported in full.
  const comparison =
    aiData !== null && openResumeData !== null
      ? buildComparison(aiData, openResumeData, {
          sourceSha256,
          sourceBytes: bytes.length,
          bothSucceeded: true,
          totalMs: Math.round(performance.now() - started),
          executionNote: EXECUTION_NOTE,
        })
      : null;

  const warnings = buildComparisonWarnings(ai, openResume, comparison?.entities ?? []);

  return {
    source,
    inputLabel: label,
    outcome: 'compared',
    detail:
      comparison !== null
        ? 'Both parsers ran against the same document. Nothing was saved: no profile, no resume row, no product write.'
        : 'One parser produced no result. The other side is reported in full below. Nothing was saved.',
    ai,
    openResume,
    comparison,
    warnings,
  };
}

/** Re-exported so the route need not reach past this module. */
export { MAX_UPLOAD_BYTES, buildEntities };
