/**
 * Product feature flags.
 *
 * Portfolio is opt-in via env so resume-only mode is the safe default until
 * portfolio is ready to ship again. Set NEXT_PUBLIC_PORTFOLIO_ENABLED=true to
 * re-enable all portfolio surfaces (UI, public pages, APIs, generation).
 */

import { AppError, ErrorCode } from '@/lib/errors';

/** Whether the portfolio product surface is enabled. */
export function isPortfolioEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED === 'true';
}

/**
 * Throw a 404 when portfolio is disabled.
 * Use at the top of portfolio API handlers for a single, consistent gate.
 */
export function assertPortfolioEnabled(): void {
  if (!isPortfolioEnabled()) {
    throw new AppError('Portfolio is currently unavailable', ErrorCode.NOT_FOUND, 404);
  }
}

/**
 * Whether resume analysis runs the multi-agent orchestrator instead of the
 * single-agent Resume Agent.
 *
 * Deliberately **not** `NEXT_PUBLIC_`: unlike the portfolio flag, nothing in
 * the browser may decide which engine runs. The client never sends it and
 * never reads it — the server picks the engine and reports which one it used
 * in the response, so the UI can label the result without being able to
 * influence it.
 *
 * Off by default. The orchestrator spends roughly twice the tokens of the
 * single-agent path, so an unset variable must mean the cheaper, older,
 * known-good behaviour.
 */
export function isMultiAgentResumeEnabled(): boolean {
  return process.env.FOLLIO_MULTI_AGENT_ENABLED === 'true';
}
