/**
 * Resume lab module (PLATFORM_TODO item 21).
 *
 * `runner.ts`, `telemetry.ts` and `diagnostics.ts` are **server-only**:
 * they read a fixture from disk, call the shipped resume-import pipeline and
 * import product modules. `types.ts`, `pricing.ts`, `comparison-types.ts`
 * and `comparison.ts` are client-safe, and the lab's view imports only those.
 *
 * **`compare-runner.ts` and `openresume.ts` are deliberately not re-exported
 * here.** They reach the OpenResume parser, whose `read-pdf.ts` spawns
 * `node scripts/parse-pdf.cjs`; Next's module tracer evaluates that path and
 * fails to resolve it, which turns every page importing this barrel into a
 * 500. That is a real property of the dead code item 23 is the first to
 * consume, and the containment is to keep it out of the shared entry point:
 * only the comparison route imports `./compare-runner`, and it imports it
 * directly, so the blast radius is one endpoint rather than the whole lab.
 * `compare-runner.ts` has the full account.
 *
 * The comparison's **types** are re-exported below and are safe: a type
 * import carries nothing into the runtime graph.
 */

export {
  ACCEPTED_TYPE,
  MAX_UPLOAD_BYTES,
  buildResumeLabView,
  listResumeLabFixtures,
  runResumeLab,
} from './runner';
export { resolveResumeLabInput } from './runner';
export type {
  ResolvedInput,
  ResumeLabInput,
  ResumeLabRunOptions,
  ResumeLabViewOptions,
  UsageProbe,
} from './runner';
export { PAYLOAD_PREVIEW_CHARS, buildEntities, buildWarnings } from './diagnostics';
export {
  MODEL_PRICING,
  PRICING_RECORDED_ON,
  PRICING_SOURCE,
  costForRun,
  priceFor,
} from './pricing';
export { RESUME_PIPELINE_STAGES, createUsageProbe } from './telemetry';
export {
  PROJECTION_NOTE,
  SECTIONS,
  buildComparison,
  buildComparisonWarnings,
  normalizeKey,
} from './comparison';
export type {
  EntityComparison,
  FieldDifference,
  FieldState,
  ParserOutcome,
  ParserRun,
  ParserSide,
  ResumeComparison,
  ResumeComparisonResult,
  ResumeComparisonSummary,
  UncomparableField,
} from './comparison-types';
// Type-only, so neither module enters the runtime graph.
export type { ResumeComparisonOptions } from './compare-runner';
export type { OpenResumeOptions } from './openresume';
export type { ObservedAiCall } from './telemetry';
export type {
  ResumeLabFixture,
  ResumeLabOutcome,
  ResumeLabParsed,
  ResumeLabRetention,
  ResumeLabRunResult,
  ResumeLabSizes,
  ResumeLabSource,
  ResumeLabStage,
  ResumeLabTiming,
  ResumeLabTokens,
  ResumeLabView,
  ResumeLabAi,
  ResumeLabAiCall,
  ResumeLabCost,
  ResumeLabCostStatus,
  ResumeLabEntities,
  ResumeLabEntityCount,
  ResumeLabMissingPayload,
  ResumeLabPayload,
  ResumeLabPayloadKind,
  ResumeLabUsage,
  ResumeLabUsageStatus,
  ResumeLabWarning,
  ResumeLabWarningSeverity,
} from './types';
