/**
 * Resume lab comparison types (PLATFORM_TODO item 23).
 *
 * Client-safe: types only. Item 23 is "run comparison (two runs; AI vs
 * openresume)", and its Note settles which two:
 *
 * > `resume-openresume.service.ts` is currently dead code with no importers.
 * > The lab becomes its first consumer, so treat it as an untested baseline
 * > and say so in the UI.
 *
 * So the comparison is the shipped AI import against a legacy parser nothing
 * ships. The lab is its only caller, and that does not make it product code.
 */

import type { ResumeLabAi, ResumeLabEntities, ResumeLabWarning } from './types';

/** Which of the two sides a value came from. */
export type ParserSide = 'ai' | 'openResume';

/** How a side's run ended. Independent of the other side. */
export type ParserOutcome = 'parsed' | 'failed' | 'not-run';

/**
 * One parser's run, reported on its own terms.
 *
 * `ai` is only ever populated for the AI side: a parser that calls no model
 * has no token usage and no cost, and giving it a zeroed `ResumeLabAi` would
 * state something false about it.
 */
export type ParserRun = {
  side: ParserSide;
  /** What the lab called, exactly, so a reader need not guess. */
  implementation: string;
  outcome: ParserOutcome;
  /** Wall-clock for this side alone, measured around its own call. */
  durationMs: number;
  /** Sub-stages, where the parser genuinely exposes them. Empty otherwise. */
  stages: { id: string; label: string; ms: number; detail: string }[];
  entities: ResumeLabEntities | null;
  /** The parser's own self-reported confidence, on its own scale. */
  confidence: number | null;
  /** The method name the parser stamps into its result. */
  parseMethod: string | null;
  /** Token usage, models and cost. Null for any parser that calls no model. */
  ai: ResumeLabAi | null;
  /** Why `ai` is null, so an empty section is never read as "free". */
  aiNote: string;
  /** The normalized result, pretty-printed. Null when the side failed. */
  json: string | null;
  error: string | null;
  note: string;
};

/**
 * How two values of one scalar field relate.
 *
 * `not-comparable` is a first-class state, not a fallback: two parsers'
 * self-reported confidences are both numbers and mean different things.
 */
export type FieldState =
  | 'same'
  | 'different'
  | 'ai-only'
  | 'openresume-only'
  | 'missing-from-both'
  | 'not-comparable';

export type FieldDifference = {
  field: string;
  label: string;
  state: FieldState;
  ai: string | null;
  openResume: string | null;
  /** Why this field is in the state it is in. */
  rule: string;
};

/**
 * One section of the normalized schema, compared.
 *
 * `overlap + aiOnly` is always `aiCount` after de-duplication, and likewise
 * for the other side. The de-duplicated counts are reported separately from
 * the raw ones so a parser that emitted the same record twice is visible
 * rather than hidden by the matching.
 */
export type EntityComparison = {
  type: string;
  label: string;
  aiCount: number;
  openResumeCount: number;
  aiDistinct: number;
  openResumeDistinct: number;
  overlap: number;
  aiOnly: number;
  openResumeOnly: number;
  /** A few examples from each exclusive set, for an operator to eyeball. */
  aiOnlyExamples: string[];
  openResumeOnlyExamples: string[];
  /** The key two records must share to count as the same record. */
  matchRule: string;
};

/** A field one schema has and the other does not. */
export type UncomparableField = {
  field: string;
  side: ParserSide | 'both';
  reason: string;
};

export type ResumeComparisonSummary = {
  /** SHA-256 of the bytes both parsers received. The same-input guarantee. */
  sourceSha256: string;
  sourceBytes: number;
  /** Both ran, or which one did. */
  bothSucceeded: boolean;
  /** Wall-clock around the whole comparison, both runs included. */
  totalMs: number;
  /** Why the two runs are sequential rather than concurrent. */
  executionNote: string;
};

export type ResumeComparison = {
  summary: ResumeComparisonSummary;
  entities: EntityComparison[];
  fields: FieldDifference[];
  uncomparable: UncomparableField[];
  /** How each parser's output was projected for comparison. */
  projectionNote: string;
};

/**
 * What a comparison run returns.
 *
 * There is deliberately no score and no winner. The item asks for a
 * comparison; deciding which parser is better from these numbers is a
 * judgement a person makes, and a number invented here would only launder it.
 */
export type ResumeComparisonResult = {
  source: 'fixture' | 'upload';
  inputLabel: string;
  /** Set when the request never reached either parser. */
  outcome: 'compared' | 'gate-closed' | 'no-input' | 'unknown-fixture' | 'not-a-pdf' | 'too-large';
  detail: string;
  ai: ParserRun | null;
  openResume: ParserRun | null;
  comparison: ResumeComparison | null;
  warnings: ResumeLabWarning[];
};
