import { existsSync, readFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { isAIParserAvailable } from '@/services/import/resume-ai.service';

import { canRunDeveloperSuites } from '../../../modules/developer/guard';
import { listResumeFixtures, resolveResumePath } from '../../../modules/developer/live-qa/fixtures';
import {
  buildAi,
  buildEntities,
  buildPayloads,
  buildWarnings,
  missingPayloads,
} from './diagnostics';
import { createUsageProbe, type ObservedAiCall } from './telemetry';
import type {
  ResumeLabAi,
  ResumeLabEntities,
  ResumeLabFixture,
  ResumeLabMissingPayload,
  ResumeLabParsed,
  ResumeLabPayload,
  ResumeLabRetention,
  ResumeLabRunResult,
  ResumeLabSizes,
  ResumeLabSource,
  ResumeLabStage,
  ResumeLabTokens,
  ResumeLabView,
  ResumeLabWarning,
} from './types';

/**
 * The resume lab: one run of the **shipped** import pipeline, measured
 * (PLATFORM_TODO item 21).
 *
 * Server-only. It reproduces the product path rather than re-implementing it:
 * `extractTextFromPDF(buffer)` and then `runResumeParseAgent({ text, userId })`
 * — the same two calls `importResumeWithAI` makes, in the same order, with the
 * same input limits the product route applies. The dead `lib/resume-parser/`,
 * the orphaned `services/resume-parser-ai.service.ts` and the unused
 * openresume importer are deliberately untouched; a test asserts none of them
 * is imported here.
 *
 * **Nothing is saved.** `saveToProfile` is never passed, so the agent's
 * `optional-save` step is a no-op, and `saveAIResumeToProfile` is never
 * imported by this module. The product's own write lives in its route, not in
 * the service, so walking the service path writes no product data.
 *
 * One thing it *does* write, and should be said plainly: `runAgent` persists an
 * `AgentRun` telemetry row for every run it performs, the product's included
 * (`lib/agents/runtime.ts` → `persistAgentRun`). A lab run therefore leaves one
 * row in `AgentRun` — the same row a real import leaves, carrying step timings
 * and token totals and no resume content beyond a summary. That is the shipped
 * runtime's behaviour, not something the lab added, and item 22 reads those
 * rows. No other table is touched.
 *
 * Timing uses `performance.now()`, and the agent's four steps are reported from
 * the `AgentRun`'s own `stepMetas` rather than re-timed from outside — the
 * agent already measures itself, and inventing a subdivision would be making
 * up a number.
 */

/** The product route's limits, applied unchanged. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPE = 'application/pdf';

/** Below this the shipped service refuses, calling the PDF image-based. */
const MIN_EXTRACTED_CHARS = 50;

const GATE_REASON =
  'Running the resume lab is local-only: it is refused in production and needs DEVTOOLS_ENABLED=true elsewhere. It spawns no process, but it does call the AI provider.';

/** Every `%PDF` file begins with these bytes. Checked instead of trusting a type. */
function looksLikePdf(bytes: Buffer): boolean {
  return bytes.length > 4 && bytes.subarray(0, 4).toString('latin1') === '%PDF';
}

/**
 * Committed fixtures, from the Live QA pool.
 *
 * Pool only: `listResumeFixtures()` also lists whatever an operator dropped in
 * the gitignored uploads directory, and a lab that resolves an arbitrary id
 * against that is a worse idea than the upload mode it would duplicate.
 */
export function listResumeLabFixtures(): ResumeLabFixture[] {
  return listResumeFixtures()
    .filter((fixture) => fixture.source === 'pool')
    .map((fixture) => {
      const resolved = resolveResumePath(fixture.id);
      let bytes: number | null = null;
      try {
        bytes = resolved !== null && existsSync(resolved) ? statSync(resolved).size : null;
      } catch {
        bytes = null;
      }

      return {
        id: fixture.id,
        label: fixture.label,
        description: fixture.description,
        bytes,
      };
    });
}

export type ResumeLabViewOptions = {
  canRun?: boolean;
  aiAvailable?: boolean;
  fixtures?: ResumeLabFixture[];
};

/** What the page renders before a run. */
export function buildResumeLabView(options: ResumeLabViewOptions = {}): ResumeLabView {
  return {
    fixtures: options.fixtures ?? listResumeLabFixtures(),
    canRun: options.canRun ?? canRunDeveloperSuites(),
    gateReason: GATE_REASON,
    aiAvailable: options.aiAvailable ?? isAiConfigured(),
    maxBytes: MAX_UPLOAD_BYTES,
    acceptedType: ACCEPTED_TYPE,
  };
}

/**
 * The product's own availability probe.
 *
 * `isAIParserAvailable()` is the check `app/api/import/resume/route.ts` makes
 * before it does anything, so the lab asks the same question of the same
 * function rather than reading an environment variable itself.
 */
function isAiConfigured(): boolean {
  try {
    return isAIParserAvailable();
  } catch {
    return false;
  }
}

/** A stopwatch that reports whole milliseconds from a monotonic clock. */
function stopwatch() {
  const started = performance.now();
  return () => Math.round(performance.now() - started);
}

type Stages = { list: ResumeLabStage[]; add: (stage: ResumeLabStage) => void };

function stages(): Stages {
  const list: ResumeLabStage[] = [];
  return { list, add: (stage) => list.push(stage) };
}

function emptySizes(inputBytes: number): ResumeLabSizes {
  return {
    inputBytes,
    pages: null,
    extractedChars: 0,
    extractedBytes: 0,
    parserInputChars: 0,
    parsedJsonChars: null,
  };
}

function refuse(
  outcome: ResumeLabRunResult['outcome'],
  detail: string,
  context: {
    source: ResumeLabSource;
    inputLabel: string;
    sizes?: ResumeLabSizes;
    stages?: ResumeLabStage[];
    totalMs?: number;
    retention?: ResumeLabRetention | null;
    error?: string | null;
    /** A run that spent tokens before it failed still reports them. */
    ai?: ResumeLabAi | null;
    warnings?: ResumeLabWarning[];
  }
): ResumeLabRunResult {
  return {
    outcome,
    source: context.source,
    inputLabel: context.inputLabel,
    timing: { stages: context.stages ?? [], totalMs: context.totalMs ?? 0 },
    sizes: context.sizes ?? emptySizes(0),
    retention: context.retention ?? null,
    tokens: null,
    ai: context.ai ?? null,
    entities: null,
    // A refused run adds no diagnostics of its own: the outcome and the
    // detail already say what happened, and a warning list repeating them
    // would be decoration. Usage observed before the failure is the
    // exception — tokens were really spent.
    warnings: context.warnings ?? [],
    payloads: [],
    missingPayloads: [],
    parsed: null,
    agentRunId: null,
    detail,
    error: context.error ?? null,
  };
}

/** The message of a thrown value, trimmed and never a stack. */
function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.split('\n')[0].slice(0, 300);
}

