/**
 * Resume lab module (PLATFORM_TODO item 21).
 *
 * `runner.ts` is **server-only**: it reads a fixture from disk and calls the
 * shipped resume-import pipeline. `types.ts` is client-safe, and the lab's
 * view imports only that.
 */

export {
  ACCEPTED_TYPE,
  MAX_UPLOAD_BYTES,
  buildResumeLabView,
  listResumeLabFixtures,
  runResumeLab,
} from './runner';
export type { ResumeLabInput, ResumeLabRunOptions, ResumeLabViewOptions } from './runner';
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
} from './types';
