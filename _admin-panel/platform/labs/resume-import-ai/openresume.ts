/**
 * The OpenResume side of the comparison (PLATFORM_TODO item 23).
 *
 * ## Which boundary, and why not the obvious one
 *
 * `services/import/resume-openresume.service.ts` exports three things:
 *
 * - `normalizeResumeData(parsed)` — pure.
 * - `importResumeFromPdf(buffer, userId)` — parses, normalizes, and then
 *   **writes a `RawImportPayload` row** (`:318`).
 * - `saveResumeDataToProfile(...)` — writes the whole profile.
 *
 * `importResumeFromPdf` is the function that looks like the entry point, and
 * the lab must not call it: `RawImportPayload` is product data, and item 23
 * compares parsers rather than importing anything. So the lab composes the
 * two pure halves itself —
 *
 *     parseResumeFromPdfBuffer(buffer)   // lib/resume-parser, pure
 *     normalizeResumeData(parsed)        // the openresume service, pure
 *
 * — which is exactly what `importResumeFromPdf` does minus the write. The
 * lab is still the first consumer of `resume-openresume.service.ts`, as the
 * TODO's Note says it becomes; it just enters through the door that does not
 * touch the database.
 *
 * ## What this parser actually is
 *
 * Two things an operator should know before reading its output, both of them
 * facts about the shipped module rather than opinions about it:
 *
 * 1. **Its positions are synthesized.** The OpenResume algorithm works from
 *    text items with x/y coordinates, and `lib/resume-parser/read-pdf.ts`
 *    does not read real ones — `processTextIntoItems` invents coordinates
 *    from plain text lines on a fixed grid. The layout algorithm is
 *    therefore running on an approximation of the page.
 * 2. **It spawns a child process.** `readPdfFromBuffer` pipes the PDF to
 *    `node scripts/parse-pdf.cjs` over stdin and reads JSON back from
 *    stdout, because `pdf-parse` does not survive bundling. Nothing is
 *    written to disk, so there is no temporary file to clean up.
 *
 * Neither is a defect the lab fixes. Item 23 says to treat this as an
 * untested baseline and say so, so the lab says so.
 */

import { performance } from 'node:perf_hooks';

import type { ParserRun } from './comparison-types';
import { buildEntities } from './diagnostics';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const OPENRESUME_IMPLEMENTATION =
  'lib/resume-parser › parseResumeFromPdfBuffer, then services/import/resume-openresume.service.ts › normalizeResumeData';

export const OPENRESUME_AI_NOTE =
  'No provider AI call in this parser. It is a deterministic layout-and-keyword parser, so it has no tokens and no provider cost — which is not the same as being free: it spends local CPU and spawns a child process to read the PDF.';

export const OPENRESUME_BASELINE_NOTE =
  'An untested baseline. This parser ships in the repository but nothing in the product imports it, so no shipped behaviour depends on the output below, and no test covered it before this lab. Its positional input is synthesized from plain text rather than read from the page.';

/** The pure parse, with no writing wrapper anywhere in the call. */
async function shippedOpenResumeParse(bytes: Buffer): Promise<any> {
  const { parseResumeFromPdfBuffer } = await import('@/lib/resume-parser');
  return parseResumeFromPdfBuffer(bytes);
}

/** The openresume service's own pure normalizer. */
async function shippedOpenResumeNormalize(parsed: any): Promise<any> {
  const { normalizeResumeData } = await import('@/services/import/resume-openresume.service');
  return normalizeResumeData(parsed);
}

export type OpenResumeOptions = {
  /** The parse seam, so a test need not spawn a child process. */
  parse?: (bytes: Buffer) => Promise<any>;
  /** The normalize seam. */
  normalize?: (parsed: unknown) => Promise<any>;
};

function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.split('\n')[0].slice(0, 300);
}

/**
 * Runs the OpenResume path once and reports it on its own terms.
 *
 * The two halves are timed separately because the parser genuinely has two
 * halves; nothing finer is reported, because nothing finer is exposed and
 * inventing a subdivision would be making up a number.
 */
export async function runOpenResume(
  bytes: Buffer,
  options: OpenResumeOptions = {}
): Promise<ParserRun> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const stages: ParserRun['stages'] = [];

  const base = {
    side: 'openResume' as const,
    implementation: OPENRESUME_IMPLEMENTATION,
    ai: null,
    aiNote: OPENRESUME_AI_NOTE,
    note: OPENRESUME_BASELINE_NOTE,
  };

  let parsed: any;
  const parseStarted = performance.now();
  try {
    parsed = await (options.parse ?? shippedOpenResumeParse)(bytes);
  } catch (error) {
    stages.push({
      id: 'openresume:parse',
      label: 'Parse PDF',
      ms: Math.round(performance.now() - parseStarted),
      detail: 'The shipped `parseResumeFromPdfBuffer`, which reads the PDF in a child process.',
    });

    return {
      ...base,
      outcome: 'failed',
      durationMs: elapsed(),
      stages,
      entities: null,
      confidence: null,
      parseMethod: null,
      json: null,
      error: messageOf(error),
    };
  }
  stages.push({
    id: 'openresume:parse',
    label: 'Parse PDF',
    ms: Math.round(performance.now() - parseStarted),
    detail: 'The shipped `parseResumeFromPdfBuffer`, which reads the PDF in a child process.',
  });

  let normalized: any;
  const normalizeStarted = performance.now();
  try {
    normalized = await (options.normalize ?? shippedOpenResumeNormalize)(parsed);
  } catch (error) {
    stages.push({
      id: 'openresume:normalize',
      label: 'Normalize',
      ms: Math.round(performance.now() - normalizeStarted),
      detail: 'The openresume service’s own `normalizeResumeData`.',
    });

    return {
      ...base,
      outcome: 'failed',
      durationMs: elapsed(),
      stages,
      entities: null,
      confidence: null,
      parseMethod: null,
      json: null,
      error: messageOf(error),
    };
  }
  stages.push({
    id: 'openresume:normalize',
    label: 'Normalize',
    ms: Math.round(performance.now() - normalizeStarted),
    detail: 'The openresume service’s own `normalizeResumeData`.',
  });

  return {
    ...base,
    outcome: 'parsed',
    durationMs: elapsed(),
    stages,
    entities: buildEntities(normalized),
    confidence:
      typeof normalized?.meta?.confidence === 'number' ? normalized.meta.confidence : null,
    parseMethod:
      typeof normalized?.meta?.parseMethod === 'string' ? normalized.meta.parseMethod : null,
    json: JSON.stringify(normalized, null, 2),
    error: null,
  };
}