function retentionFor(extractedChars: number, keptChars: number): ResumeLabRetention {
  const dropped = Math.max(0, extractedChars - keptChars);
  const keptPercent =
    extractedChars === 0 ? 0 : Math.round((keptChars / extractedChars) * 1000) / 10;

  return {
    extractedChars,
    keptChars,
    droppedChars: dropped,
    keptPercent,
    note:
      dropped === 0
        ? 'The shipped pipeline hands the extracted text to the parser unchanged, so nothing was dropped. Measured at the boundary, not assumed.'
        : `${dropped} characters did not reach the parser.`,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

type ParsedDocument = { numpages?: number };

/** A page count, and which library produced it. */
export type PageCount = { pages: number | null; via: string };

/**
 * Pages, read separately from the text.
 *
 * A second read of the same bytes, and the only part of the lab that is not a
 * shipped call: `extractTextFromPDF` returns a string, so the page count it
 * had is gone by the time the lab sees the result. Timed on its own so the
 * extraction figure stays the shipped function's own.
 *
 * It tries the two libraries in the **same order the shipped extractor does**,
 * so the count comes from whichever one actually read the file. That order
 * matters more than it looks: `pdf-parse` throws on import under ESM — its
 * index runs a debug block that reads a sample PDF it does not ship — so in
 * practice `unpdf` answers, and it is `unpdf` that extracted the text too.
 * The stage says which one it was rather than leaving that silent.
 */
async function readPageCount(bytes: Buffer): Promise<PageCount> {
  try {
    const pdfParse = await import('pdf-parse');
    const data = (await pdfParse.default(bytes)) as ParsedDocument;
    if (typeof data.numpages === 'number') return { pages: data.numpages, via: 'pdf-parse' };
  } catch {
    // Falls through to the same fallback the shipped extractor uses.
  }

  try {
    const { extractText } = await import('unpdf');
    const { totalPages } = await extractText(new Uint8Array(bytes), { mergePages: true });
    if (typeof totalPages === 'number') return { pages: totalPages, via: 'unpdf' };
  } catch {
    // Neither library could read it; the extraction stage will say so too.
  }

  return { pages: null, via: 'neither pdf-parse nor unpdf could read it' };
}

function parsedFrom(data: any): ResumeLabParsed {
  const json = JSON.stringify(data, null, 2);

  return {
    counts: {
      experiences: Array.isArray(data?.experiences) ? data.experiences.length : 0,
      educations: Array.isArray(data?.educations) ? data.educations.length : 0,
      projects: Array.isArray(data?.projects) ? data.projects.length : 0,
      skills: Array.isArray(data?.skills) ? data.skills.length : 0,
      links: Array.isArray(data?.links) ? data.links.length : 0,
      certifications: Array.isArray(data?.certifications) ? data.certifications.length : 0,
    },
    headline: typeof data?.profile?.headline === 'string' ? data.profile.headline : null,
    summaryChars: typeof data?.profile?.summary === 'string' ? data.profile.summary.length : 0,
    model: typeof data?.meta?.model === 'string' ? data.meta.model : null,
    confidence: typeof data?.meta?.confidence === 'number' ? data.meta.confidence : null,
    json,
  };
}

function tokensFrom(run: any): ResumeLabTokens {
  const totals = run?.totalTokensUsed ?? { input: 0, output: 0 };
  const metas: any[] = Array.isArray(run?.stepMetas) ? run.stepMetas : [];
  const input = Number(totals.input) || 0;
  const output = Number(totals.output) || 0;
  const byStep = metas
    .filter((meta) => meta?.tokensUsed)
    .map((meta) => ({
      stepId: String(meta.stepId),
      model: typeof meta.model === 'string' ? meta.model : null,
      input: Number(meta.tokensUsed?.input) || 0,
      output: Number(meta.tokensUsed?.output) || 0,
    }));

  return {
    input,
    output,
    total: input + output,
    byStep,
    // Measured, and zero for a reason worth naming: the shipped runtime
    // accumulates usage from a step's own meta, and the resume-parse
    // workflow steps report duration without it. The AI client knows the
    // real numbers; the agent record does not carry them. Item 22 needs
    // this fixed in the runtime, not papered over here.
    note:
      input === 0 && output === 0
        ? 'The AgentRun reports no token usage. A workflow agent’s steps record duration only — the shipped runtime adds usage for tool-agent turns — so this is 0 for every resume import, the product’s included.'
        : 'Read from the AgentRun the shipped runtime produced.',
  };
}

/** The `AgentRun` reading for a run that never produced one. */
function emptyTokens(): ResumeLabTokens {
  return {
    input: 0,
    output: 0,
    total: 0,
    byStep: [],
    note: 'The agent failed before it produced a record.',
  };
}

export type ResumeLabInput =
  | { source: 'fixture'; fixtureId: string }
  | { source: 'upload'; bytes: Buffer; filename?: string; declaredType?: string };

export type ResumeLabRunOptions = {
  /** Gate result. Defaults to the real `canRunDeveloperSuites()`. */
  canRun?: boolean;
  /** Availability probe. Defaults to the product's own. */
  aiAvailable?: boolean;
  /** Passed to the agent as the acting user. Never used to save anything. */
  userId?: string;
  /** The shipped extractor. The seam a test replaces to avoid reading a PDF. */
  extractText?: (bytes: Buffer) => Promise<string>;
  /** The shipped agent. The seam a test replaces to avoid calling a model. */
  runAgent?: (input: { text: string; userId: string }) => Promise<any>;
  /** Page-count probe, so a test need not parse a PDF. */
  readPages?: (bytes: Buffer) => Promise<PageCount>;
  /**
   * The AI usage probe (item 22). Replaceable so a test can supply telemetry
   * — or none — without reaching the provider.
   */
  observeUsage?: UsageProbe;
};

/** What `createUsageProbe()` returns, named so a test can substitute one. */
export type UsageProbe = {
  calls: ObservedAiCall[];
  observe: <T>(body: () => Promise<T>) => Promise<T>;
};

/** The shipped extractor, loaded lazily so importing this module is cheap. */
async function shippedExtractText(bytes: Buffer): Promise<string> {
  const { extractTextFromPDF } = await import('@/services/import/resume-ai.service');
  return extractTextFromPDF(bytes);
}

/**
 * The shipped agent, with `saveToProfile` deliberately absent.
 *
 * Not merely false — absent. The agent's save step is gated on the flag being
 * truthy, and leaving it out means no code path in this lab can reach
 * `saveAIResumeToProfile`.
 */
async function shippedRunAgent(input: { text: string; userId: string }): Promise<any> {
  const { runResumeParseAgent } = await import('@/services/agents/resume-parse');
  return runResumeParseAgent(
    { text: input.text, userId: input.userId },
    { userId: input.userId, meta: { source: 'resume-lab' } }
  );
}

/** Reads the PDF a request named, without taking a path from the caller. */
function readInput(
  input: ResumeLabInput
): { ok: true; bytes: Buffer; label: string } | { ok: false; result: ResumeLabRunResult } {
  if (input.source === 'upload') {
    const label = (input.filename ?? 'upload').split(/[\\/]/).pop() ?? 'upload';

    if (input.bytes.length === 0) {
      return {
        ok: false,
        result: refuse('no-input', 'The upload was empty.', {
          source: 'upload',
          inputLabel: label,
        }),
      };
    }
    if (input.bytes.length > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        result: refuse(
          'too-large',
          `The file is ${input.bytes.length} bytes. The product route refuses anything over 5 MB, and so does this.`,
          { source: 'upload', inputLabel: label, sizes: emptySizes(input.bytes.length) }
        ),
      };
    }
    if (!looksLikePdf(input.bytes)) {
      return {
        ok: false,
        result: refuse(
          'not-a-pdf',
          'Only PDFs are supported, as in the product route. The file does not begin with %PDF, whatever its name or type says.',
          { source: 'upload', inputLabel: label, sizes: emptySizes(input.bytes.length) }
        ),
      };
    }

    return { ok: true, bytes: input.bytes, label };
  }

  // A fixture is named by id and resolved against the committed pool, so no
  // path from a caller is ever joined to the filesystem.
  const fixture = listResumeLabFixtures().find((entry) => entry.id === input.fixtureId);
  if (fixture === undefined) {
    return {
      ok: false,
      result: refuse('unknown-fixture', 'No fixture by that id is in the pool.', {
        source: 'fixture',
        inputLabel: input.fixtureId,
      }),
    };
  }

  const resolved = resolveResumePath(fixture.id);
  if (resolved === null || !existsSync(resolved)) {
    return {
      ok: false,
      result: refuse('unknown-fixture', 'That fixture is listed and its file is not on disk.', {
        source: 'fixture',
        inputLabel: fixture.id,
      }),
    };
  }

  return { ok: true, bytes: readFileSync(resolved), label: fixture.id };
}

/** Runs the shipped pipeline once and measures it. */
export async function runResumeLab(
  input: ResumeLabInput,
  options: ResumeLabRunOptions = {}
): Promise<ResumeLabRunResult> {
  const source = input.source;
  const totalClock = stopwatch();
  const stage = stages();

  if (!(options.canRun ?? canRunDeveloperSuites())) {
    return refuse('gate-closed', GATE_REASON, { source, inputLabel: '' });
  }

  const readClock = stopwatch();
  const read = readInput(input);
  if (!read.ok) return read.result;
  stage.add({
    id: 'input',
    label: 'Read the input',
    ms: readClock(),
    detail:
      source === 'fixture'
        ? 'Read the committed fixture from disk.'
        : 'The upload was already in memory; this is the time to check its size and magic bytes.',
  });

  const bytes = read.bytes;
  const label = read.label;

  // The product refuses here before doing any work, and so does the lab.
  if (!(options.aiAvailable ?? isAiConfigured())) {
    return refuse(
      'ai-unavailable',
      'No AI provider is configured, so the parse step cannot run. The product route refuses at the same point.',
      {
        source,
        inputLabel: label,
        sizes: emptySizes(bytes.length),
        stages: stage.list,
        totalMs: totalClock(),
      }
    );
  }

  const pagesClock = stopwatch();
  const pageCount = await (options.readPages ?? readPageCount)(bytes);
  const pages = pageCount.pages;
  stage.add({
    id: 'pages',
    label: 'Read page count',
    ms: pagesClock(),
    detail: `Lab only: the shipped extractor returns text and discards the page count. Read by ${pageCount.via}.`,
  });

  const extractClock = stopwatch();
  let text: string;
  try {
    text = await (options.extractText ?? shippedExtractText)(bytes);
  } catch (error) {
    stage.add({
      id: 'extract',
      label: 'Extract text',
      ms: extractClock(),
      detail: 'The shipped `extractTextFromPDF`.',
    });

    return refuse(
      'extraction-failed',
      'The shipped extractor could not get text out of this PDF. It may be image-based or corrupted.',
      {
        source,
        inputLabel: label,
        sizes: { ...emptySizes(bytes.length), pages },
        stages: stage.list,
        totalMs: totalClock(),
        error: messageOf(error),
      }
    );
  }
  stage.add({
    id: 'extract',
    label: 'Extract text',
    ms: extractClock(),
    detail: 'The shipped `extractTextFromPDF`.',
  });

  const sizes: ResumeLabSizes = {
    inputBytes: bytes.length,
    pages,
    extractedChars: text.length,
    extractedBytes: Buffer.byteLength(text, 'utf8'),
    parserInputChars: 0,
    parsedJsonChars: null,
  };

  if (text.length < MIN_EXTRACTED_CHARS) {
    return refuse(
      'text-too-short',
      `Only ${text.length} characters came out. The shipped service refuses below ${MIN_EXTRACTED_CHARS}, calling the PDF image-based or corrupted.`,
      {
        source,
        inputLabel: label,
        sizes,
        stages: stage.list,
        totalMs: totalClock(),
        retention: retentionFor(text.length, text.length),
      }
    );
  }

  // What the agent is handed. The retention figures compare this with what the
  // extractor returned, so the measurement survives a future change.
  const parserInput = text;
  sizes.parserInputChars = parserInput.length;
  const retention = retentionFor(text.length, parserInput.length);

  // One call, watched. The probe reads the usage the AI client already
  // reports and the pipeline then discards; it adds no request of its own,
  // and it is detached before this line returns. See `telemetry.ts`.
  const probe = options.observeUsage ?? createUsageProbe();

  const agentClock = stopwatch();
  let result: any;
  try {
    result = await probe.observe(() =>
      (options.runAgent ?? shippedRunAgent)({
        text: parserInput,
        userId: options.userId ?? 'resume-lab',
      })
    );
  } catch (error) {
    stage.add({
      id: 'agent',
      label: 'Resume parse agent',
      ms: agentClock(),
      detail: 'The shipped `runResumeParseAgent`, with `saveToProfile` omitted.',
    });

    // Tokens the failed run already spent are real and are reported.
    const spent = buildAi(probe.calls, emptyTokens(), null);

    return refuse(
      'agent-failed',
      'Extraction worked and the parse agent did not. The numbers above are still real.',
      {
        source,
        inputLabel: label,
        sizes,
        stages: stage.list,
        totalMs: totalClock(),
        retention,
        error: messageOf(error),
        ai: spent,
        warnings: buildWarnings({
          sizes,
          retention,
          entities: null,
          ai: spent,
          confidence: null,
          reportedModel: null,
          maxUploadBytes: MAX_UPLOAD_BYTES,
        }),
      }
    );
  }
  const agentMs = agentClock();
  stage.add({
    id: 'agent',
    label: 'Resume parse agent',
    ms: agentMs,
    detail: 'The shipped `runResumeParseAgent`, with `saveToProfile` omitted.',
  });

  // The agent's own measurements of its four steps. Reported rather than
  // re-timed: it already knows, and a second stopwatch outside it would be a
  // different number pretending to be the same one.
  for (const meta of Array.isArray(result?.run?.stepMetas) ? result.run.stepMetas : []) {
    stage.add({
      id: `agent:${meta.stepId}`,
      label: `  ${meta.stepId}`,
      ms: Math.round(Number(meta.durationMs) || 0),
      detail: `Reported by the agent${meta.model ? ` · ${meta.model}` : ''}.`,
    });
  }

  const data = result?.output?.data;
  const parsed = data ? parsedFrom(data) : null;
  sizes.parsedJsonChars = parsed?.json.length ?? null;

  // Item 22, all of it derived from the run above. No second model call: the
  // usage was observed while the one agent call ran, the entities come from
  // the object it returned, and the warnings are rules over those numbers.
  const tokens = tokensFrom(result?.run);
  const ai = buildAi(probe.calls, tokens, parsed?.model ?? null);
  const entities: ResumeLabEntities | null = data ? buildEntities(data) : null;
  const warnings: ResumeLabWarning[] = buildWarnings({
    sizes,
    retention,
    entities,
    ai,
    confidence: parsed?.confidence ?? null,
    reportedModel: parsed?.model ?? null,
    maxUploadBytes: MAX_UPLOAD_BYTES,
  });
  const payloads: ResumeLabPayload[] = buildPayloads({
    extractedText: text,
    parserInput,
    parsedJson: parsed?.json ?? null,
    stepMetas: result?.run?.stepMetas,
    observed: probe.calls,
  });
  const missing: ResumeLabMissingPayload[] = missingPayloads();

  return {
    outcome: 'parsed',
    source,
    inputLabel: label,
    timing: { stages: stage.list, totalMs: totalClock() },
    sizes,
    retention,
    tokens,
    ai,
    entities,
    warnings,
    payloads,
    missingPayloads: missing,
    parsed,
    agentRunId: typeof result?.run?.id === 'string' ? result.run.id : null,
    detail:
      'Ran the shipped pipeline end to end. Nothing was saved: no profile, no resume row, no product write.',
    error: null,
  };
}
