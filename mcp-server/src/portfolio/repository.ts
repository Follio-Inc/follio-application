/**
 * Read-only access to portfolio data.
 *
 * The only seam between the MCP tools and where portfolios come from. Today it
 * reads the synthetic fixtures; when real Follio data arrives, this module
 * gains an async implementation and the tool code is unchanged.
 *
 * There are no write functions here, by design.
 */

import { DEFAULT_PORTFOLIO_HANDLE, SYNTHETIC_PORTFOLIOS } from './data.js';
import type { Portfolio } from './types.js';

export { DEFAULT_PORTFOLIO_HANDLE };

/** Every handle this server can serve, in a stable order. */
export function listPortfolioHandles(): string[] {
  return Object.keys(SYNTHETIC_PORTFOLIOS).sort();
}

/**
 * Normalise a caller-supplied handle.
 *
 * Handles are lower-case slugs, and a model may well pass `"Riley-Chen"` or a
 * value with stray whitespace. A leading `@` is tolerated because that is how
 * handles are written in prose.
 */
export function normalizePortfolioHandle(handle: string): string {
  return handle.trim().replace(/^@+/, '').toLowerCase();
}

/**
 * The portfolio for `handle`, or `null` when there is none.
 *
 * Returning `null` rather than throwing keeps "no such portfolio" an ordinary
 * outcome the tool reports to the model, not a server fault.
 */
export function getPortfolioByHandle(handle: string): Portfolio | null {
  const normalized = normalizePortfolioHandle(handle);
  if (!normalized) return null;
  // Own-property check only: `constructor` or `toString` must not resolve.
  if (!Object.hasOwn(SYNTHETIC_PORTFOLIOS, normalized)) return null;
  return SYNTHETIC_PORTFOLIOS[normalized] ?? null;
}

/**
 * The portfolio used when a caller names no handle.
 *
 * `null` would mean the fixtures are missing their own default, which is a
 * packaging fault rather than a user error, so callers surface it as
 * "portfolio data unavailable".
 */
export function getDefaultPortfolio(): Portfolio | null {
  return getPortfolioByHandle(DEFAULT_PORTFOLIO_HANDLE);
}
