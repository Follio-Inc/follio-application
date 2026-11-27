/**
 * Which resume-analysis engine serves a request.
 *
 * Its own module rather than an inline check in the route, for two reasons.
 * The decision is a product concept — "is the multi-agent system live?" — and
 * belongs with the multi-agent feature rather than buried in a handler; and
 * putting it here means the `resume-multi-agent` coverage-map entry owns the
 * file where its own flag is enforced, which is what the platform scan checks
 * when it verifies that a declared flag actually gates something.
 *
 * The choice is made entirely server-side. Nothing in the request influences
 * it, and the result is reported back to the client only so the UI can label
 * which engine produced a result.
 */

import { isMultiAgentResumeEnabled } from '@/lib/features';

/** Which implementation served a request. */
export type AnalysisEngine = 'single-agent' | 'multi-agent';

/**
 * Pick the engine for this request.
 *
 * Defaults to the single-agent Resume Agent: the orchestrated path costs
 * roughly twice the tokens, so an unset flag must mean the cheaper,
 * known-good behaviour rather than the newer one.
 */
export function selectAnalysisEngine(): AnalysisEngine {
  return isMultiAgentResumeEnabled() ? 'multi-agent' : 'single-agent';
}
