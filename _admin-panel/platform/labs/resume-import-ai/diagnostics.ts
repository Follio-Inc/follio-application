/**
 * What one Resume Lab run means, derived from what it produced
 * (PLATFORM_TODO item 22).
 *
 * Everything here is a pure function of a run that has already happened: the
 * extracted text, the parser input, the agent's result and the AI usage
 * observed while it ran. Nothing in this file calls a model, re-runs a stage
 * or asks the provider anything. Entity counts come from the shipped schema,
 * warnings from fixed rules over real numbers, payloads from values the run
 * already held in memory.
 */

import { getStageConfig, type PipelineStage } from '@/lib/ai-client';

import { costForCall, costForRun } from './pricing';
import { labelCalls, type ObservedAiCall } from './telemetry';
import type {
  ResumeLabAi,
  ResumeLabAiCall,
  ResumeLabEntities,
  ResumeLabEntityCount,
  ResumeLabMissingPayload,
  ResumeLabPayload,
  ResumeLabRetention,
  ResumeLabSizes,
  ResumeLabTokens,
  ResumeLabUsage,
  ResumeLabWarning,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** How much of a payload travels to the browser. The full size is kept. */
export const PAYLOAD_PREVIEW_CHARS = 4000;

/** Below this many extracted characters a successful parse is still suspect. */
const THIN_EXTRACTION_CHARS = 400;

/** The shipped service's own confidence scale is 0–1. */
const LOW_CONFIDENCE = 0.5;

/** A completion this close to its configured cap was probably cut off. */
const NEAR_CAP_RATIO = 0.9;

/* ===========================================================================
 * AI usage and cost
 * ======================================================================== */

function maxOutputFor(stage: string): number | null {
  try {
    return getStageConfig(stage as PipelineStage).maxTokens ?? null;
  } catch {
    return null;
  }
}

/**
 * The AI block: which models ran, what they used and what that cost.
 *
 * `observed` requires an actual provider report. With none, the status is
 * `unavailable` and every number is null — the `AgentRun`'s `{0, 0}` is
 * carried alongside, labelled, and never promoted into the usage figures.
 */
export function buildAi(
  observed: ObservedAiCall[],
  agentTokens: ResumeLabTokens,
  reportedModel: string | null
): ResumeLabAi {
  const calls: ResumeLabAiCall[] = labelCalls(observed).map((call) => ({
    ...call,
    maxOutputTokens: maxOutputFor(call.stage),
    cost: costForCall(call.model, call.inputTokens, call.outputTokens, 'observed'),
  }));

  const agentRunRecorded = { input: agentTokens.input, output: agentTokens.output };
  const agentRunNote =
    'The shipped runtime accumulates token usage from a step’s own metadata. A workflow agent’s steps carry none, so this row reads 0/0 for every resume import — the product’s included. It is missing telemetry, not a measurement.';

  if (calls.length === 0) {
    const usage: ResumeLabUsage = {
      status: 'unavailable',
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      source:
        'No provider usage reached the lab during this run. The pipeline discards the AI client’s metadata, so there is nothing to read.',
      calls: [],
      agentRunRecorded,
      agentRunNote,
    };

    return { models: [], reportedModel, usage, cost: costForRun([], null) };
  }

  const inputTokens = calls.reduce((sum, call) => sum + call.inputTokens, 0);
  const outputTokens = calls.reduce((sum, call) => sum + call.outputTokens, 0);

  const usage: ResumeLabUsage = {
    status: 'observed',
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    source:
      'Reported by the provider. `lib/ai-client.ts` reads `response.usage` and emits it as structured telemetry; the lab read that while this run was in flight.',
    calls,
    agentRunRecorded,
    agentRunNote,
  };

  return {
    models: [...new Set(calls.map((call) => call.model))],
    reportedModel,
    usage,
    cost: costForRun(calls, 'observed'),
  };
}

/* ===========================================================================
 * Entities
 * ======================================================================== */

const ENTITY_RULE =
  'total is the sum of byType and nothing else. byType counts top-level records of each section of NormalizedResumeData, plus the filled fields of profile and contactInfo. Nested items — an experience’s bullets, a project’s technologies, a skill group’s members — are listed under nested and excluded from total.';

function filledFields(record: unknown): number {
  if (typeof record !== 'object' || record === null) return 0;
  return Object.values(record as Record<string, unknown>).filter(
    (value) => typeof value === 'string' && value.trim().length > 0
  ).length;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Entity counts from the structured result, using the shipped schema.
 *
 * The sections are exactly those of `NormalizedResumeData`
 * (`services/import/resume-ai.service.ts:101`) — no inferred fields, and no
 * second model asked what it thinks an entity is.
 */
export function buildEntities(data: any): ResumeLabEntities {
  const byType: ResumeLabEntityCount[] = [
    { type: 'profileFields', label: 'Profile fields', count: filledFields(data?.profile) },
    { type: 'contactFields', label: 'Contact fields', count: filledFields(data?.contactInfo) },
    { type: 'experiences', label: 'Experiences', count: arrayLength(data?.experiences) },
    { type: 'educations', label: 'Educations', count: arrayLength(data?.educations) },
    { type: 'projects', label: 'Projects', count: arrayLength(data?.projects) },
    { type: 'skills', label: 'Skills', count: arrayLength(data?.skills) },
    { type: 'skillGroups', label: 'Skill groups', count: arrayLength(data?.skillGroups) },
    { type: 'links', label: 'Links', count: arrayLength(data?.links) },
    { type: 'certifications', label: 'Certifications', count: arrayLength(data?.certifications) },
  ];

  const experiences: any[] = Array.isArray(data?.experiences) ? data.experiences : [];
  const projects: any[] = Array.isArray(data?.projects) ? data.projects : [];
  const skillGroups: any[] = Array.isArray(data?.skillGroups) ? data.skillGroups : [];

  const nested: ResumeLabEntityCount[] = [
    {
      type: 'experienceBullets',
      label: 'Experience bullets',
      count: experiences.reduce((sum, item) => sum + arrayLength(item?.bullets), 0),
    },
    {
      type: 'projectTechnologies',
      label: 'Project technologies',
      count: projects.reduce((sum, item) => sum + arrayLength(item?.technologies), 0),
    },
    {
      type: 'groupedSkills',
      label: 'Skills inside groups',
      count: skillGroups.reduce((sum, item) => sum + arrayLength(item?.skills), 0),
    },
  ];

  return {
    total: byType.reduce((sum, entry) => sum + entry.count, 0),
    byType,
    nested,
    rule: ENTITY_RULE,
  };
}

/* ===========================================================================
 * Warnings
 * ======================================================================== */

export type WarningInput = {
  sizes: ResumeLabSizes;
  retention: ResumeLabRetention | null;
  entities: ResumeLabEntities | null;
  ai: ResumeLabAi | null;
  confidence: number | null;
  /** The model the shipped service stamps into its own result metadata. */
  reportedModel: string | null;
  maxUploadBytes: number;
};

/**
 * Deterministic diagnostics for one run.
 *
 * Every rule reads a number this run produced. None of them asks a model, and
 * none fires on behaviour that is merely normal: the `AgentRun` zero is `info`
 * because it is true of every import today, while an empty parse of a real
 * page of text is an `error` because something went wrong.
 */
export function buildWarnings(input: WarningInput): ResumeLabWarning[] {
  const warnings: ResumeLabWarning[] = [];
  const add = (
    code: string,
    severity: ResumeLabWarning['severity'],
    message: string,
    evidence: string | null = null
  ) => warnings.push({ code, severity, message, evidence });

  const { ai, sizes, retention, entities } = input;

  // --- Telemetry -----------------------------------------------------------
  if (ai !== null) {
    if (ai.usage.status === 'unavailable') {
      add(
        'telemetry-unavailable',
        'warning',
        'An AI stage ran and no provider usage reached the lab. Token counts and cost are unknown for this run, not zero.',
        null
      );
    }

    if (ai.usage.agentRunRecorded.input === 0 && ai.usage.agentRunRecorded.output === 0) {
      add(
        'agent-run-usage-not-propagated',
        'info',
        'The AgentRun row recorded 0 input and 0 output tokens. The shipped workflow runtime does not propagate provider usage into the record, so this zero describes the record, not the run.',
        ai.usage.status === 'observed'
          ? `provider reported ${ai.usage.totalTokens} tokens for the same run`
          : null
      );
    }

    const seen = new Map<string, number>();
    for (const call of ai.usage.calls) seen.set(call.stage, (seen.get(call.stage) ?? 0) + 1);
    for (const [stage, count] of seen) {
      if (count > 1) {
        add(
          'duplicate-stage-telemetry',
          'warning',
          `Stage ${stage} reported ${count} completions. This pipeline makes one call per stage, so another AI call was in flight in the same process and these totals may include it.`,
          `${count} completions`
        );
      }
    }

    for (const call of ai.usage.calls) {
      if (
        call.maxOutputTokens !== null &&
        call.outputTokens >= call.maxOutputTokens * NEAR_CAP_RATIO
      ) {
        add(
          'output-near-max-tokens',
          'warning',
          `Stage ${call.stage} produced ${call.outputTokens} output tokens against a configured cap of ${call.maxOutputTokens}. The completion may have been cut off.`,
          `${call.outputTokens} / ${call.maxOutputTokens}`
        );
      }
    }

    if (ai.cost.status === 'pricing-unavailable' || ai.cost.status === 'partial') {
      add(
        'pricing-unavailable',
        'warning',
        `No price on file for ${ai.cost.unpricedModels.join(', ')}. The cost shown excludes those calls.`,
        ai.cost.unpricedModels.join(', ')
      );
    }

    const actual = ai.models[0] ?? null;
    if (input.reportedModel !== null && actual !== null && input.reportedModel !== actual) {
      add(
        'model-constant-mismatch',
        'warning',
        `The parse result claims ${input.reportedModel} but the provider answered as ${actual}. The service stamps a constant of its own rather than the model the client resolved.`,
        `${input.reportedModel} vs ${actual}`
      );
    }
  }

  // --- Input and extraction ------------------------------------------------
  if (sizes.inputBytes >= input.maxUploadBytes * NEAR_CAP_RATIO) {
    add(
      'near-upload-limit',
      'info',
      `The input is ${sizes.inputBytes} bytes, close to the ${input.maxUploadBytes}-byte limit the product route enforces.`,
      `${sizes.inputBytes} / ${input.maxUploadBytes}`
    );
  }

  if (retention !== null && retention.droppedChars > 0) {
    add(
      'characters-dropped',
      'warning',
      `${retention.droppedChars} of ${retention.extractedChars} extracted characters never reached the parser.`,
      `${retention.keptPercent}% kept`
    );
  }

  if (sizes.extractedChars > 0 && sizes.extractedChars < THIN_EXTRACTION_CHARS) {
    add(
      'thin-extraction',
      'warning',
      `Only ${sizes.extractedChars} characters came out of ${sizes.pages ?? '?'} page(s). The parse ran, but it had little to work with.`,
      `${sizes.extractedChars} chars`
    );
  }

  // --- Parse result --------------------------------------------------------
  if (entities !== null) {
    if (entities.total === 0 && sizes.extractedChars >= THIN_EXTRACTION_CHARS) {
      add(
        'empty-parse',
        'error',
        `The parser returned no entities from ${sizes.extractedChars} characters of text.`,
        `${sizes.extractedChars} chars in, 0 entities out`
      );
    }

    const count = (type: string) => entities.byType.find((e) => e.type === type)?.count ?? 0;

    if (count('experiences') === 0) {
      add('no-experiences', 'warning', 'No work experience was parsed.', null);
    }
    if (count('skills') === 0) {
      add('no-skills', 'warning', 'No skills were parsed.', null);
    }
    if (count('educations') === 0) {
      add(
        'no-educations',
        'info',
        'No education was parsed. Plenty of resumes have none, so this is a note rather than a problem.',
        null
      );
    }
  }

  if (input.confidence !== null && input.confidence < LOW_CONFIDENCE) {
    add(
      'low-confidence',
      'warning',
      `The pipeline scored its own parse at ${input.confidence}.`,
      String(input.confidence)
    );
  }

  return warnings;
}

/* ===========================================================================
 * Raw payloads
 * ======================================================================== */

function payload(
  id: string,
  label: string,
  kind: ResumeLabPayload['kind'],
  stage: string,
  value: string,
  note: string
): ResumeLabPayload {
  const truncated = value.length > PAYLOAD_PREVIEW_CHARS;

  return {
    id,
    label,
    kind,
    stage,
    // The full value's size, which is the point of reporting it separately.
    chars: value.length,
    bytes: Buffer.byteLength(value, 'utf8'),
    preview: truncated ? value.slice(0, PAYLOAD_PREVIEW_CHARS) : value,
    truncated,
    note,
  };
}

export type PayloadInput = {
  extractedText: string;
  parserInput: string;
  parsedJson: string | null;
  stepMetas: unknown;
  observed: ObservedAiCall[];
};

/**
 * The diagnostic values this run held, and nothing it did not.
 *
 * What is here is text the operator supplied or the pipeline produced. What
 * is deliberately absent is in `missingPayloads` below: no prompts, no
 * provider request or response objects, no headers, no environment, no file
 * bytes. The uploaded PDF never becomes a payload — its text does, which is
 * what the parser saw.
 */
export function buildPayloads(input: PayloadInput): ResumeLabPayload[] {
  const payloads: ResumeLabPayload[] = [
    payload(
      'extracted-text',
      'Extracted text',
      'text',
      'extract',
      input.extractedText,
      'What the shipped `extractTextFromPDF` returned, verbatim.'
    ),
  ];

  // Identical today, and worth showing as its own payload precisely so the
  // day they differ is visible rather than inferred from a character count.
  payloads.push(
    payload(
      'parser-input',
      'Parser input',
      'text',
      'agent',
      input.parserInput,
      input.parserInput === input.extractedText
        ? 'Byte-for-byte the extracted text: the pipeline passes it through unchanged.'
        : 'What the agent was actually given, which differs from the extraction above.'
    )
  );

  if (input.parsedJson !== null) {
    payloads.push(
      payload(
        'parsed-resume',
        'Parsed resume (normalized and rewritten)',
        'json',
        'agent:finalize',
        input.parsedJson,
        'The agent’s returned output: normalized, then passed through the Follio rewrite. It is the only structured object the agent hands back.'
      )
    );
  }

  payloads.push(
    payload(
      'agent-steps',
      'Agent step metadata',
      'json',
      'agent',
      JSON.stringify(input.stepMetas ?? [], null, 2),
      'The AgentRun’s own `stepMetas`, as the runtime recorded them.'
    )
  );

  payloads.push(
    payload(
      'ai-telemetry',
      'Observed AI calls',
      'json',
      'ai-client',
      JSON.stringify(input.observed, null, 2),
      'Stage, model, token counts and duration, as the AI client reported them. The only fields the lab retains from the telemetry it observed.'
    )
  );

  return payloads;
}

/**
 * Payloads an operator might reasonably expect, and why this run has none.
 *
 * Listing them is the honest alternative to re-running a stage to
 * manufacture one.
 */
export function missingPayloads(): ResumeLabMissingPayload[] {
  return [
    {
      id: 'raw-parse-output',
      label: 'Raw model output (pre-normalization)',
      reason:
        'The agent keeps `ParsedResumeAI` in step memory and returns only the normalized object. Showing it would mean running the parse a second time, which would be a different call to a different response.',
    },
    {
      id: 'pre-rewrite-normalized',
      label: 'Normalized resume before the Follio rewrite',
      reason:
        'The `rewrite-for-follio` step overwrites the same memory key, so the pre-rewrite object is gone by the time the agent finalizes.',
    },
    {
      id: 'provider-exchange',
      label: 'Provider request and response',
      reason:
        'Deliberately not exposed. The request carries the system prompt and the client’s credentials context, and neither belongs in a diagnostic panel.',
    },
  ];
}
