/**
 * Performance identities (PLATFORM_TODO item 27).
 *
 * Client-safe: this module and everything it imports are free of `node:`,
 * because the regression badges are rendered by client components and they
 * must not drag the baseline store into a browser bundle.
 */

import { testIdentity } from '../tests/identity';
import type { PerfSource } from './types';

export { testIdentity };

/** `vitest:` / `live-qa:` prefixed test identity. */
export function perfTestId(
  source: Extract<PerfSource, 'vitest' | 'live-qa'>,
  test: { file: string | null; suite: string[]; name: string }
): string {
  return `${source}:${testIdentity(test)}`;
}

/**
 * A lab stage's identity.
 *
 * `side` separates the two parsers in the comparison so their series never
 * merge. Passing no side is the single-run lab, which has one pipeline.
 */
export function perfStageId(labId: string, stageId: string, side?: string): string {
  return side === undefined ? `lab:${labId}:${stageId}` : `lab:${labId}:${side}:${stageId}`;
}
