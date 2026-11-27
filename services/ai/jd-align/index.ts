/**
 * Resume ↔ job alignment, the /match screen.
 * Routes call alignResumeToJob. Highlights are grounded here. Keyword
 * overlap is counted by evaluate, and the recruiter read comes from judge.
 */

export { alignResumeToJob } from './align';
export { groundAlignment } from './ground';
export { JD_ALIGN_LIMITS, explainAlignInput } from './limits';
export { locateQuote } from './locate';
export type { AlignAspect, AlignEvidence, AlignStatus, JdAlignResult } from './types';
