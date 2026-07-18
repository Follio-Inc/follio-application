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
